import { ConversionError } from '../conversion/model'
import type { CanonicalAnimationMetadata } from '../conversion/model'

export type VideoInputCode = 'VIDEO_CONTAINER_UNSUPPORTED' | 'VIDEO_CODEC_UNSUPPORTED' | 'NO_VIDEO_TRACK'
  | 'VIDEO_DECODER_UNAVAILABLE' | 'VIDEO_CONFIG_UNSUPPORTED' | 'VIDEO_DECODE_FAILED'
  | 'VIDEO_TIMELINE_UNSUPPORTED' | 'VIDEO_PREROLL_LIMIT' | 'VIDEO_SOURCE_LIMIT'
  | 'VIDEO_OUTPUT_PLAN_LIMIT' | 'VIDEO_JOB_DEADLINE' | 'VIDEO_DRAW_FAILED' | 'VIDEO_RGBA_FAILED'
  | 'VIDEO_TARGET_TIMING_UNSUPPORTED' | 'CANCELLED' | 'WORKER_FAILED'
export class VideoInputError extends ConversionError {
  constructor(readonly videoCode: VideoInputCode) {
    super(videoCode === 'CANCELLED' ? 'CANCELLED' : videoCode === 'WORKER_FAILED' ? 'WORKER_FAILED'
      : videoCode.endsWith('_LIMIT') || videoCode === 'VIDEO_JOB_DEADLINE' ? 'RESOURCE_LIMIT'
        : videoCode.endsWith('_UNSUPPORTED') || videoCode === 'VIDEO_DECODER_UNAVAILABLE' || videoCode === 'NO_VIDEO_TRACK'
          ? 'SOURCE_UNSUPPORTED' : 'SOURCE_DECODE_FAILED')
    this.name = 'VideoInputError'
  }
}
export const VIDEO_INPUT_LIMITS = Object.freeze({
  maxSourceBytes: 64 * 1024 * 1024, maxOutputBytes: 64 * 1024 * 1024,
  maxCodedSide: 2048, maxCodedPixels: 2_073_600, maxOutputSide: 720,
  maxSampledFrames: 150, maxFramePixels: 15_360_000, maxSelectedUs: 30_000_000,
  maxObservedSamples: 1800, maxObservedSourcePixels: 622_080_000,
  maxPrerollSeconds: 5, deadlineMs: 120_000, maxCacheBytes: 4 * 1024 * 1024, maxReadChunk: 1024 * 1024,
})
export type SourcePhase = 'opening' | 'probing' | 'preroll' | 'sampling' | 'drawing' | 'readback' | 'waiting-encoder' | 'closed'
export interface VideoInspection {
  container: 'mp4' | 'webm'; codec: 'avc' | 'vp9'; codecString: string
  codedWidth: number; codedHeight: number; displayWidth: number; displayHeight: number
  squarePixelWidth: number; squarePixelHeight: number; rotation: number; flip: boolean
  timeResolution: number; visibleStartTicks: number; visibleEndTicks: number; durationUs: number
  firstPacketTimestamp: number; secureContext: boolean; apiPresent: boolean; configSupported: boolean
  decoderInitialized: boolean; firstDecoded: boolean; firstDraw: boolean
  nativeMemoryBytes: null; colorPolicy: 'SDR8-browser-to-sRGB'; alpha: false; audio: 'ignored'; trackSelection: 'primary'
}
export interface SamplingPlan extends CanonicalAnimationMetadata {
  startUs: number; endUs: number; fps: number; framePixels: number; durationUs: number
}
export interface VideoSourceOptions { startUs: number; endUs: number; fps: number; longSide: 360 | 480 | 720 | 'original'; evidence?: boolean }
export interface FrameEvidence {
  index: number; durationMs: number; requestedUs: number; sourceTimestamp: number
  rgbaHash: number | null; samples: number[]
}
export interface VideoSourceMetrics {
  decodeMs: number; decoderHeapBytes: number; decoderBackupBytes: number
  phase: SourcePhase; openMs: number; probeMs: number; seekPrerollMs: number; sampleMs: number; drawMs: number; readbackMs: number
  stoppedAt: SourcePhase | null
  capability: {apiPresent:boolean;secureContext:boolean|null;containerReadable:boolean|null;videoTrack:boolean|null;
    codec:string|null;configSupported:boolean|null;decoderInitialized:boolean|null;firstDecoded:boolean;firstDraw:boolean;firstReadback:boolean}
  observedSourceSamples: number; observedSourcePixels: number; observablePrerollSamples: number; prerollSeconds: number
  trackParFallbackSamples: number
  activeSamples: number; peakSamples: number; samplesAcquired: number; samplesClosed: number
  explicitVideoFrames: number; peakExplicitVideoFrames: number
  activeCanvases: number; peakCanvases: number; activeImageData: number; peakImageData: number
  ownedRgba: number; peakOwnedRgba: number; peakFrameBytes: number; awaitingAck: number
  nativeMemoryBytes: null; nativeQueuedSamples: null; cleanupErrors: number; readBytes: number
  evidence: FrameEvidence[]
}
export const emptySourceMetrics = (): VideoSourceMetrics => ({
  phase:'opening', decodeMs:0, decoderHeapBytes:0, decoderBackupBytes:0, openMs:0, probeMs:0, seekPrerollMs:0,
  stoppedAt:null,capability:{apiPresent:false,secureContext:null,containerReadable:null,videoTrack:null,codec:null,
    configSupported:null,decoderInitialized:null,firstDecoded:false,firstDraw:false,firstReadback:false},
  sampleMs:0, drawMs:0, readbackMs:0, observedSourceSamples:0, observedSourcePixels:0, observablePrerollSamples:0,
  trackParFallbackSamples:0,
  prerollSeconds:0, activeSamples:0, peakSamples:0, samplesAcquired:0, samplesClosed:0,
  explicitVideoFrames:0, peakExplicitVideoFrames:0, activeCanvases:0, peakCanvases:0,
  activeImageData:0, peakImageData:0, ownedRgba:0, peakOwnedRgba:0, peakFrameBytes:0, awaitingAck:0,
  nativeMemoryBytes:null, nativeQueuedSamples:null, cleanupErrors:0, readBytes:0, evidence:[],
})
export function validateCodedSize(width: number, height: number) {
  if (![width,height].every(Number.isSafeInteger) || width < 1 || height < 1
    || Math.max(width,height) > VIDEO_INPUT_LIMITS.maxCodedSide || width*height > VIDEO_INPUT_LIMITS.maxCodedPixels) throw new VideoInputError('VIDEO_SOURCE_LIMIT')
}
export function validateVideoMatrix(matrix:readonly number[]){
  if(matrix.length!==9||matrix.some(x=>!Number.isFinite(x)))throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
  const [a,b,p,c,d,q,,,z]=matrix as [number,number,number,number,number,number,number,number,number]
  if(Math.abs(p)>1e-6||Math.abs(q)>1e-6||Math.abs(z-1)>1e-6
    ||[a,b,c,d].some(x=>Math.min(Math.abs(x),Math.abs(Math.abs(x)-1))>1e-5)
    ||Math.abs(a*a+b*b-1)>1e-5||Math.abs(c*c+d*d-1)>1e-5||Math.abs(a*c+b*d)>1e-5)
    throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
}
export function validateSampleColor(color:{primaries:string|null;transfer:string|null;matrix:string|null}){
  if(/^(bt2020|smpte43)/.test(color.primaries??'')||/^bt2020/.test(color.matrix??'')
    ||['pq','hlg','smpte2084','arib-std-b67'].includes(color.transfer??''))throw new VideoInputError('VIDEO_CODEC_UNSUPPORTED')
}
export function gateCodec(container: string, codec: string | null, codecString: string, hdr: boolean, alpha: boolean) {
  if (container !== 'mp4' && container !== 'webm') throw new VideoInputError('VIDEO_CONTAINER_UNSUPPORTED')
  if ((container === 'mp4' && codec !== 'avc') || (container === 'webm' && codec !== 'vp9')) throw new VideoInputError('VIDEO_CODEC_UNSUPPORTED')
  // AVC Baseline/Main/High and VP9 profile 0 are restricted to 8-bit here.
  const sdr8 = codec === 'avc' ? /^avc[13]\.(42|4d|64)[0-9a-f]{4}$/i.test(codecString)
    : /^vp09\.00\.\d{2}\.08(?:\.|$)/i.test(codecString)
  if (!sdr8 || hdr || alpha) throw new VideoInputError('VIDEO_CODEC_UNSUPPORTED')
}
