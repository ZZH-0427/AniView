/** Creation-owned types. Viewer/MediaSession do not depend on encoding. */
export type EncodeErrorCode = 'UNSUPPORTED_INPUT' | 'ANIMATED_INPUT' | 'CORRUPT_SOURCE' | 'DECODE_FAILED'
  | 'RESOURCE_LIMIT' | 'QUANTIZATION_FAILED' | 'ENCODING_FAILED' | 'CANCELLED' | 'WORKER_FAILED' | 'FILE_READ_FAILED'

const messages: Record<EncodeErrorCode, string> = {
  UNSUPPORTED_INPUT: 'GIF creation currently accepts static JPEG, PNG and WebP images only.',
  ANIMATED_INPUT: 'GIF creation currently accepts static JPEG, PNG and WebP images only.',
  CORRUPT_SOURCE: 'A source image is corrupted or incomplete.',
  DECODE_FAILED: 'A source image could not be decoded.',
  RESOURCE_LIMIT: 'This encoding job exceeds its resource limits.',
  QUANTIZATION_FAILED: 'A frame could not be reduced to a GIF palette.',
  ENCODING_FAILED: 'The GIF could not be encoded.',
  CANCELLED: 'GIF encoding was cancelled.',
  WORKER_FAILED: 'The GIF encoding worker failed or is unavailable.',
  FILE_READ_FAILED: 'A source image could not be read.',
}

export class EncodeError extends Error {
  readonly detail: EncodeErrorDetail | undefined
  constructor(readonly code: EncodeErrorCode, options?: ErrorOptions & { readonly detail?: EncodeErrorDetail }) {
    super(messages[code], options)
    this.name = 'EncodeError'
    this.detail = options?.detail
  }
}

export type EncodeErrorDetail =
  | { readonly kind: 'source-count' | 'source-bytes'; readonly actual: number; readonly limit: number }
  | { readonly kind: 'output-side' | 'output-pixels' | 'workload'; readonly actual: number; readonly limit: number;
      readonly width: number; readonly height: number; readonly frameCount: number }

export interface EncodeLimits {
  readonly minFrames: number
  readonly maxFrames: number
  readonly maxSourceBytes: number
  readonly maxOutputSide: number
  readonly maxOutputPixels: number
  readonly maxFramePixelWork: number
}

export interface EncodeOptions {
  readonly colors: 64 | 128 | 256
  readonly frameDurationMs: number
  readonly alphaThreshold: number
  readonly loop: { readonly kind: 'forever' } | { readonly kind: 'once' } | { readonly kind: 'repeat'; readonly repeats: number }
}
export interface EncodeProgress {
  readonly phase: 'scanning' | 'decoding' | 'quantizing' | 'encoding' | 'finalizing'
  /** Completed source count; never decreases within a phase. */
  readonly currentFrame: number
  readonly totalFrames: number
  /** Monotonic completed work across the scan pass and encoding pass. */
  readonly completedWork?: number
  readonly totalWork?: number
}
export interface EncodeMetrics {
  readonly decodeMs: number
  readonly quantizeMs: number
  readonly writeMs: number
  readonly totalMs: number
  readonly peakBitmaps: number
  readonly peakRgbaFrames: number
  readonly peakFrameBytes: number
  readonly outputBytes: number
  readonly outputCapacity: number
  readonly frameCount: number
  readonly width: number
  readonly height: number
  readonly sourceBytes: number
}
export interface EncodedGif {
  /** Transferred capacity-sized allocation; only [0, byteLength) is GIF data. */
  readonly data: ArrayBuffer
  readonly byteLength: number
  readonly metrics: EncodeMetrics
}

export function resolveEncodeOptions(options: Partial<EncodeOptions> = {}): EncodeOptions {
  const value: EncodeOptions = { colors: 256, frameDurationMs: 500, alphaThreshold: 127, loop: { kind: 'forever' }, ...options }
  if (![64, 128, 256].includes(value.colors) || !Number.isFinite(value.frameDurationMs)
    || value.frameDurationMs < 20 || value.frameDurationMs > 655350
    || !Number.isInteger(value.alphaThreshold) || value.alphaThreshold < 0 || value.alphaThreshold > 255
    || !['forever', 'once', 'repeat'].includes(value.loop.kind)
    || (value.loop.kind === 'repeat' && (!Number.isInteger(value.loop.repeats) || value.loop.repeats < 1 || value.loop.repeats > 65535))) {
    throw new EncodeError('RESOURCE_LIMIT')
  }
  return value
}
