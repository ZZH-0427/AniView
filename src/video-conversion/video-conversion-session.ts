import {browserFile} from '../input/browser-file'
import type {VirtualFile} from '../input/virtual-file'
import {BinaryFormatDetector} from '../formats/binary-detector'
import type {FormatDetector} from '../formats/detector'
import {ConversionError} from '../conversion/model'
import type {ConversionFormat} from '../conversion/model'
import {inspectConversionOutput} from '../conversion/output-inspection'
import {openAnimationFrameSource} from '../conversion/frame-source'
import {createAnimationDownloadNamer} from '../creation/download-name'
import {emptySourceMetrics,VIDEO_INPUT_LIMITS,VideoInputError} from '../video-source/model'
import type {VideoInspection,VideoSourceMetrics} from '../video-source/model'
import {estimateVideo,initialVideoSettings,videoFps,defaultVideoFps} from './settings'
import type {Preflight,VideoSettings} from './settings'
import {videoProductError} from './errors'
import type {VideoProductError} from './errors'
import {recordVideoAnimationCleanup} from './cleanup'
import {observeVideoHeartbeat} from './heartbeat'
export type VideoRuntime=Pick<typeof import('./runtime'),'prepare'|'convert'>
export const videoBusy=(status:string)=>['preparing','converting','verifying','cancelling'].includes(status)
const initialDiagnostics=()=>({videoAnimationJobsStarted:0,videoAnimationJobsCompleted:0,videoAnimationCancellations:0,
 activeVideoSourceWorkers:0,activeEncoderWorkers:0,activeOutputDecoderWorkers:0,activeSamples:0,activeCanvases:0,activeImageData:0,
 ownedRgba:0,awaitingAck:0,activeObjectUrls:0,cleanupErrors:0,sampledFrames:0,actualOutputFrames:0,
 sourceSamplesObserved:0,sourcePixelsObserved:0,trackParFallbackSamples:0,peakCanonicalRgba:0,peakAppSamples:0,
 softClosed:null as boolean|null,hardTerminated:null as boolean|null,
 heartbeat:{maxGapMs:0,maxVisibleGapMs:0,hiddenDuringJob:false,gaps:[] as {gapMs:number;wallGapMs:number;hidden:boolean}[]}})
