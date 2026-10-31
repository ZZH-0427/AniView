import { convertFrameSource } from '../conversion/convert'
import type { ConversionOptions } from '../conversion/convert'
import { EncoderWorkerClient } from '../conversion/encoder-client'
import type { ConversionFormat } from '../conversion/model'
import type { VirtualFile } from '../input/virtual-file'
import { VIDEO_INPUT_LIMITS, VideoInputError } from './model'
import type { SamplingPlan, VideoInspection, VideoSourceMetrics, VideoSourceOptions } from './model'
import { createSamplingPlan, validateTargetTiming } from './sampling-plan'
import { VideoSourceAdapter } from './worker-client'

export async function inspectVideo(file:VirtualFile,signal?:AbortSignal){
  const source=new VideoSourceAdapter(file,signal)
  try{return await source.open()}finally{await source.close()}
}
export async function convertVideoToAnimation(file:VirtualFile,target:ConversionFormat,selection:VideoSourceOptions,
  options:ConversionOptions&{onSourceMetrics?:(metrics:VideoSourceMetrics)=>void;
    onPreflight?:(inspection:VideoInspection,plan:SamplingPlan,expectedDurationMs:number)=>void;
    onEncoderFrameSent?:()=>void;
    onSourceClosed?:(cleanup:VideoSourceAdapter['cleanup'],metrics:VideoSourceMetrics)=>void}={}){
  const controller=new AbortController(),abort=()=>controller.abort()
  let expired=false,source:VideoSourceAdapter|undefined
  const timer=setTimeout(()=>{expired=true;controller.abort()},VIDEO_INPUT_LIMITS.deadlineMs)
  options.signal?.addEventListener('abort',abort,{once:true})
  if(options.signal?.aborted)controller.abort()
  try{
    const result=await convertFrameSource(file,target,{...options,signal:controller.signal},{
      source:async(input,signal)=>{
        source=new VideoSourceAdapter(input,signal,options.onSourceMetrics)
        try{const info=await source.open();const candidate=createSamplingPlan(info,selection);
          const expected=validateTargetTiming(candidate,target);const plan=await source.configure(selection);
          options.onPreflight?.(info,plan,expected);return source}
        catch(error){await source.close();throw error}
      },
      encoder:()=>{
        const client=new EncoderWorkerClient()
        return{capabilities:client.capabilities,open:(format,metadata)=>client.open(format,metadata),
          async addFrame(frame){
            const pending=client.addFrame(frame)
            try{options.onEncoderFrameSent?.()}catch(error){client.dispose();await pending.catch(()=>{});throw error}
            return pending
          },finish:()=>client.finish(),dispose:()=>client.dispose()}
      },
    })
    if(!source?.inspection)throw new VideoInputError('VIDEO_DECODE_FAILED')
    return{...result,inspection:source.inspection,plan:source.metadata,videoSource:source.metrics,cleanup:source.cleanup}
  }catch(error){if(expired)throw new VideoInputError('VIDEO_JOB_DEADLINE');throw error}
  finally{
    clearTimeout(timer);options.signal?.removeEventListener('abort',abort);await source?.close()
    if(source)try{options.onSourceClosed?.({...source.cleanup},source.metrics)}catch{/* Evidence cannot alter disposal. */}
  }
}
