import type { VirtualFile } from '../input/virtual-file'
import { EncoderWorkerClient } from '../conversion/encoder-client'
import { CONVERSION_LIMITS, ConversionError, validateCanonicalFrame, validateCanonicalMetadata } from '../conversion/model'
import type { AnimationFrameSource, CanonicalAnimationMetadata, ConversionFormat, EncoderResult } from '../conversion/model'
import type { EncoderTransport } from '../conversion/convert'
import type { CreationCleanup } from '../media/creation-cleanup'
import type { CreationProgress } from './creation-types'
import type { StaticPreparationMetrics } from './static-frame-core'
import { StaticImageSequenceSource, StaticSourceReadGate } from './static-frame-source'
import type { StaticSourceConfiguration } from './static-frame-source'
import { EncodeError } from './gif/model'
import { assertSourceLimits, GIF_CREATION_LIMITS } from './gif/gif-validation'

export interface StaticAnimationOptions { readonly target: ConversionFormat; readonly durationMs: number; readonly playCount: number }
export interface StaticAnimationOutput extends EncoderResult {
  readonly input: CanonicalAnimationMetadata; readonly sourceMetrics: StaticPreparationMetrics
  readonly totalMs: number; readonly peakRgbaFrames: number; readonly transferredFrames: number
}
export interface StaticAnimationConfiguration {
  readonly signal?: AbortSignal; readonly onProgress?: (progress: CreationProgress) => void
  readonly onResources?: (value: Partial<CreationCleanup>) => void
}
export interface StaticPreparationSource extends AnimationFrameSource {
  readonly preparationMetrics: StaticPreparationMetrics; readonly softClosed: boolean
}
export interface StaticAnimationDependencies {
  readonly source?: (files: readonly VirtualFile[], config: StaticSourceConfiguration) => Promise<StaticPreparationSource>
  readonly encoder?: () => EncoderTransport
}

/** Creator-owned job broker; the shared conversion/video coordinator is deliberately untouched. */
export class StaticAnimationEncoder {
  private generation = 0
  private active: { abort: AbortController; done: Promise<void> } | undefined
  private readonly reads = new StaticSourceReadGate()
  constructor(private readonly dependencies: StaticAnimationDependencies = {}) {}
  async encode(files: readonly VirtualFile[], options: StaticAnimationOptions, config: StaticAnimationConfiguration = {}): Promise<StaticAnimationOutput> {
    const id = ++this.generation
    await this.cancelActive()
    if (id !== this.generation || config.signal?.aborted) throw new ConversionError('CANCELLED')
    assertSourceLimits(files.map(f => f.size), GIF_CREATION_LIMITS)
    const abort = new AbortController(), stop = () => abort.abort()
    config.signal?.addEventListener('abort', stop, { once: true })
    let settle = () => {}
    const done = new Promise<void>(resolve => { settle = resolve })
    const active = { abort, done }; this.active = active
    try { return await this.run(files, options, { ...config, signal: abort.signal }) }
    finally {
      config.signal?.removeEventListener('abort', stop); settle()
      if (this.active === active) this.active = undefined
    }
  }
  async cancel() { ++this.generation; await this.cancelActive() }
  private async cancelActive() { const active = this.active; if (active) { active.abort.abort(); await active.done } }
  private async run(files: readonly VirtualFile[], options: StaticAnimationOptions, config: StaticAnimationConfiguration): Promise<StaticAnimationOutput> {
    const started = performance.now(), signal = config.signal!
    let source: StaticPreparationSource | undefined, encoder: EncoderTransport | undefined, transferredFrames = 0
    const check = () => { if (signal.aborted) throw new ConversionError('CANCELLED') }
    const resources = (value: Partial<CreationCleanup>) => config.onResources?.(value)
    const abort = () => { encoder?.dispose(); void source?.close() }
    const progress = (phase: CreationProgress['phase'], completedFrames: number, totalFrames: number) => {
      check(); config.onProgress?.({ phase, completedFrames, totalFrames }); check()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      check(); resources({ activeSourceWorkers: 1, sourceSoftClosed: null })
      source = await (this.dependencies.source ?? StaticImageSequenceSource.open)(files, {
        durationMs: options.durationMs, playCount: options.playCount, signal, reads: this.reads,
        scanned: (completed, total) => progress('preparing', completed, total), observe: value => resources(value),
      }); check()
      const input = source.metadata; validateCanonicalMetadata(input)
      if (input.frameCount !== files.length || input.playCount !== options.playCount) throw new ConversionError('SOURCE_DECODE_FAILED')
      encoder = (this.dependencies.encoder ?? (() => new EncoderWorkerClient()))(); resources({ activeEncoderWorkers: 1 })
      await encoder.open(options.target, input); check()
      progress('encoding', 0, input.frameCount)
      for (let index = 0; index < input.frameCount; index++) {
        const frame = await source.next(); check()
        if (!frame) throw new ConversionError('SOURCE_DECODE_FAILED')
        validateCanonicalFrame(frame, input, index)
        resources({ ownedRgba: 1, awaitingAck: 1, peakCanonicalRgbaFrames: 1 })
        await encoder.addFrame(frame); check()
        if (frame.rgba.byteLength !== 0) throw new ConversionError('WORKER_FAILED')
        source.acknowledgeFrame(); transferredFrames++
        resources({ ownedRgba: 0 }); progress('encoding', transferredFrames, input.frameCount)
      }
      progress('finalizing', input.frameCount, input.frameCount)
      const output = await encoder.finish(); check()
      if (!(output.data instanceof ArrayBuffer) || !Number.isSafeInteger(output.byteLength) || output.byteLength <= 0
        || output.byteLength > output.data.byteLength || output.byteLength > CONVERSION_LIMITS.maxOutputBytes) throw new ConversionError('RESOURCE_LIMIT')
      return { ...output, input, sourceMetrics: source.preparationMetrics, totalMs: performance.now() - started,
        peakRgbaFrames: 1, transferredFrames }
    } catch (cause) {
      if (signal.aborted) throw new ConversionError('CANCELLED')
      throw cause instanceof EncodeError || cause instanceof ConversionError ? cause : new ConversionError('TARGET_ENCODE_FAILED', { cause })
    } finally {
      signal.removeEventListener('abort', abort)
      encoder?.dispose()
      await source?.close()
      resources({ activeSourceWorkers: 0, activeEncoderWorkers: 0, activeBitmaps: 0, activeCanvases: 0,
        activeImageData: 0, ownedRgba: 0, awaitingAck: 0, sourceSoftClosed: source?.softClosed ?? null })
    }
  }
}
