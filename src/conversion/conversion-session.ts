import { BinaryFormatDetector } from '../formats/binary-detector'
import type { FormatDetector } from '../formats/detector'
import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'
import { countRuntimeEvent } from '../media/runtime-diagnostics'
import { createAnimationDownloadNamer } from '../creation/download-name'
import { ConversionJob } from './convert'
import type { ConversionDependencies, ConversionProgress } from './convert'
import { EncoderWorkerClient } from './encoder-client'
import { openAnimationFrameSource } from './frame-source'
import { inspectConversionOutput } from './output-inspection'
import { CONVERSION_LIMITS, ConversionError, validateCanonicalMetadata } from './model'
import type { AnimationFrameSource, CanonicalAnimationMetadata, ConversionErrorCode, ConversionFormat, EncoderMetrics } from './model'

export const formatLabel = (format: ConversionFormat) => format === 'webp' ? 'Animated WebP' : format.toUpperCase()
export const conversionBusy = (status: string) => ['preparing', 'converting', 'verifying', 'cancelling'].includes(status)
export interface ConversionMetadata extends CanonicalAnimationMetadata { readonly durationMs: number | null }
export interface ConversionProductResult {
  readonly blob: Blob; readonly url: string; readonly filename: string; readonly format: ConversionFormat
  readonly metadata: ConversionMetadata; readonly metrics: EncoderMetrics
}
const initialDiagnostics = () => ({ conversionsStarted: 0, conversionsCompleted: 0, cancellations: 0,
  activeDecoderWorkers: 0, activeEncoderWorkers: 0, peakRgbaFrames: 0, lastOutputBytes: 0,
  activeObjectUrls: 0, cleanupErrors: 0, wasmLiveAllocBytes: 0 })
export interface ConversionSnapshot {
  readonly status: 'preparing' | 'ready' | 'converting' | 'verifying' | 'cancelling' | 'cancelled' | 'success' | 'error'
  readonly source?: ConversionMetadata | undefined; readonly sourceFormat?: ConversionFormat | undefined
  readonly target: ConversionFormat; readonly deflate: boolean | null; readonly jobId: number
  readonly progress?: ConversionProgress | undefined; readonly result?: ConversionProductResult | undefined
  readonly error?: ConversionErrorCode | undefined; readonly diagnostics: ReturnType<typeof initialDiagnostics>
}
interface Dependencies {
  readonly detector?: FormatDetector
  readonly pipeline?: ConversionDependencies
  readonly inspect?: typeof inspectConversionOutput
  readonly createUrl?: (blob: Blob) => string
  readonly revokeUrl?: (url: string) => void
}
export function conversionErrorMessage(code: ConversionErrorCode, target: ConversionFormat = 'apng') {
  switch (code) {
    case 'RESOURCE_LIMIT': return 'This animation is too large to convert safely in the browser.'
    case 'SOURCE_UNSUPPORTED': return 'Choose a GIF, animated WebP or APNG animation.'
    case 'SOURCE_DECODE_FAILED': return 'The source animation could not be read or decoded. Try another file.'
    case 'TARGET_ENCODER_UNSUPPORTED': return `${formatLabel(target)} encoding is not supported in this browser.`
    case 'TARGET_ENCODE_FAILED': return 'The output animation could not be created or verified. Try again.'
    case 'WORKER_FAILED': return 'Animation processing stopped unexpectedly. Try again.'
    case 'CANCELLED': return 'Conversion cancelled. Your source and target are retained.'
  }
}
function errorCode(cause: unknown, fallback: ConversionErrorCode = 'SOURCE_DECODE_FAILED'): ConversionErrorCode {
  if (cause instanceof ConversionError) return cause.code
  if (cause instanceof MediaError && (cause.code === 'RESOURCE_LIMIT_EXCEEDED' || cause.code === 'OUT_OF_MEMORY')) return 'RESOURCE_LIMIT'
  if (cause instanceof MediaError && cause.code === 'WORKER_FAILED') return 'WORKER_FAILED'
  return fallback
}
export const resultVirtualFile = (result: ConversionProductResult): VirtualFile => ({ name: result.filename, size: result.blob.size,
  source: 'file', mimeType: result.blob.type, read: (start, end) => result.blob.slice(start, end).arrayBuffer() })

