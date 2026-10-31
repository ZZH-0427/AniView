import { validateCanonicalMetadata } from '../conversion/model'
import type { CanonicalAnimationMetadata } from '../conversion/model'

export type VideoErrorCode = 'VIDEO_API_UNAVAILABLE' | 'VIDEO_CONFIG_UNSUPPORTED' | 'VIDEO_ENCODER_UNSUPPORTED'
  | 'VIDEO_ENCODER_INIT_FAILED' | 'VIDEO_ENCODE_FAILED' | 'VIDEO_MUX_FAILED' | 'VIDEO_OUTPUT_TOO_LARGE'
  | 'VIDEO_FRAME_FAILED' | 'VIDEO_VALIDATION_FAILED' | 'RESOURCE_LIMIT' | 'CANCELLED' | 'WORKER_FAILED' | 'SOURCE_DECODE_FAILED' | 'SOURCE_UNSUPPORTED'
export class VideoError extends Error {
  constructor(readonly code: VideoErrorCode) { super(code); this.name = 'VideoError' }
}
export const VIDEO_LIMITS = Object.freeze({ maxDurationUs: 30_000_000, maxOutputBytes: 64 * 1024 * 1024, maxQueue: 2 })
export function codedSize(meta: CanonicalAnimationMetadata) {
  try { validateCanonicalMetadata(meta) } catch { throw new VideoError('RESOURCE_LIMIT') }
  const width = meta.width + meta.width % 2, height = meta.height + meta.height % 2
  try { validateCanonicalMetadata({ ...meta, width, height }) } catch { throw new VideoError('RESOURCE_LIMIT') }
  return { width, height }
}
export interface VideoMetrics {
  framesCreated: number; framesClosed: number; activeVideoFrames: number; peakVideoFrames: number
  maxEncodeQueue: number; maxMuxPendingBytes: number; encodedBytes: number; outputBytes: number
  compositeMs: number; frameConstructionMs: number; encodeCallMs: number; encodePhaseWallMs: number; finalizeMs: number; inspectionMs: number
  temporaryRgbaFrames: number; packets: number; targetHighWaterBytes: number; decoderConfigReceived: boolean
}
export const emptyVideoMetrics = (): VideoMetrics => ({ framesCreated: 0, framesClosed: 0, activeVideoFrames: 0, peakVideoFrames: 0,
  maxEncodeQueue: 0, maxMuxPendingBytes: 0, encodedBytes: 0, outputBytes: 0, compositeMs: 0, frameConstructionMs: 0,
  encodeCallMs: 0, encodePhaseWallMs: 0, finalizeMs: 0, inspectionMs: 0, temporaryRgbaFrames: 0, packets: 0, targetHighWaterBytes: 0, decoderConfigReceived: false })
export interface VideoTiming { readonly timestampUs: number; readonly durationUs: number }
export interface VideoValidation {
  readonly codec: string | null; readonly width: number; readonly height: number; readonly frameCount: number
  readonly audioTracks: number; readonly maxTimestampErrorUs: number; readonly maxDurationErrorUs: number
  readonly totalDurationErrorUs: number; readonly meanRgbError: number; readonly p95RgbError: number; readonly maxRgbError: number
  readonly perFrame: readonly { timestampUs: number; durationUs: number; meanRgbError: number }[]
}
export interface ProbeResult { readonly apiPresent: boolean; readonly candidates: readonly { config: VideoEncoderConfig; supported: boolean }[]; readonly selected: VideoEncoderConfig | null }
export interface VideoResult { readonly data: ArrayBuffer; readonly metrics: VideoMetrics; readonly config: VideoEncoderConfig
  readonly probe: ProbeResult; readonly validation: VideoValidation; readonly timing: readonly VideoTiming[] }
