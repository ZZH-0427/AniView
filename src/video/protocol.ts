import type { CanonicalAnimationFrame, CanonicalAnimationMetadata } from '../conversion/model'
import type { ProbeResult, VideoErrorCode, VideoMetrics, VideoResult, VideoFinalizePhase } from './model'
export type VideoRequest = { id: number; type: 'open'; metadata: CanonicalAnimationMetadata }
  | { id: number; type: 'frame'; frame: CanonicalAnimationFrame } | { id: number; type: 'finish' }
export type VideoResponse = { id: number; type: 'ready'; probe: ProbeResult }
  | { id: 0; type: 'boot' }
  | { id:0;type:'phase';phase:VideoFinalizePhase }
  | { id: number; type: 'accepted'; metrics: VideoMetrics } | { id: number; type: 'result'; result: VideoResult }
  | { id: number; type: 'error'; code: VideoErrorCode }
