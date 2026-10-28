import { openAnimationFrameSource } from './frame-source'
import { EncoderWorkerClient } from './encoder-client'
import { ConversionError, CONVERSION_LIMITS, validateCanonicalMetadata, validateCanonicalFrame } from './model'
import type { AnimationFrameSource, CanonicalAnimationFrame, CanonicalAnimationMetadata, ConversionFormat, EncoderResult, SourceMetrics } from './model'
import type { VirtualFile } from '../input/virtual-file'

export interface ConversionProgress {
  readonly phase: 'opening' | 'decoding' | 'encoding' | 'finalizing'
  readonly currentFrame: number
  readonly totalFrames: number
}
export interface ConversionResult extends EncoderResult {
  readonly metadata: CanonicalAnimationMetadata
  readonly sourceMetrics: SourceMetrics
  readonly totalMs: number
  readonly peakRgbaFrames: number
  readonly peakFrameBytes: number
  readonly transferredFrames: number
  readonly deflateSupported: boolean
}
export interface ConversionOptions {
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: ConversionProgress) => void
  /** Test/harness observer: do not retain the frame or buffer after callback return. */
  readonly inspectFrame?: (frame: CanonicalAnimationFrame) => void
}
export interface EncoderTransport {
  readonly capabilities: { readonly deflate: boolean }
  open(target: ConversionFormat, metadata: CanonicalAnimationMetadata): Promise<void>
  addFrame(frame: CanonicalAnimationFrame): Promise<unknown>
  finish(): Promise<EncoderResult>
  dispose(): void
}
export interface ConversionDependencies {
  source(file: VirtualFile, format: ConversionFormat, signal?: AbortSignal): Promise<AnimationFrameSource>
  encoder(): EncoderTransport
}
const defaults: ConversionDependencies = { source: openAnimationFrameSource, encoder: () => new EncoderWorkerClient() }

/** A single generic source→target broker. It never draws or copies RGBA pixels. */
export async function convertAnimation(file: VirtualFile, sourceFormat: ConversionFormat, target: ConversionFormat,
  options: ConversionOptions = {}, dependencies: ConversionDependencies = defaults): Promise<ConversionResult> {
  const started = performance.now(), signal = options.signal
  let source: AnimationFrameSource | undefined, encoder: EncoderTransport | undefined
  let peakRgbaFrames = 0, peakFrameBytes = 0, transferredFrames = 0, inFlight = 0
  const check = () => { if (signal?.aborted) throw new ConversionError('CANCELLED') }
  const abort = () => { encoder?.dispose(); void source?.close() }
  const publish = (phase: ConversionProgress['phase'], currentFrame: number, totalFrames: number) => {
    check(); options.onProgress?.({ phase, currentFrame, totalFrames })
    check()
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    check()
    if (file.size > CONVERSION_LIMITS.maxSourceBytes) throw new ConversionError('RESOURCE_LIMIT')
    publish('opening', 0, 0)
    source = await dependencies.source(file, sourceFormat, signal); check()
    const metadata = source.metadata
    validateCanonicalMetadata(metadata)
    encoder = dependencies.encoder()
    await encoder.open(target, metadata); check()
    for (let i = 0; i < metadata.frameCount; i++) {
      publish('decoding', i, metadata.frameCount)
      const frame = await source.next(); check()
      if (!frame || inFlight) throw new ConversionError('SOURCE_DECODE_FAILED')
      validateCanonicalFrame(frame, metadata, i)
      inFlight = 1; peakRgbaFrames = Math.max(peakRgbaFrames, inFlight)
      peakFrameBytes = Math.max(peakFrameBytes, frame.rgba.byteLength)
      options.inspectFrame?.(frame)
      publish('encoding', i, metadata.frameCount)
      await encoder.addFrame(frame); check()
      if (frame.rgba.byteLength !== 0) throw new ConversionError('WORKER_FAILED')
      transferredFrames++; source.acknowledgeFrame(); inFlight = 0
    }
    publish('finalizing', metadata.frameCount, metadata.frameCount)
    const result = await encoder.finish(); check()
    return { ...result, metadata, sourceMetrics: source.metrics, totalMs: performance.now() - started,
      peakRgbaFrames, peakFrameBytes, transferredFrames, deflateSupported: encoder.capabilities.deflate }
  } catch (cause) {
    if (signal?.aborted) throw new ConversionError('CANCELLED')
    throw cause instanceof ConversionError ? cause : new ConversionError('SOURCE_DECODE_FAILED', { cause })
  } finally {
    signal?.removeEventListener('abort', abort)
    encoder?.dispose(); await source?.close()
  }
}

/** Latest-job ownership: canceling A cannot publish over a later successful B. */
export class ConversionJob {
  private generation = 0
  private active: AbortController | undefined
  constructor(private readonly dependencies: ConversionDependencies = defaults) {}
  cancel() { this.generation++; this.active?.abort(); this.active = undefined }
  async run(file: VirtualFile, source: ConversionFormat, target: ConversionFormat, options: Omit<ConversionOptions, 'signal'> = {}) {
    this.cancel()
    const generation = this.generation, controller = new AbortController()
    this.active = controller
    try {
      const result = await convertAnimation(file, source, target, { ...options, signal: controller.signal }, this.dependencies)
      if (generation !== this.generation) throw new ConversionError('CANCELLED')
      return result
    } finally { if (generation === this.generation) this.active = undefined }
  }
}
