import type { VirtualFile } from '../input/virtual-file'
import { GIFDecoder } from '../formats/gif/gif-decoder'
import { APNGDecoder } from '../formats/apng/apng-decoder'
import { WebPDecoder } from '../formats/webp/webp-decoder'
import type { GIFResponse } from '../formats/gif/gif-worker-protocol'
import type { APNGResponse } from '../formats/apng/apng-worker-protocol'
import type { WorkerResponse } from '../formats/webp/webp-worker-protocol'
import { MediaError } from '../media/errors'
import { CONVERSION_LIMITS, ConversionError, validateCanonicalMetadata } from './model'
import type { AnimationFrameSource, CanonicalAnimationFrame, CanonicalAnimationMetadata, ConversionFormat, SourceMetrics } from './model'

type DecoderResponse = GIFResponse | APNGResponse | WorkerResponse
export interface DecoderTransport {
  open(file: VirtualFile): Promise<DecoderResponse>
  next(): Promise<DecoderResponse>
  reset(): Promise<DecoderResponse>
  close(): Promise<DecoderResponse>
  dispose(): void
}
export type DecoderTransportFactory = (format: ConversionFormat) => DecoderTransport

function createTransport(format: ConversionFormat): DecoderTransport {
  switch (format) {
    case 'gif': return new GIFDecoder()
    case 'apng': return new APNGDecoder({ canonicalRGBA: true })
    case 'webp': return new WebPDecoder()
    default: throw new ConversionError('SOURCE_UNSUPPORTED')
  }
}

function sourceError(cause: unknown, cancelled = false): ConversionError {
  if (cancelled) return new ConversionError('CANCELLED')
  if (cause instanceof ConversionError) return cause
  if (cause instanceof MediaError) {
    if (cause.code === 'WORKER_FAILED') return new ConversionError('WORKER_FAILED', { cause })
    if (cause.code === 'RESOURCE_LIMIT_EXCEEDED' || cause.code === 'OUT_OF_MEMORY') return new ConversionError('RESOURCE_LIMIT', { cause })
    if (cause.code === 'UNSUPPORTED_FORMAT' || cause.code.endsWith('RUNTIME_UNAVAILABLE') || cause.code === 'WASM_UNAVAILABLE') {
      return new ConversionError('SOURCE_UNSUPPORTED', { cause })
    }
  }
  return new ConversionError('SOURCE_DECODE_FAILED', { cause })
}

/** Race borrowed provider/decode work without waiting for an uninterruptible file read. */
function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ConversionError('CANCELLED'))
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted) abort()
  })
}