export interface VideoAnimationResult {
 blob:Blob;url:string;filename:string;format:ConversionFormat;sampledFrames:number
 metadata:{width:number;height:number;frameCount:number;durationMs:number;playCount:number}
}
export interface VideoConversionSnapshot {
 status:'idle'|'preparing'|'ready'|'converting'|'verifying'|'cancelling'|'cancelled'|'success'|'error'
 sourceName?:string|undefined;previewUrl?:string|undefined;metadata?:VideoInspection|undefined
 settings:VideoSettings;preflight?:Preflight|undefined;deflate:boolean|null;jobId:number
 progress?:{stage:'preparing'|'sampling'|'encoding'|'finalizing'|'checking';current:number;total:number;fraction:number}|undefined
 result?:VideoAnimationResult|undefined;error?:VideoProductError|undefined;diagnostics:ReturnType<typeof initialDiagnostics>
}
interface Dependencies {
 load?:()=>Promise<VideoRuntime>;inspect?:typeof inspectConversionOutput
 createUrl?:(blob:Blob)=>string;revokeUrl?:(url:string)=>void
 detector?:FormatDetector
}
/** Owns one borrowed File, source URL and encoded result; never owns a decoded frame list. */
export class VideoConversionSession {
 private state:VideoConversionSnapshot={status:'idle',settings:{target:'webp',startUs:0,endUs:0,fps:15,longSide:480},deflate:null,jobId:0,diagnostics:initialDiagnostics()}
 private listeners=new Set<()=>void>()
 private generation=0;private owner=0;private disposed=false
 private abort:AbortController|undefined;private task=Promise.resolve();private disposal:Promise<void>|undefined
 private file:VirtualFile|undefined;private sourceUrl:string|undefined;private resultUrl:string|undefined
 private inputFile:File|undefined
 private namer:(()=>string)|undefined
 private readonly workers=new Set<string>()
 private readonly load:()=>Promise<VideoRuntime>;private readonly inspect:typeof inspectConversionOutput
 private readonly createUrl:(blob:Blob)=>string;private readonly revokeUrl:(url:string)=>void
 private readonly detector:FormatDetector
 constructor(dependencies:Dependencies={}){
  this.load=dependencies.load??(()=>import('./runtime'));this.inspect=dependencies.inspect??inspectConversionOutput
  this.createUrl=dependencies.createUrl??(blob=>URL.createObjectURL(blob));this.revokeUrl=dependencies.revokeUrl??(url=>URL.revokeObjectURL(url))
  this.detector=dependencies.detector??new BinaryFormatDetector()
 }
 getSnapshot=()=>this.state
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private publish(patch:Partial<VideoConversionSnapshot>){this.state={...this.state,...patch};if(!this.disposed)for(const listener of this.listeners)listener()}
 private diagnostic(patch:Partial<VideoConversionSnapshot['diagnostics']>){this.publish({diagnostics:{...this.state.diagnostics,...patch}})}
 private valid(id:number){return!this.disposed&&id===this.generation}
 private enqueue(work:()=>Promise<void>){this.task=this.task.catch(()=>{}).then(work);return this.task}
 private worker(id:number,kind:'source'|'encoder',active:boolean){const key=id+':'+kind;if(active)this.workers.add(key);else this.workers.delete(key)
  this.diagnostic({activeVideoSourceWorkers:[...this.workers].filter(k=>k.endsWith(':source')).length,activeEncoderWorkers:[...this.workers].filter(k=>k.endsWith(':encoder')).length})}
 private metrics(id:number,m:VideoSourceMetrics){if(id!==this.owner)return
  this.diagnostic({activeSamples:m.activeSamples,activeCanvases:m.activeCanvases,activeImageData:m.activeImageData,ownedRgba:m.ownedRgba,awaitingAck:m.awaitingAck,
   sourceSamplesObserved:m.observedSourceSamples,sourcePixelsObserved:m.observedSourcePixels,trackParFallbackSamples:m.trackParFallbackSamples,
   peakAppSamples:Math.max(this.state.diagnostics.peakAppSamples,m.peakSamples),peakCanonicalRgba:Math.max(this.state.diagnostics.peakCanonicalRgba,m.peakOwnedRgba),cleanupErrors:Math.max(this.state.diagnostics.cleanupErrors,m.cleanupErrors)})}
 private revoke(which:'source'|'result'){
  const url=which==='source'?this.sourceUrl:this.resultUrl;if(!url)return
  if(which==='source')this.sourceUrl=undefined;else this.resultUrl=undefined
  try{this.revokeUrl(url)}catch{this.diagnostic({cleanupErrors:this.state.diagnostics.cleanupErrors+1})}
  this.diagnostic({activeObjectUrls:Number(!!this.sourceUrl)+Number(!!this.resultUrl)})
 }
 private async runtime(signal:AbortSignal){
  if(signal.aborted)throw new VideoInputError('CANCELLED')
  let stop=()=>{}
  const cancelled=new Promise<never>((_,reject)=>{stop=()=>reject(new VideoInputError('CANCELLED'));signal.addEventListener('abort',stop,{once:true})})
  try{return await Promise.race([this.load(),cancelled])}finally{signal.removeEventListener('abort',stop)}
 }
 select(file:File):Promise<void>{
  if(this.disposed)return Promise.resolve()
  const id=++this.generation;this.abort?.abort();const abort=new AbortController();this.abort=abort
  if(['converting','verifying'].includes(this.state.status))this.diagnostic({videoAnimationCancellations:this.state.diagnostics.videoAnimationCancellations+1})
  this.revoke('source');this.revoke('result');this.namer=undefined;this.file=browserFile(file);this.inputFile=file
  this.publish({status:'preparing',sourceName:file.name,previewUrl:undefined,metadata:undefined,result:undefined,error:undefined,preflight:undefined,deflate:null,progress:undefined,jobId:id})
  return this.enqueue(async()=>{
   if(!this.valid(id))return;this.owner=id
   try{
    if(file.size>VIDEO_INPUT_LIMITS.maxSourceBytes)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
    const runtime=await this.runtime(abort.signal);if(!this.valid(id))return
    const prepared=await runtime.prepare(browserFile(file),abort.signal,{worker:(kind,active)=>this.worker(id,kind,active),metrics:m=>this.metrics(id,m)})
    if(!this.valid(id)||abort.signal.aborted)return
    const settings=initialVideoSettings(prepared.info,this.state.settings.target)
    this.sourceUrl=this.createUrl(file)
    this.publish({status:'ready',metadata:prepared.info,settings,deflate:prepared.deflate,previewUrl:this.sourceUrl,
     preflight:estimateVideo(prepared.info,settings,prepared.deflate)})
    this.diagnostic({activeObjectUrls:1})
   }catch(cause){if(this.valid(id))this.publish({status:abort.signal.aborted?'cancelled':'error',error:abort.signal.aborted?undefined:videoProductError(cause)})}
   finally{if(this.abort===abort)this.abort=undefined}
  })
 }
 retryPrepare(){return this.inputFile?this.select(this.inputFile):Promise.resolve()}
 update(patch:Partial<VideoSettings>){
  if(this.disposed||videoBusy(this.state.status)||!this.state.metadata)return
  const settings={...this.state.settings,...patch}
  if(!['gif','webp','apng'].includes(settings.target)||![360,480,720,'original'].includes(settings.longSide))return
  if(!videoFps(settings.target).includes(settings.fps))settings.fps=defaultVideoFps(settings.target)
  this.revoke('result');this.namer=undefined
  this.publish({settings,result:undefined,status:'ready',error:undefined,progress:undefined,preflight:estimateVideo(this.state.metadata,settings,this.state.deflate)})
 }
 start():Promise<void>{
  if(this.disposed||videoBusy(this.state.status)||!this.file||!this.state.metadata)return Promise.resolve()
  const preflight=estimateVideo(this.state.metadata,this.state.settings,this.state.deflate)
  this.publish({preflight});if(!preflight.ok)return Promise.resolve()
  const file=this.file,settings={...this.state.settings},id=++this.generation,abort=new AbortController();this.abort=abort
  this.revoke('result');this.publish({status:'converting',result:undefined,error:undefined,jobId:id,progress:{stage:'preparing',current:0,total:preflight.plan.frameCount,fraction:0}})
  this.diagnostic({videoAnimationJobsStarted:this.state.diagnostics.videoAnimationJobsStarted+1,sampledFrames:0,actualOutputFrames:0})
  return this.enqueue(async()=>{
   if(!this.valid(id))return;this.owner=id;this.metrics(id,emptySourceMetrics())
   let expired=false;const timer=setTimeout(()=>{expired=true;abort.abort()},VIDEO_INPUT_LIMITS.deadlineMs),heartbeat=observeVideoHeartbeat()
   try{
    const runtime=await this.runtime(abort.signal);if(!this.valid(id))return
    const output=await runtime.convert(file,settings.target,settings,{signal:abort.signal,
     onWorker:(kind,active)=>this.worker(id,kind,active),onSourceMetrics:m=>this.metrics(id,m),
     onSourceClosed:(cleanup,m)=>{this.metrics(id,m);this.diagnostic(cleanup)},
     onProgress:p=>{if(!this.valid(id))return;const stage=p.phase==='opening'?'preparing':p.phase==='decoding'?'sampling':p.phase
      const fraction=p.totalFrames?Math.max(this.state.progress?.fraction??0,(2*p.currentFrame+(p.phase==='encoding'?1:0))/(2*p.totalFrames)):0
      this.publish({progress:{stage,current:p.currentFrame,total:p.totalFrames||preflight.plan.frameCount,fraction}})},
    })
    if(!this.valid(id)||abort.signal.aborted)return
    if(output.transferredFrames!==preflight.plan.frameCount||output.plan.frameCount!==preflight.plan.frameCount
     ||output.plan.width!==preflight.plan.width||output.plan.height!==preflight.plan.height)throw new ConversionError('TARGET_ENCODE_FAILED')
    this.diagnostic({sampledFrames:output.transferredFrames,peakCanonicalRgba:Math.max(this.state.diagnostics.peakCanonicalRgba,output.peakRgbaFrames)})
    this.publish({status:'verifying',progress:{stage:'checking',current:output.transferredFrames,total:output.transferredFrames,fraction:1}})
    const blob=new Blob([new Uint8Array(output.data,0,output.byteLength)],{type:settings.target==='gif'?'image/gif':settings.target==='webp'?'image/webp':'image/png'})
    const namer=createAnimationDownloadNamer(file.name,settings.target==='apng'?'png':settings.target)
    const virtual:VirtualFile={name:namer(),size:blob.size,source:'file',read:(start,end)=>blob.slice(start,end).arrayBuffer()}
    const detected=await this.detector.detect(virtual,abort.signal)
    if(detected.kind!==settings.target)throw new ConversionError('TARGET_ENCODE_FAILED')
    this.diagnostic({activeOutputDecoderWorkers:1})
    let metadata
    try{metadata=await this.inspect(virtual,settings.target,abort.signal,openAnimationFrameSource)}finally{this.diagnostic({activeOutputDecoderWorkers:0})}
    if(!this.valid(id)||abort.signal.aborted)return
    if(metadata.width!==preflight.plan.width||metadata.height!==preflight.plan.height||metadata.playCount!==0
     ||metadata.frameCount<1||(settings.target==='webp'?metadata.frameCount>preflight.plan.frameCount:metadata.frameCount!==preflight.plan.frameCount)
     ||!Number.isFinite(metadata.durationMs)||Math.abs(metadata.durationMs-preflight.expectedDurationMs)>1)throw new ConversionError('TARGET_ENCODE_FAILED')
    this.resultUrl=this.createUrl(blob);this.namer=namer
    this.publish({status:'success',progress:undefined,result:{blob,url:this.resultUrl,filename:virtual.name,format:settings.target,sampledFrames:output.transferredFrames,metadata}})
    this.diagnostic({videoAnimationJobsCompleted:this.state.diagnostics.videoAnimationJobsCompleted+1,actualOutputFrames:metadata.frameCount,activeObjectUrls:2})
   }catch(cause){const code=videoProductError(cause),error=this.state.status==='verifying'&&!['WORKER_FAILED','RESOURCE_LIMIT'].includes(code)?'TARGET_ENCODE_FAILED':code
    if(this.valid(id))this.publish({status:abort.signal.aborted&&!expired?'cancelled':'error',progress:undefined,error:expired?'VIDEO_JOB_DEADLINE':abort.signal.aborted?undefined:error})}
   finally{clearTimeout(timer);this.diagnostic({heartbeat:heartbeat()});if(this.abort===abort)this.abort=undefined}
  })
 }
 async cancel(){
  if(this.disposed||!videoBusy(this.state.status)||this.state.status==='cancelling')return
  const id=++this.generation;this.abort?.abort();this.publish({status:'cancelling'})
  this.diagnostic({videoAnimationCancellations:this.state.diagnostics.videoAnimationCancellations+1})
  await this.task;if(this.valid(id))this.publish({status:'cancelled',error:undefined,progress:undefined})
 }
 nextDownloadName(){return this.namer?.()??''}
 dispose():Promise<void>{
  if(this.disposal)return this.disposal
  if(['converting','verifying'].includes(this.state.status))this.diagnostic({videoAnimationCancellations:this.state.diagnostics.videoAnimationCancellations+1})
  this.disposed=true;++this.generation;this.abort?.abort();this.revoke('source');this.revoke('result')
  this.disposal=(async()=>{await this.task;this.file=undefined;this.inputFile=undefined;this.publish({sourceName:undefined,metadata:undefined,previewUrl:undefined,result:undefined,progress:undefined})
   recordVideoAnimationCleanup(this.state.diagnostics);this.listeners.clear()})()
  return this.disposal
 }
}
