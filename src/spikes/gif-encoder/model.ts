/** Experimental types only. Viewer/MediaSession do not depend on creation. */
export type EncodeErrorCode = 'UNSUPPORTED_INPUT' | 'ANIMATED_INPUT' | 'DECODE_FAILED'
  | 'RESOURCE_LIMIT' | 'QUANTIZATION_FAILED' | 'ENCODING_FAILED' | 'CANCELLED' | 'WORKER_FAILED' | 'FILE_READ_FAILED'

const messages: Record<EncodeErrorCode, string> = {
  UNSUPPORTED_INPUT: 'Use static JPEG, PNG or WebP source images.',
  ANIMATED_INPUT: 'Milestone 8A supports static source images only.',
  DECODE_FAILED: 'A source image could not be decoded.',
  RESOURCE_LIMIT: 'This experimental encoding job exceeds its resource limits.',
  QUANTIZATION_FAILED: 'A frame could not be reduced to a GIF palette.',
  ENCODING_FAILED: 'The GIF could not be encoded.',
  CANCELLED: 'GIF encoding was cancelled.',
  WORKER_FAILED: 'The GIF encoding worker failed or is unavailable.',
  FILE_READ_FAILED: 'A source image could not be read.',
}

export class EncodeError extends Error {
  constructor(readonly code: EncodeErrorCode, options?: ErrorOptions) {
    super(messages[code], options)
    this.name = 'EncodeError'
  }
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