/** Reuses the viewer's Worker codecs, but bypasses its ImageData/cache/player adapters. */
class WorkerFrameSource implements AnimationFrameSource {
  private index = 0
  private busy = false
  private ended = false
  private closed = false
  private closing: Promise<void> | undefined
  private held: ArrayBuffer | undefined
  private statistics: SourceMetrics
  constructor(readonly metadata: CanonicalAnimationMetadata, private readonly transport: DecoderTransport,
    private readonly signal: AbortSignal | undefined, initialHeapBytes: number, private readonly detachAbort: () => void) {
    this.statistics = { decodeMs: 0, decoderHeapBytes: initialHeapBytes, decoderBackupBytes: 0, directRgbaFrames: 0, canvasReadbackFrames: 0 }
  }
  get metrics() { return this.statistics }
  private checkAvailable() {
    if (this.signal?.aborted) throw new ConversionError('CANCELLED')
    if (this.closed || this.busy || this.held) throw new ConversionError('SOURCE_DECODE_FAILED')
  }
  async next(): Promise<CanonicalAnimationFrame | null> {
    this.checkAvailable()
    if (this.ended) return null
    this.busy = true
    try {
      const response = await abortable(this.transport.next(), this.signal)
      if (this.closed || this.signal?.aborted) throw new ConversionError('CANCELLED')
      if (response.type === 'end') {
        if (this.index !== this.metadata.frameCount) throw new ConversionError('SOURCE_DECODE_FAILED')
        this.ended = true
        return null
      }
      if (response.type !== 'frame' || response.frameIndex !== this.index || this.index >= this.metadata.frameCount
        || response.width !== this.metadata.width || response.height !== this.metadata.height
        || !(response.rgba instanceof ArrayBuffer) || response.rgba.byteLength !== response.width * response.height * 4
        || !Number.isFinite(response.durationMs) || response.durationMs < 0 || response.durationMs > 655350
        || !Number.isFinite(response.decodeMs) || response.decodeMs < 0) throw new ConversionError('SOURCE_DECODE_FAILED')
      this.statistics = { decodeMs: this.statistics.decodeMs + response.decodeMs,
        decoderHeapBytes: Math.max(this.statistics.decoderHeapBytes, 'heapBytes' in response ? response.heapBytes : 0),
        decoderBackupBytes: Math.max(this.statistics.decoderBackupBytes, 'backupBytes' in response ? response.backupBytes : 0),
        directRgbaFrames: (this.statistics.directRgbaFrames ?? 0) + ('pixelPath' in response && response.pixelPath === 'direct-rgba' ? 1 : 0),
        canvasReadbackFrames: (this.statistics.canvasReadbackFrames ?? 0) + ('pixelPath' in response && response.pixelPath === 'canvas' ? 1 : 0) }
      this.held = response.rgba
      return { index: this.index++, durationMs: response.durationMs, rgba: response.rgba }
    } catch (cause) {
      const error = sourceError(cause, this.closed || !!this.signal?.aborted)
      await this.close()
      throw error
    } finally { this.busy = false }
  }
  acknowledgeFrame() {
    // Transfer alone is insufficient: broker calls this only after encoder acceptance.
    if (this.closed || this.busy || !this.held || this.held.byteLength !== 0) throw new ConversionError('SOURCE_DECODE_FAILED')
    this.held = undefined
  }
  async reset() {
    this.checkAvailable()
    this.busy = true
    try {
      const response = await abortable(this.transport.reset(), this.signal)
      if (this.closed || this.signal?.aborted) throw new ConversionError('CANCELLED')
      if (response.type !== 'reset') throw new ConversionError('SOURCE_DECODE_FAILED')
      this.index = 0; this.ended = false
    } catch (cause) {
      const error = sourceError(cause, this.closed || !!this.signal?.aborted)
      await this.close()
      throw error
    } finally { this.busy = false }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; this.held = undefined; this.detachAbort()
    // Pending raw transport work cannot be joined by a second command; terminate it.
    if (this.busy || this.signal?.aborted) {
      this.transport.dispose()
      this.closing = Promise.resolve()
    } else {
      this.closing = this.transport.close().then(() => {}).catch(() => {}).finally(() => this.transport.dispose())
    }
    return this.closing
  }
}

/** The VirtualFile is borrowed; only decoder resources are owned/released here. */
export async function openAnimationFrameSource(file: VirtualFile, format: ConversionFormat, signal?: AbortSignal,
  factory: DecoderTransportFactory = createTransport): Promise<AnimationFrameSource> {
  if (signal?.aborted) throw new ConversionError('CANCELLED')
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > CONVERSION_LIMITS.maxSourceBytes) throw new ConversionError('RESOURCE_LIMIT')
  let transport: DecoderTransport
  try { transport = factory(format) } catch (cause) { throw sourceError(cause) }
  let source: AnimationFrameSource | undefined
  const abort = () => { if (source) void source.close(); else transport.dispose() }
  signal?.addEventListener('abort', abort, { once: true })
  const detachAbort = () => signal?.removeEventListener('abort', abort)
  try {
    const ready = await abortable(transport.open(file), signal)
    if (signal?.aborted) throw new ConversionError('CANCELLED')
    if (ready.type !== 'ready') throw new ConversionError('SOURCE_DECODE_FAILED')
    // Existing GIF parser maps repeats+1, APNG num_plays and WebP ANIM are total plays.
    // WebP container specifies LoopCount-1 repetitions after the first play.
    const metadata = { width: ready.metadata.width, height: ready.metadata.height,
      frameCount: ready.metadata.frameCount, playCount: ready.metadata.loopCount }
    validateCanonicalMetadata(metadata)
    source = new WorkerFrameSource(metadata, transport, signal, 'heapBytes' in ready ? ready.heapBytes : 0, detachAbort)
    return source
  } catch (cause) {
    detachAbort(); transport.dispose()
    throw sourceError(cause, !!signal?.aborted)
  }
}
