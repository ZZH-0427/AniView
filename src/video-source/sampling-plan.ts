import type { ConversionFormat } from '../conversion/model'
import { apngDelay } from '../conversion/apng-encoder'
import { VideoInputError, VIDEO_INPUT_LIMITS } from './model'
import type { SamplingPlan, VideoInspection, VideoSourceOptions } from './model'

const Q = 1_000_000n
export function offsetUs(index: number, fps: number): number {
  if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(fps) || fps < 1 || fps > 30) throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
  return Number((2n * BigInt(index) * Q + BigInt(fps)) / (2n * BigInt(fps)))
}
export function countGrid(startUs: number, endUs: number, fps: number) {
  if (![startUs,endUs,fps].every(Number.isSafeInteger) || startUs < 0 || endUs <= startUs || fps < 1 || fps > 30
    || endUs-startUs > VIDEO_INPUT_LIMITS.maxSelectedUs) throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
  const numerator = BigInt(fps) * (2n * BigInt(endUs-startUs) - 1n), denominator = 2n*Q
  return Number((numerator+denominator-1n)/denominator)
}
export function frameTime(plan: Pick<SamplingPlan,'startUs'|'endUs'|'fps'|'frameCount'>, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= plan.frameCount) throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
  const timeUs=plan.startUs+offsetUs(index,plan.fps)
  const durationUs=Math.min(plan.endUs,plan.startUs+offsetUs(index+1,plan.fps))-timeUs
  if (timeUs >= plan.endUs || durationUs <= 0) throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
  return {timeUs,durationUs,durationMs:durationUs/1000}
}
export function outputSize(displayWidth: number, displayHeight: number, longSide: VideoSourceOptions['longSide']) {
  if (![displayWidth,displayHeight].every(x=>Number.isFinite(x)&&x>0)) throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
  const scale=longSide==='original'?1:Math.min(1,longSide/Math.max(displayWidth,displayHeight))
  const width=Math.max(1,Math.round(displayWidth*scale)),height=Math.max(1,Math.round(displayHeight*scale))
  if (Math.max(width,height)>VIDEO_INPUT_LIMITS.maxOutputSide) throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
  return {width,height}
}
export function normalizeTimeline(firstVisibleSeconds: number, endSeconds: number, resolution: number) {
  if (!Number.isSafeInteger(resolution)||resolution<1 || ![firstVisibleSeconds,endSeconds].every(Number.isFinite)) throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
  const visibleStartTicks=Math.max(0,Math.round(firstVisibleSeconds*resolution)),visibleEndTicks=Math.round(endSeconds*resolution)
  if (![visibleStartTicks,visibleEndTicks].every(Number.isSafeInteger)||visibleEndTicks<=visibleStartTicks) throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
  return {visibleStartTicks,visibleEndTicks,durationUs:Number(BigInt(visibleEndTicks-visibleStartTicks)*Q/BigInt(resolution))}
}
export function createSamplingPlan(info: Pick<VideoInspection,'displayWidth'|'displayHeight'|'durationUs'>, options: VideoSourceOptions): SamplingPlan {
  if(options.endUs>info.durationUs)throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
  const size=outputSize(info.displayWidth,info.displayHeight,options.longSide)
  const frameCount=countGrid(options.startUs,options.endUs,options.fps), framePixels=size.width*size.height*frameCount
  if (frameCount>VIDEO_INPUT_LIMITS.maxSampledFrames || framePixels>VIDEO_INPUT_LIMITS.maxFramePixels) throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
  return {...size,frameCount,playCount:0,startUs:options.startUs,endUs:options.endUs,fps:options.fps,framePixels,durationUs:options.endUs-options.startUs}
}
export function validateTargetTiming(plan: SamplingPlan, target: ConversionFormat) {
  const allowed=target==='gif'?[5,10,20]:[5,10,15,20,24,30]
  if(!allowed.includes(plan.fps))throw new VideoInputError('VIDEO_TARGET_TIMING_UNSUPPORTED')
  let expectedDurationMs=0
  for(let n=0;n<plan.frameCount;n++){
    const {durationMs}=frameTime(plan,n)
    if(target==='gif'){
      const delay=Math.round(durationMs/10)*10
      if(delay<20)throw new VideoInputError('VIDEO_TARGET_TIMING_UNSUPPORTED')
      expectedDurationMs+=delay
    }else if(target==='apng'){
      const [num,den]=apngDelay(durationMs)
      if(num===0)throw new VideoInputError('VIDEO_TARGET_TIMING_UNSUPPORTED')
      expectedDurationMs+=1000*num/den
    }else{
      const a=offsetUs(n,plan.fps)/1000,b=Math.min(plan.durationUs,offsetUs(n+1,plan.fps))/1000
      if(Math.round(b)<=Math.round(a))throw new VideoInputError('VIDEO_TARGET_TIMING_UNSUPPORTED')
      expectedDurationMs=Math.round(b)
    }
  }
  return expectedDurationMs
}
