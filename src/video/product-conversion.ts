import { animationToMP4 } from './convert'
import { VideoWorkerClient } from './worker-client'
import { VideoError } from './model'
import type { VideoConversionRuntime } from '../conversion/video-runtime-contract'

/** Reuses the accepted 8C1 pipeline; loaded only when an MP4 conversion starts. */
export const run:VideoConversionRuntime['run']=async(source,signal,hooks)=>{
  if(!globalThis.isSecureContext)throw new VideoError('VIDEO_API_UNAVAILABLE')
  return animationToMP4(source,signal,p=>hooks.progress({phase:p.phase,currentFrame:p.frame,totalFrames:p.total}),()=>{
    const client=new VideoWorkerClient(undefined,undefined,undefined,hooks.phase)
    hooks.worker(true);let disposed=false
    return{open:client.open.bind(client),addFrame:async frame=>{const metrics=await client.addFrame(frame);hooks.metrics(metrics);return metrics},finish:client.finish.bind(client),
      dispose:reason=>{client.dispose(reason);if(!disposed){disposed=true;hooks.worker(false)}}}
  })
}
