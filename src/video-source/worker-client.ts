import type { AnimationFrameSource, CanonicalAnimationFrame } from '../conversion/model'
import type { VirtualFile } from '../input/virtual-file'
import { trackRuntimeResource } from '../media/runtime-diagnostics'
import { emptySourceMetrics, VIDEO_INPUT_LIMITS, VideoInputError } from './model'
import type { FrameEvidence, SamplingPlan, VideoInspection, VideoSourceMetrics, VideoSourceOptions } from './model'
import type { SourceRequest, SourceResponse } from './protocol'
import workerUrl from './source.worker.ts?worker&url'

type Command={type:'open';size:number}|{type:'configure';options:VideoSourceOptions}|{type:'next'}
export class VideoSourceAdapter implements AnimationFrameSource {
  private worker!:Worker
  private releaseWorker!:()=>void
  private pending:{id:number;resolve(r:SourceResponse):void;reject(e:VideoInputError):void}|undefined
  private id=0
  private epoch=0
  private terminated=false
  private closing:Promise<void>|undefined
  private closedResolve:(()=>void)|undefined
  private closeTimer:ReturnType<typeof setTimeout>|undefined
  private deadline:ReturnType<typeof setTimeout>|undefined
  private held:ArrayBuffer|undefined
  private plan:SamplingPlan|undefined
  private selection:VideoSourceOptions|undefined
  private file:VirtualFile
  private statistics=emptySourceMetrics()
  private readonly traces=new Map<number,FrameEvidence>()
  inspection:VideoInspection|undefined
  readonly cleanup={softClosed:false,hardTerminated:false}
  private readonly abort=()=>{void this.close()}
  constructor(file:VirtualFile,private readonly signal?:AbortSignal,private readonly onMetrics?:(metrics:VideoSourceMetrics)=>void){
    this.file=file
    if(signal?.aborted)throw new VideoInputError('CANCELLED')
    this.startWorker()
  }
  private startWorker(){
    const epoch=++this.epoch
    try{this.worker=new Worker(new URL(workerUrl,import.meta.url),{type:'module'})}catch{throw new VideoInputError('WORKER_FAILED')}
    this.releaseWorker=trackRuntimeResource('worker')
    this.worker.onmessage=(event:MessageEvent<SourceResponse>)=>{void this.receive(event.data,epoch)}
    this.worker.onerror=e=>{e.preventDefault();if(epoch===this.epoch)this.fail(new VideoInputError('WORKER_FAILED'))}
    this.worker.onmessageerror=()=>{if(epoch===this.epoch)this.fail(new VideoInputError('WORKER_FAILED'))}
    this.signal?.addEventListener('abort',this.abort,{once:true})
    this.deadline=setTimeout(()=>this.fail(new VideoInputError('VIDEO_JOB_DEADLINE')),VIDEO_INPUT_LIMITS.deadlineMs)
  }
  get metadata():SamplingPlan{if(!this.plan)throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT');return this.plan}
  get metrics(){return this.statistics}
  private update(metrics:VideoSourceMetrics){
    for(const trace of metrics.evidence)this.traces.set(trace.index,trace)
    this.statistics={...metrics,evidence:[...this.traces.values()]}
    try{this.onMetrics?.(this.statistics)}catch{/* Local observation does not own the job. */}
  }
  private async receive(response:SourceResponse,epoch:number){
    if(this.terminated||epoch!==this.epoch)return
    if(response.type==='read'){
      if(this.closing)return
      const {start,end,requestId}=response
      try{
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>this.file.size||end<start||end-start>VIDEO_INPUT_LIMITS.maxReadChunk)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
        const data=await this.file.read(start,end)
        if(this.terminated||this.closing||epoch!==this.epoch)return
        if(data.byteLength!==end-start)throw new VideoInputError('VIDEO_DECODE_FAILED')
        this.worker.postMessage({type:'read-result',requestId,data} satisfies SourceRequest,[data])
      }catch{if(!this.terminated&&!this.closing&&epoch===this.epoch)this.worker.postMessage({type:'read-error',requestId} satisfies SourceRequest)}
      return
    }
    this.update(response.metrics)
    if(response.type==='phase')return
    if(response.type==='closed'){
      this.cleanup.softClosed=true;this.terminate();this.closedResolve?.();return
    }
    const pending=this.pending
    if(!pending||response.id!==pending.id)return
    this.pending=undefined
    if(response.type==='error')pending.reject(new VideoInputError(response.code));else pending.resolve(response)
  }
  private request(command:Command):Promise<SourceResponse>{
    if(this.terminated||this.closing||this.pending||this.signal?.aborted)return Promise.reject(new VideoInputError('CANCELLED'))
    return new Promise((resolve,reject)=>{
      const id=++this.id;this.pending={id,resolve,reject}
      try{this.worker.postMessage({...command,id} satisfies SourceRequest)}catch{this.fail(new VideoInputError('WORKER_FAILED'))}
    })
  }
  private fail(error:VideoInputError){
    this.pending?.reject(error);this.pending=undefined
    void this.close()
  }
  async open(){
    const response=await this.request({type:'open',size:this.file.size})
    if(response.type!=='ready')throw new VideoInputError('WORKER_FAILED')
    this.inspection=response.inspection;return response.inspection
  }
  async configure(options:VideoSourceOptions){
    const response=await this.request({type:'configure',options})
    if(response.type!=='configured')throw new VideoInputError('WORKER_FAILED')
    this.plan=response.plan;this.selection=options;return this.plan
  }
  async next():Promise<CanonicalAnimationFrame|null>{
    if(this.held)throw new VideoInputError('VIDEO_DECODE_FAILED')
    const response=await this.request({type:'next'})
    if(response.type==='end')return null
    if(response.type!=='frame')throw new VideoInputError('WORKER_FAILED')
    this.held=response.frame.rgba;return response.frame
  }
  acknowledgeFrame(){
    if(this.terminated||this.closing||!this.held||this.held.byteLength!==0)throw new VideoInputError('VIDEO_DECODE_FAILED')
    this.held=undefined;this.worker.postMessage({type:'ack'} satisfies SourceRequest)
  }
  async reset():Promise<void>{
    if(this.held||this.pending||this.closing||this.terminated||!this.selection||this.signal?.aborted)throw new VideoInputError('VIDEO_DECODE_FAILED')
    const selection=this.selection
    await this.close()
    if(this.signal?.aborted)throw new VideoInputError('CANCELLED')
    this.terminated=false;this.closing=undefined;this.closedResolve=undefined;this.closeTimer=undefined;this.deadline=undefined
    this.plan=undefined;this.statistics=emptySourceMetrics();this.traces.clear()
    this.cleanup.softClosed=false;this.cleanup.hardTerminated=false
    this.startWorker()
    try{await this.open();await this.configure(selection)}catch(error){await this.close();throw error}
  }
  close():Promise<void>{
    if(this.closing)return this.closing
    if(this.terminated)return Promise.resolve()
    this.closing=new Promise(resolve=>{this.closedResolve=resolve})
    this.signal?.removeEventListener('abort',this.abort)
    if(this.deadline)clearTimeout(this.deadline)
    this.pending?.reject(new VideoInputError('CANCELLED'));this.pending=undefined;this.held=undefined
    this.closeTimer=setTimeout(()=>{
      this.cleanup.hardTerminated=true;this.terminate();this.closedResolve?.()
    },1000)
    try{this.worker.postMessage({type:'close',id:++this.id} satisfies SourceRequest)}
    catch{this.cleanup.hardTerminated=true;this.terminate();this.closedResolve?.()}
    return this.closing
  }
  private terminate(){
    if(this.terminated)return
    this.terminated=true
    this.epoch++
    if(this.closeTimer)clearTimeout(this.closeTimer)
    if(this.deadline)clearTimeout(this.deadline)
    this.worker.terminate();this.releaseWorker()
  }
}