/** Borrows one source; owns jobs, one encoded result and URL, never decoded frame history. */
export class ConversionSession {
  private state: ConversionSnapshot = { status: 'preparing', target: 'webp', deflate: null, jobId: 0, diagnostics: initialDiagnostics() }
  private readonly listeners = new Set<() => void>()
  private readonly detector: FormatDetector
  private readonly pipeline: ConversionDependencies
  private readonly inspect: typeof inspectConversionOutput
  private readonly createUrl: (blob: Blob) => string
  private readonly revokeUrl: (url: string) => void
  private readonly job: ConversionJob
  private generation = 0
  private abort: AbortController | undefined
  private preparing: Promise<void> | undefined
  private task: Promise<void> | undefined
  private disposal: Promise<void> | undefined
  private disposed = false
  private namer: (() => string) | undefined
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  constructor(readonly file: VirtualFile, dependencies: Dependencies = {}) {
    this.detector = dependencies.detector ?? new BinaryFormatDetector()
    this.inspect = dependencies.inspect ?? inspectConversionOutput
    this.createUrl = dependencies.createUrl ?? (blob => URL.createObjectURL(blob))
    this.revokeUrl = dependencies.revokeUrl ?? (url => URL.revokeObjectURL(url))
    const base = dependencies.pipeline ?? { source: openAnimationFrameSource, encoder: () => new EncoderWorkerClient() }
    this.pipeline = {
      source: async (file, format, signal) => {
        this.count('activeDecoderWorkers', 1)
        let released = false
        const release = () => { if (!released) { released = true; this.count('activeDecoderWorkers', -1) } }
        try {
          const source = await base.source(file, format, signal)
          return { get metadata() { return source.metadata }, get metrics() { return source.metrics },
            next: () => source.next(), reset: () => source.reset(), acknowledgeFrame: () => source.acknowledgeFrame(),
            close: async () => { try { await source.close() } finally { release() } } }
        } catch (cause) { release(); throw cause }
      },
      encoder: () => {
        const encoder = base.encoder(); this.count('activeEncoderWorkers', 1)
        let released = false
        return { capabilities: encoder.capabilities, open: (target, metadata) => encoder.open(target, metadata),
          addFrame: frame => encoder.addFrame(frame), finish: () => encoder.finish(),
          dispose: () => { if (!released) { released = true; try { encoder.dispose() } finally { this.count('activeEncoderWorkers', -1) } } } }
      },
    }
    this.job = new ConversionJob(this.pipeline)
  }
  private publish(patch: Partial<ConversionSnapshot>) {
    this.state = { ...this.state, ...patch }
    if (!this.disposed) for (const listener of this.listeners) listener()
  }
  private count(key: keyof ReturnType<typeof initialDiagnostics>, delta: number) {
    this.publish({ diagnostics: { ...this.state.diagnostics, [key]: this.state.diagnostics[key] + delta } })
  }
  private valid(id: number) { return !this.disposed && id === this.generation }
  private revoke(result?: ConversionProductResult) {
    if (!result) return
    try { this.revokeUrl(result.url) } catch { this.count('cleanupErrors', 1); countRuntimeEvent('cleanupErrors') }
    this.count('activeObjectUrls', -1)
  }
  prepare(): Promise<void> {
    if (this.preparing || this.disposed) return this.preparing ?? Promise.resolve()
    const id = ++this.generation, abort = new AbortController(); this.abort = abort
    this.preparing = (async () => {
      let source: AnimationFrameSource | undefined
      try {
        if (this.file.size > CONVERSION_LIMITS.maxSourceBytes) throw new ConversionError('RESOURCE_LIMIT')
        const detected = await this.detector.detect(this.file, abort.signal)
        if (!this.valid(id)) return
        if (!('animated' in detected) || !detected.animated || !['gif', 'webp', 'apng'].includes(detected.kind)) throw new ConversionError('SOURCE_UNSUPPORTED')
        const format = detected.kind as ConversionFormat
        source = await this.pipeline.source(this.file, format, abort.signal)
        if (!this.valid(id)) return
        this.publish({ source: { ...source.metadata, durationMs: null }, sourceFormat: format, target: format === 'gif' ? 'webp' : 'gif' })
        validateCanonicalMetadata(source.metadata)
        await source.close(); source = undefined
        const probe = this.pipeline.encoder()
        const stop = () => probe.dispose(); abort.signal.addEventListener('abort', stop, { once: true })
        try {
          await probe.open('gif', { width: 1, height: 1, frameCount: 1, playCount: 1 })
          if (this.valid(id)) this.publish({ deflate: probe.capabilities.deflate, status: 'ready' })
        } finally { abort.signal.removeEventListener('abort', stop); probe.dispose() }
      } catch (cause) { if (this.valid(id)) this.publish({ status: 'error', error: errorCode(cause) }) }
      finally { await source?.close(); if (this.abort === abort) this.abort = undefined }
    })()
    return this.preparing
  }
  selectTarget(target: ConversionFormat) {
    if (this.disposed || conversionBusy(this.state.status) || !this.state.source || target === this.state.sourceFormat
      || !['gif', 'webp', 'apng'].includes(target) || (target === 'apng' && !this.state.deflate)) return
    if (target === this.state.target) return
    const previous = this.state.result
    this.publish({ target, result: undefined, status: 'ready', error: undefined, progress: undefined })
    this.revoke(previous)
  }
  start(): Promise<void> {
    if (this.disposed || conversionBusy(this.state.status) || !this.state.source || !this.state.sourceFormat || this.state.deflate === null) return Promise.resolve()
    const { target, sourceFormat, source } = this.state
    if (target === sourceFormat) return Promise.resolve()
    if (target === 'apng' && !this.state.deflate) { this.publish({ error: 'TARGET_ENCODER_UNSUPPORTED', status: 'error' }); return Promise.resolve() }
    const id = ++this.generation, abort = new AbortController(); this.abort = abort
    this.publish({ status: 'converting', error: undefined, progress: undefined, jobId: id })
    this.count('conversionsStarted', 1)
    this.task = (async () => {
      let durationMs = 0, expectedOutputDuration = 0
      try {
        const output = await this.job.run(this.file, sourceFormat, target, {
          inspectFrame: frame => {
            durationMs += frame.durationMs
            const quantized = Math.round(frame.durationMs / 10) * 10
            expectedOutputDuration += target === 'gif' ? quantized < 20 ? 100 : quantized : frame.durationMs
          },
          onProgress: progress => {
            if (!this.valid(id)) return
            this.publish({ progress, diagnostics: { ...this.state.diagnostics, peakRgbaFrames: Math.max(this.state.diagnostics.peakRgbaFrames, progress.phase === 'encoding' ? 1 : 0) } })
          },
        })
        if (!this.valid(id)) return
        this.publish({ status: 'verifying', source: { ...source, durationMs } })
        const blob = new Blob([new Uint8Array(output.data, 0, output.byteLength)], { type: target === 'gif' ? 'image/gif' : target === 'webp' ? 'image/webp' : 'image/png' })
        const extension = target === 'apng' ? 'png' : target
        const namer = createAnimationDownloadNamer(this.file.name, extension)
        const file: VirtualFile = { name: namer(), size: blob.size, source: 'file', read: (start, end) => blob.slice(start, end).arrayBuffer() }
        let metadata: ConversionMetadata
        try {
          const detected = await this.detector.detect(file, abort.signal)
          if (detected.kind !== target || !('animated' in detected) || !detected.animated) throw new ConversionError('TARGET_ENCODE_FAILED')
          metadata = await this.inspect(file, target, abort.signal, this.pipeline.source)
          if (metadata.width !== source.width || metadata.height !== source.height || metadata.playCount !== source.playCount
            || (target === 'webp' ? metadata.frameCount > source.frameCount : metadata.frameCount !== source.frameCount)
            || metadata.durationMs === null || Math.abs(metadata.durationMs - expectedOutputDuration) > 1) throw new ConversionError('TARGET_ENCODE_FAILED')
        } catch (cause) { throw abort.signal.aborted ? new ConversionError('CANCELLED') : cause instanceof ConversionError && cause.code === 'WORKER_FAILED' ? cause : new ConversionError('TARGET_ENCODE_FAILED', { cause }) }
        if (!this.valid(id)) return
        const result: ConversionProductResult = { blob, url: this.createUrl(blob), filename: file.name, format: target, metadata, metrics: output.metrics }
        const previous = this.state.result; this.namer = namer
        this.publish({ result, status: 'success', diagnostics: { ...this.state.diagnostics, conversionsCompleted: this.state.diagnostics.conversionsCompleted + 1,
          lastOutputBytes: blob.size, activeObjectUrls: this.state.diagnostics.activeObjectUrls + 1,
          peakRgbaFrames: Math.max(this.state.diagnostics.peakRgbaFrames, output.peakRgbaFrames), wasmLiveAllocBytes: output.metrics.wasmLiveAllocBytes ?? 0 } })
        this.revoke(previous)
      } catch (cause) {
        if (this.valid(id)) this.publish({ status: abort.signal.aborted ? 'cancelled' : 'error', error: abort.signal.aborted ? undefined : errorCode(cause, 'TARGET_ENCODE_FAILED') })
      } finally { if (this.abort === abort) this.abort = undefined }
    })()
    return this.task
  }
  async cancel() {
    if (this.disposed || !this.task || !['converting', 'verifying'].includes(this.state.status)) return
    ++this.generation; this.abort?.abort(); this.job.cancel()
    this.publish({ status: 'cancelling' }); this.count('cancellations', 1)
    await this.task
    if (!this.disposed) this.publish({ status: 'cancelled', error: undefined, progress: undefined })
  }
  nextDownloadName() { return this.namer?.() ?? '' }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal
    this.disposed = true; ++this.generation; this.abort?.abort(); this.job.cancel()
    this.disposal = (async () => {
      await this.preparing; await this.task
      this.revoke(this.state.result); this.publish({ result: undefined }); this.listeners.clear()
    })()
    return this.disposal
  }
}
