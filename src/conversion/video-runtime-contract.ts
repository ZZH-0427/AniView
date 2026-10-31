import type { AnimationFrameSource } from './model'
import type { VideoResult, VideoMetrics, VideoFinalizePhase } from '../video/model'
import type { ConversionProgress } from './convert'

/** Lazy product boundary. No media arrays or native handles enter the session. */
export interface VideoConversionRuntime {
  run(source:(signal:AbortSignal)=>Promise<AnimationFrameSource>,signal:AbortSignal,hooks:{
    progress:(progress:ConversionProgress)=>void
    phase:(phase:VideoFinalizePhase)=>void
    metrics:(metrics:VideoMetrics)=>void
    worker:(active:boolean)=>void
  }):Promise<VideoResult & {peakCanonicalRgbaFrames:number}>
}
