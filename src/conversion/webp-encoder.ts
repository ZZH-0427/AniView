import createModule, { type WebPModule } from '../formats/webp/wasm/aniview-webp.mjs'
import wasmUrl from '../formats/webp/wasm/aniview-webp.wasm?url'
import { CONVERSION_LIMITS, ConversionError, validateCanonicalFrame, validateCanonicalMetadata } from './model'
import type { AnimationEncoder, CanonicalAnimationFrame, CanonicalAnimationMetadata, EncoderMetrics, EncoderResult } from './model'

/** Dedicated-Worker core. Never imported into ordinary Viewer startup. */
export class WebPAnimationEncoder implements AnimationEncoder {
  private index = 0
  private timestamp = 0
  private encodeMs = 0
  private outputBytes = 0
  private peakHeap = 0
  private peakLive = 0
  private context: number
  private constructor(private readonly metadata: CanonicalAnimationMetadata, private readonly module: WebPModule) {
    this.context = module._aniview_webp_encoder_create(metadata.width, metadata.height, metadata.frameCount, metadata.playCount)
    if (!this.context) throw new ConversionError(module._aniview_webp_error() === 2 ? 'RESOURCE_LIMIT' : 'TARGET_ENCODE_FAILED')
    this.peakHeap = module.HEAPU8.byteLength
    this.peakLive = module._aniview_webp_live_alloc_bytes()
  }
  static async create(metadata: CanonicalAnimationMetadata) {
    validateCanonicalMetadata(metadata)
    if (typeof WebAssembly === 'undefined') throw new ConversionError('TARGET_ENCODER_UNSUPPORTED')
    try {
      const module = await createModule({ locateFile: () => wasmUrl, printErr: () => {} })
      return new WebPAnimationEncoder(metadata, module)
    } catch (cause) {
      throw cause instanceof ConversionError ? cause : new ConversionError('TARGET_ENCODER_UNSUPPORTED', { cause })
    }
  }
  get metrics(): EncoderMetrics {
    return { encodeMs: this.encodeMs, outputBytes: this.outputBytes, outputCapacity: this.outputBytes,
      wasmHeapBytes: this.module.HEAPU8.byteLength, wasmPeakHeapBytes: this.peakHeap,
      wasmLiveAllocBytes: this.module._aniview_webp_live_alloc_bytes(), wasmPeakLiveAllocBytes: this.peakLive }
  }
  get liveEncoderCount() { return this.module._aniview_webp_encoder_count() }
  async addFrame(frame: CanonicalAnimationFrame) {
    if (!this.context) throw new ConversionError('TARGET_ENCODE_FAILED')
    const start = performance.now()
    try {
      validateCanonicalFrame(frame, this.metadata, this.index)
      if (this.index >= this.metadata.frameCount) throw new ConversionError('RESOURCE_LIMIT')
      const pointer = this.module._aniview_webp_encoder_input(this.context)
      this.module.HEAPU8.set(new Uint8Array(frame.rgba), pointer)
      if (!this.module._aniview_webp_encoder_add(this.context, Math.round(this.timestamp))) throw new ConversionError('TARGET_ENCODE_FAILED')
      this.timestamp += frame.durationMs
      if (!Number.isSafeInteger(Math.round(this.timestamp)) || this.timestamp > 0x7fffffff) throw new ConversionError('RESOURCE_LIMIT')
      this.index++
    } catch (cause) {
      this.dispose()
      throw cause instanceof ConversionError ? cause : new ConversionError('TARGET_ENCODE_FAILED', { cause })
    } finally {
      this.encodeMs += performance.now() - start
      this.peakHeap = Math.max(this.peakHeap, this.module.HEAPU8.byteLength)
      this.peakLive = Math.max(this.peakLive, this.module._aniview_webp_live_alloc_bytes())
    }
  }
  async finish(): Promise<EncoderResult> {
    if (!this.context) throw new ConversionError('TARGET_ENCODE_FAILED')
    const start = performance.now()
    try {
      if (this.index !== this.metadata.frameCount) throw new ConversionError('TARGET_ENCODE_FAILED')
      if (!this.module._aniview_webp_encoder_finish(this.context, Math.round(this.timestamp))) throw new ConversionError('TARGET_ENCODE_FAILED')
      const length = this.module._aniview_webp_encoder_output_size(this.context)
      if (length > CONVERSION_LIMITS.maxOutputBytes) throw new ConversionError('RESOURCE_LIMIT')
      const pointer = this.module._aniview_webp_encoder_output(this.context)
      if (!length || !pointer || pointer + length > this.module.HEAPU8.byteLength) throw new ConversionError('TARGET_ENCODE_FAILED')
      // Sole WASM-to-JS encoded-output copy. The Worker then transfers this buffer.
      const data = this.module.HEAPU8.slice(pointer, pointer + length).buffer
      this.outputBytes = length
      this.peakHeap = Math.max(this.peakHeap, this.module.HEAPU8.byteLength)
      this.peakLive = Math.max(this.peakLive, this.module._aniview_webp_live_alloc_bytes())
      this.dispose()
      this.encodeMs += performance.now() - start
      return { data, byteLength: length, metrics: this.metrics }
    } catch (cause) {
      this.dispose()
      throw cause instanceof ConversionError ? cause : new ConversionError('TARGET_ENCODE_FAILED', { cause })
    }
  }
  dispose() {
    if (this.context) this.module._aniview_webp_encoder_destroy(this.context)
    this.context = 0
  }
}
