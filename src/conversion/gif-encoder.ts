import { GIFEncoder, type GifEncoderInstance } from 'gifenc'
import { quantizeGifFrame } from '../creation/gif/gifenc-adapter'
import { CONVERSION_LIMITS, ConversionError, validateCanonicalFrame, validateCanonicalMetadata } from './model'
import type { AnimationEncoder, CanonicalAnimationFrame, CanonicalAnimationMetadata, EncoderMetrics } from './model'

/** Existing gifenc boundary, with target-specific per-frame timing and loop mapping. */
export class GIFAnimationEncoder implements AnimationEncoder {
  private writer: GifEncoderInstance | undefined = GIFEncoder()
  private count = 0
  private elapsed = 0
  static async create(meta: CanonicalAnimationMetadata) { return new GIFAnimationEncoder(meta) }
  constructor(private readonly meta: CanonicalAnimationMetadata) { validateCanonicalMetadata(meta) }
  get metrics(): EncoderMetrics {
    return { encodeMs: this.elapsed, outputBytes: this.writer?.bytesView().byteLength ?? 0,
      outputCapacity: this.writer?.buffer.byteLength ?? 0 }
  }
  async addFrame(frame: CanonicalAnimationFrame) {
    validateCanonicalFrame(frame, this.meta, this.count)
    if (!this.writer || this.count >= this.meta.frameCount) throw new ConversionError('TARGET_ENCODE_FAILED')
    const start = performance.now()
    try {
      const indexed = quantizeGifFrame(new Uint8ClampedArray(frame.rgba), 256, 127)
      this.writer.writeFrame(indexed.indexed, this.meta.width, this.meta.height, {
        palette: indexed.palette, delay: Math.round(frame.durationMs / 10) * 10,
        repeat: this.meta.playCount === 0 ? 0 : this.meta.playCount === 1 ? -1 : this.meta.playCount - 1,
        transparent: true, transparentIndex: 0, dispose: 2,
      })
      if (this.writer.bytesView().byteLength > CONVERSION_LIMITS.maxOutputBytes) throw new ConversionError('RESOURCE_LIMIT')
      this.count++
    } catch (cause) { throw cause instanceof ConversionError ? cause : new ConversionError('TARGET_ENCODE_FAILED', { cause }) }
    finally { this.elapsed += performance.now() - start }
  }
  async finish() {
    if (!this.writer || this.count !== this.meta.frameCount) throw new ConversionError('TARGET_ENCODE_FAILED')
    this.writer.finish()
    const view = this.writer.bytesView(), metrics = this.metrics
    const result = { data: view.buffer, byteLength: view.byteLength, metrics }
    this.writer = undefined
    return result
  }
  dispose() { this.writer = undefined }
}
