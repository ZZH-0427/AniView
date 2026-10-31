import type { VirtualFile } from '../../input/virtual-file'
import { openAnimationFrameSource } from '../../conversion/frame-source'
import type { AnimationFrameSource, ConversionFormat, CanonicalAnimationFrame } from '../../conversion/model'
import { trackRuntimeResource } from '../../media/runtime-diagnostics'
import type { FrameFingerprint } from '../conversion/fixtures'
import type { FrameEvidence, SamplingPlan } from '../../video-source/model'
import { VideoInputError } from '../../video-source/model'
import { frameTime } from '../../video-source/sampling-plan'
import { apngDelay } from '../../conversion/apng-encoder'
import type { VerifyRequest } from './verify.worker'
export interface DecodedEvidence {fingerprint:FrameFingerprint;label:number;corners:string[]}
export interface FixtureRecord {
  name:string;width:number;height:number;codec:string;rotation:number;flip:boolean;displayWidth:number;displayHeight:number
  pts:number[];ids:number[];duration:number;origin?:number
  scene?:'photo'|'markers'
}
class Inspector{
  private readonly worker=new Worker(new URL('./verify.worker.ts',import.meta.url),{type:'module'})
  private readonly release=trackRuntimeResource('worker')
  private nextId=0
  private pending:{resolve(value:DecodedEvidence):void;reject(error:VideoInputError):void}|undefined
  private closed=false
  constructor(){
    this.worker.onmessage=(event:MessageEvent<DecodedEvidence&{id:number}>)=>{this.pending?.resolve(event.data);this.pending=undefined}
    this.worker.onerror=e=>{e.preventDefault();this.close()}
  }
  inspect(frame:CanonicalAnimationFrame,width:number,height:number,rotation:number,flip:boolean){
    if(this.closed||this.pending)return Promise.reject(new VideoInputError('CANCELLED'))
    return new Promise<DecodedEvidence>((resolve,reject)=>{
      this.pending={resolve,reject};this.worker.postMessage({id:++this.nextId,frame,width,height,rotation,flip} satisfies VerifyRequest,[frame.rgba])
      if(frame.rgba.byteLength!==0)this.close()
    })
  }
  close(){if(this.closed)return;this.closed=true;this.worker.terminate();this.release();this.pending?.reject(new VideoInputError('CANCELLED'));this.pending=undefined}
}
export async function inspectAnimation(file:VirtualFile,target:ConversionFormat,fixture:Pick<FixtureRecord,'rotation'|'flip'>,signal:AbortSignal){
  const inspector=new Inspector()
  let source:AnimationFrameSource|undefined
  const abort=()=>{inspector.close();void source?.close()}
  signal.addEventListener('abort',abort,{once:true})
  try{
    if(signal.aborted)throw new VideoInputError('CANCELLED')
    source=await openAnimationFrameSource(file,target,signal)
    const frames:DecodedEvidence[]=[]
    while(true){
      const frame=await source.next();if(!frame)break
      frames.push(await inspector.inspect(frame,source.metadata.width,source.metadata.height,fixture.rotation,fixture.flip))
      source.acknowledgeFrame()
    }
    return{metadata:source.metadata,frames}
  }finally{signal.removeEventListener('abort',abort);inspector.close();await source?.close()}
}
export function verifyOutput(plan:SamplingPlan,target:ConversionFormat,fixture:FixtureRecord|undefined,
  expected:readonly FrameEvidence[],decoded:Awaited<ReturnType<typeof inspectAnimation>>){
  const fail=(message:string):never=>{throw new Error(message)}
  if(decoded.metadata.width!==plan.width||decoded.metadata.height!==plan.height)fail('OUTPUT_DIMENSIONS')
  if(decoded.metadata.playCount!==0)fail('OUTPUT_LOOP')
  if(target!=='webp'&&decoded.metadata.frameCount!==plan.frameCount)fail('OUTPUT_FRAME_COUNT')
  if(decoded.metadata.frameCount>plan.frameCount||expected.length!==plan.frameCount)fail('OUTPUT_FRAME_COUNT')
  let actualTotal=0
  const ends=decoded.frames.map(f=>actualTotal+=f.fingerprint.durationMs)
  let encodedTime=0,errorSum=0,channels=0,maxError=0,labelMatches=true,sourcePtsMatches=true
  const histogram=new Uint32Array(256),labels:number[]=[]
  for(let n=0;n<plan.frameCount;n++){
    const timing=frameTime(plan,n)
    let duration:number
    if(target==='gif')duration=Math.round(timing.durationMs/10)*10
    else if(target==='apng'){const [a,b]=apngDelay(timing.durationMs);duration=1000*a/b}
    else duration=Math.round((timing.timeUs-plan.startUs+timing.durationUs)/1000)-Math.round((timing.timeUs-plan.startUs)/1000)
    const query=encodedTime+Math.min(duration/2,.01)
    const index=ends.findIndex(end=>end>query+1e-6)
    const actual=decoded.frames[index],reference=expected[n]
    if(!actual||!reference)fail('OUTPUT_TIMELINE')
    for(let c=0;c<reference!.samples.length;c++){
      const error=Math.abs(reference!.samples[c]!-actual!.fingerprint.samples[c]!)
      errorSum+=error;channels++;histogram[error]=histogram[error]!+1;maxError=Math.max(maxError,error)
    }
    if(target!=='gif'&&reference!.rgbaHash!==null&&reference!.rgbaHash!==actual!.fingerprint.rgbaHash)fail('LOSSLESS_HASH')
    if(fixture){
      let chosen=-1
      for(let i=0;i<fixture.pts.length;i++)if(Math.floor(fixture.pts[i]!*1e6+.5)<=timing.timeUs)chosen=i
      if(chosen<0)fail('ORACLE_QUERY')
      const id=fixture.ids[chosen]!,sourceTime=fixture.pts[chosen]!+(fixture.origin??0)
      if(fixture.scene!=='photo'){labels.push(actual!.label);labelMatches&&=actual!.label===id}
      sourcePtsMatches&&=Math.abs(reference!.sourceTimestamp-sourceTime)<.0001
      if(fixture.scene!=='photo'&&actual!.corners.join(',')!=='red,green,blue,yellow')fail('ORIENTATION_CORNERS')
    }
    encodedTime+=duration
  }
  if(!labelMatches)fail('VISUAL_PRESENTATION_ORDER')
  if(!sourcePtsMatches)fail('SOURCE_PTS_ORACLE')
  if(Math.abs(actualTotal-encodedTime)>1)fail('OUTPUT_DURATION')
  let sum=0,p95=0
  for(let e=0;e<256;e++){sum+=histogram[e]!;if(sum>=Math.ceil(channels*.95)){p95=e;break}}
  if(target!=='gif'&&maxError!==0)fail('LOSSLESS_PIXELS')
  if(target==='gif'&&errorSum/Math.max(1,channels)>8)fail('GIF_COLOR_TOLERANCE')
  return{actualFrameCount:decoded.metadata.frameCount,canonicalFrames:plan.frameCount,
    canonicalDurationMs:plan.durationUs/1000,expectedEncodedMs:encodedTime,decodedDurationMs:actualTotal,
    durationErrorMs:actualTotal-encodedTime,labelMatches:fixture?.scene==='photo'?null:labelMatches,sourcePtsMatches,labels,
    meanRgbaError:errorSum/Math.max(1,channels),p95Error:p95,maxError}
}
