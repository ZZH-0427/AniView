import type {ConversionFormat} from '../conversion/model'
import {VIDEO_INPUT_LIMITS} from '../video-source/model'
import type {VideoInspection,VideoSourceOptions,SamplingPlan} from '../video-source/model'
import {countGrid,createSamplingPlan,offsetUs,outputSize,validateTargetTiming} from '../video-source/sampling-plan'
export const videoFps=(target:ConversionFormat):readonly number[]=>target==='gif'?[5,10,20]:[5,10,15,20,24,30]
export const defaultVideoFps=(target:ConversionFormat)=>target==='gif'?10:15
export interface VideoSettings extends VideoSourceOptions {target:ConversionFormat}
export interface Estimate {durationUs:number;fps:number;frameCount:number;width:number;height:number;framePixels:number}
export type Preflight={ok:true;estimate:Estimate;plan:SamplingPlan;expectedDurationMs:number}
 |{ok:false;issue:'trim'|'duration'|'frames'|'workload'|'size'|'timing'|'apng';message:string;estimate?:Estimate}
export function estimateVideo(info:VideoInspection,settings:VideoSettings,deflate:boolean|null=true):Preflight{
 const {startUs,endUs,fps,longSide,target}=settings
 if(![startUs,endUs].every(Number.isSafeInteger)||startUs<0||endUs<=startUs||endUs>info.durationUs)
  return{ok:false,issue:'trim',message:'Choose a start and end within the video, with Start before End.'}
 if(endUs-startUs>VIDEO_INPUT_LIMITS.maxSelectedUs)return{ok:false,issue:'duration',message:'Video clips can be up to 30 seconds. Shorten the selected clip.'}
 if(!videoFps(target).includes(fps))return{ok:false,issue:'timing',message:'Choose a supported FPS for this output format.'}
 let size:{width:number;height:number}
 try{size=outputSize(info.displayWidth,info.displayHeight,longSide)}catch{return{ok:false,issue:'size',message:'The output long side can be up to 720 pixels. Choose 360, 480 or 720.'}}
 const frameCount=countGrid(startUs,endUs,fps),estimate={...size,durationUs:endUs-startUs,fps,frameCount,framePixels:size.width*size.height*frameCount}
 if(frameCount>VIDEO_INPUT_LIMITS.maxSampledFrames)return{ok:false,estimate,issue:'frames',message:'This conversion would create too many frames. Reduce the clip duration or FPS.'}
 if(estimate.framePixels>VIDEO_INPUT_LIMITS.maxFramePixels)return{ok:false,estimate,issue:'workload',message:'This conversion is too large. Reduce the clip duration, FPS or output size.'}
 if(target==='apng'&&deflate===false)return{ok:false,estimate,issue:'apng',message:'APNG encoding is not supported in this browser. Choose GIF or Animated WebP.'}
 try{const plan=createSamplingPlan(info,settings);return{ok:true,estimate,plan,expectedDurationMs:validateTargetTiming(plan,target)}}
 catch{return{ok:false,estimate,issue:'timing',message:'This clip has a frame duration too short for the selected format. Adjust the end time or choose another output format.'}}
}
export function initialVideoSettings(info:VideoInspection,target:ConversionFormat):VideoSettings{
 const settings:VideoSettings={target,startUs:0,endUs:Math.min(info.durationUs,5_000_000),fps:defaultVideoFps(target),longSide:480}
 const size=outputSize(info.displayWidth,info.displayHeight,480)
 const budget=Math.min(VIDEO_INPUT_LIMITS.maxSampledFrames,Math.floor(VIDEO_INPUT_LIMITS.maxFramePixels/(size.width*size.height)))
 settings.endUs=Math.min(settings.endUs,offsetUs(budget,settings.fps))
 const preflight=estimateVideo(info,settings)
 if(!preflight.ok&&preflight.issue==='timing'){
  const frames=countGrid(0,settings.endUs,settings.fps)
  if(frames>1)settings.endUs=offsetUs(frames-1,settings.fps)
 }
 return settings
}
/** Native preview timelines may expose source offsets; conversion never reads currentTime. */
export function normalizedPreviewTime(current:number,nativeDuration:number,info:VideoInspection){
 const origin=info.visibleStartTicks/info.timeResolution,duration=info.durationUs/1e6
 const offset=origin>0&&Number.isFinite(nativeDuration)&&nativeDuration>=origin+duration-.05?origin:0
 return Math.max(0,Math.min(info.durationUs,Math.round((current-offset)*1e6)))
}
export function videoTime(us:number){const ms=Math.max(0,Math.round(us/1000));return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`}
