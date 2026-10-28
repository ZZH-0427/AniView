/** Visual animation semantics only; container metadata is intentionally excluded. */
export interface CanonicalAnimationMetadata {
  readonly width: number
  readonly height: number
  readonly frameCount: number
  /** Total plays: zero is infinite, one plays once. */
  readonly playCount: number
}

/** One full-canvas, fully composed RGBA8 frame. Ownership passes by transfer. */
export interface CanonicalAnimationFrame {
  readonly index: number
  readonly durationMs: number
  readonly rgba: ArrayBuffer
}

export interface SourceMetrics {
  readonly decodeMs: number
  readonly decoderHeapBytes: number
  readonly decoderBackupBytes: number
  readonly directRgbaFrames?: number
  readonly canvasReadbackFrames?: number
}

export interface AnimationFrameSource {
  readonly metadata: CanonicalAnimationMetadata
  readonly metrics: SourceMetrics
  next(): Promise<CanonicalAnimationFrame | null>
  /** Called only after target acceptance; the previously handed-out buffer must be detached. */
  acknowledgeFrame(): void
  reset(): Promise<void>
  close(): Promise<void>
}

export interface EncoderMetrics {
  readonly encodeMs: number
  readonly outputBytes: number
  readonly outputCapacity: number
  readonly wasmHeapBytes?: number
  readonly wasmPeakHeapBytes?: number
  readonly wasmLiveAllocBytes?: number
  /** Maximum sampled allocator-live bytes at frame/finalize checkpoints, not a transient peak. */
  readonly wasmPeakLiveAllocBytes?: number
  readonly peakCompressedChunkBytes?: number
  readonly peakScanlineBytes?: number
  /** Compressed bytes written for a frame, not a retained compressed-frame allocation. */
  readonly lastFrameCompressedBytes?: number
  readonly peakCompressedFrameBytes?: number
}

export interface EncoderResult {
  /** Exact valid range accompanies a capacity-sized transferable allocation. */
  readonly data: ArrayBuffer
  readonly byteLength: number
  readonly metrics: EncoderMetrics
}

export interface AnimationEncoder {
  addFrame(frame: CanonicalAnimationFrame): Promise<void>
  finish(): Promise<EncoderResult>
  dispose(): void
  readonly metrics: EncoderMetrics
}

export type ConversionFormat = 'gif' | 'webp' | 'apng'
export type ConversionErrorCode = 'SOURCE_DECODE_FAILED' | 'SOURCE_UNSUPPORTED'
  | 'TARGET_ENCODER_UNSUPPORTED' | 'TARGET_ENCODE_FAILED' | 'RESOURCE_LIMIT'
  | 'CANCELLED' | 'WORKER_FAILED'

export class ConversionError extends Error {
  constructor(readonly code: ConversionErrorCode, options?: ErrorOptions) {
    super(code, options)
    this.name = 'ConversionError'
  }
}

/** Conservative experimental guard, not a final conversion-product policy. */
export const CONVERSION_LIMITS = Object.freeze({
  maxFrames: 200, maxSide: 2048, maxPixels: 4_194_304,
  maxFramePixels: 15_360_000, maxSourceBytes: 64 * 1024 * 1024,
  maxOutputBytes: 64 * 1024 * 1024,
})

export function validateCanonicalMetadata(meta: CanonicalAnimationMetadata) {
  const { width, height, frameCount, playCount } = meta
  if (![width, height, frameCount, playCount].every(Number.isSafeInteger)
    || width < 1 || height < 1 || width > CONVERSION_LIMITS.maxSide || height > CONVERSION_LIMITS.maxSide
    || frameCount < 1 || frameCount > CONVERSION_LIMITS.maxFrames || playCount < 0 || playCount > 65535
    || width * height > CONVERSION_LIMITS.maxPixels
    || width * height * frameCount > CONVERSION_LIMITS.maxFramePixels) throw new ConversionError('RESOURCE_LIMIT')
}

export function validateCanonicalFrame(frame: CanonicalAnimationFrame, meta: CanonicalAnimationMetadata, expected: number) {
  if (frame.index !== expected || !(frame.rgba instanceof ArrayBuffer)
    || frame.rgba.byteLength !== meta.width * meta.height * 4
    || !Number.isFinite(frame.durationMs) || frame.durationMs < 0 || frame.durationMs > 655350) {
    throw new ConversionError('RESOURCE_LIMIT')
  }
}
