import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import { VideoSourceAdapter } from './worker-client'
import { createSamplingPlan } from './sampling-plan'
import { emptySourceMetrics } from './model'
import type { VideoInspection,VideoSourceMetrics } from './model'
import type { SourceRequest,SourceResponse } from './protocol'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'
const info:VideoInspection={container:'mp4',codec:'avc',codecString:'avc1.64001f',codedWidth:2,codedHeight:1,displayWidth:2,displayHeight:1,
  squarePixelWidth:2,squarePixelHeight:1,rotation:0,flip:false,timeResolution:1000,visibleStartTicks:0,visibleEndTicks:1000,durationUs:1_000_000,
  firstPacketTimestamp:0,secureContext:true,apiPresent:true,configSupported:true,decoderInitialized:true,firstDecoded:true,firstDraw:true,
  nativeMemoryBytes:null,colorPolicy:'SDR8-browser-to-sRGB',alpha:false,audio:'ignored',trackSelection:'primary'}
const options={startUs:0,endUs:100_000,fps:10,longSide:480 as const}
const instances:FakeWorker[]=[]
class FakeWorker{
  onmessage:((event:MessageEvent<SourceResponse>)=>void)|null=null
  onerror:((event:{preventDefault():void})=>void)|null=null
  onmessageerror:(()=>void)|null=null
  terminated=false;acks=0;ignoreOpen=false;ignoreClose=false
  posts:SourceRequest[]=[]
  metrics:VideoSourceMetrics=emptySourceMetrics()
  constructor(){instances.push(this)}
  emit(data:SourceResponse,transfer:Transferable[]=[]){const cloned=structuredClone(data,{transfer});queueMicrotask(()=>{if(!this.terminated)this.onmessage?.(new MessageEvent('message',{data:cloned}))})}
  postMessage(original:SourceRequest,transfer:Transferable[]=[]){
    const m=structuredClone(original,{transfer})
    this.posts.push(m)
    if(m.type==='open'&&!this.ignoreOpen)this.emit({id:m.id,type:'ready',inspection:info,metrics:this.metrics})
    if(m.type==='configure')this.emit({id:m.id,type:'configured',plan:createSamplingPlan(info,m.options),metrics:this.metrics})
    if(m.type==='next'){
      const rgba=new ArrayBuffer(8);this.metrics.awaitingAck=1
      this.emit({id:m.id,type:'frame',frame:{index:0,durationMs:100,rgba},metrics:this.metrics},[rgba])
      expect(rgba.byteLength).toBe(0)
    }
    if(m.type==='ack'){this.acks++;this.metrics.awaitingAck=0}
    if(m.type==='close'&&!this.ignoreClose){this.metrics.activeSamples=0;this.metrics.awaitingAck=0;this.emit({id:m.id,type:'closed',metrics:this.metrics})}
  }
  terminate(){this.terminated=true}
}
const file={name:'not-logged.mp4',size:8,source:'file' as const,read:async()=>new ArrayBuffer(8)}
beforeEach(()=>{instances.length=0;vi.stubGlobal('Worker',FakeWorker)})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();expect(runtimeDiagnostics.getSnapshot().activeWorkers).toBe(0)})
it('requires detached-buffer acceptance before another pull',async()=>{
  const source=new VideoSourceAdapter(file)
  try{
    await source.open();await source.configure(options)
    const frame=await source.next();expect(frame).not.toBeNull()
    await expect(source.next()).rejects.toThrow()
    expect(()=>source.acknowledgeFrame()).toThrow()
    structuredClone(frame!.rgba,{transfer:[frame!.rgba]})
    source.acknowledgeFrame();expect(instances[0]!.acks).toBe(1)
    expect(()=>source.acknowledgeFrame()).toThrow()
  }finally{await source.close()}
  expect(source.cleanup).toEqual({softClosed:true,hardTerminated:false})
})
it('reset terminates the prior realm before creating a fresh source',async()=>{
  const source=new VideoSourceAdapter(file)
  try{
    await source.open();await source.configure(options)
    const old=instances[0]!
    const late=old.onmessage
    await source.reset()
    expect(old.terminated).toBe(true);expect(instances.length).toBe(2)
    expect(source.metadata.frameCount).toBe(1)
    late?.(new MessageEvent('message',{data:{id:0,type:'closed',metrics:emptySourceMetrics()}}))
    expect(instances[1]!.terminated).toBe(false)
    expect((await source.next())!.index).toBe(0)
  }finally{await source.close()}
})
it('cancellation rejects pending work and releases the worker',async()=>{
  const controller=new AbortController(),source=new VideoSourceAdapter(file,controller.signal)
  instances[0]!.ignoreOpen=true
  const pending=expect(source.open()).rejects.toMatchObject({videoCode:'CANCELLED'})
  controller.abort();await pending;await source.close()
  expect(instances[0]!.terminated).toBe(true)
})
it('hard stop is explicit and never fabricates a measured zero snapshot',async()=>{
  vi.useFakeTimers()
  const source=new VideoSourceAdapter(file)
  instances[0]!.metrics.activeSamples=1
  await source.open();instances[0]!.ignoreClose=true
  const closing=source.close()
  await vi.advanceTimersByTimeAsync(1001);await closing
  expect(source.cleanup.hardTerminated).toBe(true)
  expect(source.cleanup.softClosed).toBe(false)
  expect(source.metrics.activeSamples).toBe(1)
})
it('worker failures reject the current request instead of timing out',async()=>{
  const source=new VideoSourceAdapter(file)
  instances[0]!.ignoreOpen=true
  const pending=expect(source.open()).rejects.toMatchObject({videoCode:'WORKER_FAILED'})
  instances[0]!.onerror?.({preventDefault(){}})
  await pending;await source.close()
})
it('deadline has a distinct code and closes the source',async()=>{
  vi.useFakeTimers()
  const source=new VideoSourceAdapter(file);instances[0]!.ignoreOpen=true
  const pending=expect(source.open()).rejects.toMatchObject({videoCode:'VIDEO_JOB_DEADLINE'})
  await vi.advanceTimersByTimeAsync(120_001);await pending;await source.close()
})
it('an already aborted job never creates a worker',()=>{
  const controller=new AbortController();controller.abort()
  expect(()=>new VideoSourceAdapter(file,controller.signal)).toThrow()
  expect(instances.length).toBe(0)
})
it('range reads transfer only bounded bytes without sending the filename',async()=>{
  const bytes=new ArrayBuffer(8),read=vi.fn(async()=>bytes),source=new VideoSourceAdapter({...file,read})
  try{
    await source.open()
    instances[0]!.emit({type:'read',requestId:11,start:0,end:8})
    await vi.waitFor(()=>expect(instances[0]!.posts.some(p=>p.type==='read-result')).toBe(true))
    expect(read).toHaveBeenCalledWith(0,8);expect(bytes.byteLength).toBe(0)
    expect(JSON.stringify(instances[0]!.posts)).not.toContain(file.name)
  }finally{await source.close()}
})
it('invalid read bounds never reach the borrowed file provider',async()=>{
  const read=vi.fn(file.read),source=new VideoSourceAdapter({...file,read})
  try{
    await source.open();instances[0]!.emit({type:'read',requestId:12,start:0,end:9})
    await vi.waitFor(()=>expect(instances[0]!.posts.some(p=>p.type==='read-error')).toBe(true))
    expect(read).not.toHaveBeenCalled()
  }finally{await source.close()}
})
it('late reads from a closed realm cannot publish into reset',async()=>{
  let resolve!:(buffer:ArrayBuffer)=>void
  const source=new VideoSourceAdapter({...file,read:()=>new Promise<ArrayBuffer>(r=>resolve=r)})
  try{
    await source.open();await source.configure(options)
    instances[0]!.emit({type:'read',requestId:13,start:0,end:8})
    await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'))
    await source.reset();resolve(new ArrayBuffer(8));await Promise.resolve();await Promise.resolve()
    expect(instances[1]!.posts.some(p=>p.type==='read-result')).toBe(false)
  }finally{await source.close()}
  await expect(source.reset()).rejects.toThrow()
})
