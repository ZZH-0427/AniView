import { VideoSource } from './video-source'
import { emptySourceMetrics, VIDEO_INPUT_LIMITS, VideoInputError } from './model'
import type { SourceRequest, SourceResponse } from './protocol'
let source:VideoSource|undefined,closing=false,readId=0
let readQueue=Promise.resolve()
const reads=new Map<number,{resolve(data:Uint8Array):void;reject(error:VideoInputError):void}>()
function send(message:SourceResponse,transfer:Transferable[]=[]){globalThis.postMessage(message,{transfer})}
function snapshot(full=false){
  const metrics=source?.metrics??emptySourceMetrics()
  return {...metrics,evidence:full?metrics.evidence:[]}
}
function read(start:number,end:number):Promise<Uint8Array>{
  const operation=async()=>{
    if(closing)throw new VideoInputError('CANCELLED')
    if(end-start>VIDEO_INPUT_LIMITS.maxReadChunk)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
    return new Promise<Uint8Array>((resolve,reject)=>{
      const requestId=++readId;reads.set(requestId,{resolve,reject});send({type:'read',requestId,start,end})
    })
  }
  const result=readQueue.then(operation)
  readQueue=result.then(()=>{},()=>{})
  return result
}
async function close(){
  closing=true
  for(const pending of reads.values())pending.reject(new VideoInputError('CANCELLED'))
  reads.clear()
  await source?.close()
}
let queue=Promise.resolve()
async function handle(request:Extract<SourceRequest,{id:number}>){
  if(closing)throw new VideoInputError('CANCELLED')
  if(request.type==='open'){
    source=new VideoSource(read,request.size,()=>send({type:'phase',metrics:snapshot()}))
    const inspection=await source.open()
    send({id:request.id,type:'ready',inspection,metrics:snapshot()})
  }else if(request.type==='configure'){
    if(!source)throw new VideoInputError('VIDEO_DECODE_FAILED')
    const plan=await source.configure(request.options);send({id:request.id,type:'configured',plan,metrics:snapshot()})
  }else if(request.type==='next'){
    if(!source)throw new VideoInputError('VIDEO_DECODE_FAILED')
    const frame=await source.next()
    if(!frame){send({id:request.id,type:'end',metrics:snapshot()});return}
    const metrics={...snapshot(),evidence:source.metrics.evidence.slice(-1)}
    source.transferred()
    send({id:request.id,type:'frame',frame,metrics:{...metrics,ownedRgba:0}},[frame.rgba])
    if(frame.rgba.byteLength)throw new VideoInputError('WORKER_FAILED')
  }
}
globalThis.addEventListener('message',(event:MessageEvent<SourceRequest>)=>{
  const request=event.data
  if(request.type==='read-result'||request.type==='read-error'){
    const pending=reads.get(request.requestId);reads.delete(request.requestId)
    if(pending){if(request.type==='read-error')pending.reject(new VideoInputError('VIDEO_DECODE_FAILED'));else pending.resolve(new Uint8Array(request.data))}
    return
  }
  if(request.type==='close'){
    void close().then(()=>send({id:request.id,type:'closed',metrics:snapshot(true)}))
      .catch(()=>send({id:request.id,type:'error',code:'WORKER_FAILED',metrics:snapshot(true)}))
    return
  }
  if(request.type==='ack'){
    try{source?.acknowledge()}catch{/* A close racing a late ACK cannot revive the job. */}
    return
  }
  queue=queue.then(()=>handle(request)).catch(async(error:unknown)=>{
    const code=closing?'CANCELLED':error instanceof VideoInputError?error.videoCode:'VIDEO_DECODE_FAILED'
    await close().catch(()=>{})
    send({id:request.id,type:'error',code,metrics:snapshot(true)})
  })
})
