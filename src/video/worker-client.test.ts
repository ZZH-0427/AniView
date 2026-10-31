import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoWorkerClient } from './worker-client'
import { VideoError, emptyVideoMetrics } from './model'
import type { VideoRequest, VideoResponse } from './protocol'
class WorkerDouble {
  static latest:WorkerDouble
  onmessage:((event:MessageEvent<VideoResponse>)=>void)|null=null
  onerror:((event:ErrorEvent)=>void)|null=null
  onmessageerror:(()=>void)|null=null
  terminate=vi.fn()
  requests:VideoRequest[]=[]
  constructor(){WorkerDouble.latest=this}
  postMessage(r:VideoRequest,t:Transferable[]=[]){this.requests.push(structuredClone(r,{transfer:t}))}
  reply(r:VideoResponse){this.onmessage?.(new MessageEvent('message',{data:r}))}
}
beforeEach(()=>vi.stubGlobal('Worker',WorkerDouble));afterEach(()=>vi.unstubAllGlobals())
const meta={width:2,height:2,frameCount:2,playCount:0}
describe('video Worker hard-stop and ownership',()=>{
  it('detaches RGBA and waits for acceptance rather than copying it',async()=>{
    const c=new VideoWorkerClient(),w=WorkerDouble.latest,frame={index:0,durationMs:27,rgba:new ArrayBuffer(16)}
    const task=c.addFrame(frame);expect(frame.rgba.byteLength).toBe(0)
    w.reply({id:1,type:'accepted',metrics:emptyVideoMetrics()});await task;c.dispose();expect(w.terminate).toHaveBeenCalledOnce()
  })
  it('preserves unsupported config taxonomy',async()=>{
    const c=new VideoWorkerClient(),p=c.open(meta);WorkerDouble.latest.reply({id:1,type:'error',code:'VIDEO_CONFIG_UNSUPPORTED'})
    await expect(p).rejects.toMatchObject({code:'VIDEO_CONFIG_UNSUPPORTED'});c.dispose()
  })
  it('ignores old request ids',async()=>{
    const c=new VideoWorkerClient(),p=c.open(meta),w=WorkerDouble.latest
    w.reply({id:0,type:'error',code:'VIDEO_API_UNAVAILABLE'});w.reply({id:1,type:'ready',probe:{apiPresent:true,candidates:[],selected:null}})
    await expect(p).resolves.toMatchObject({apiPresent:true});c.dispose()
  })
  it('hard-stops pending finalization, ignores its late result and permits a fresh Worker',async()=>{
    const c=new VideoWorkerClient(),w=WorkerDouble.latest,p=c.finish()
    c.dispose(new VideoError('CANCELLED'));c.dispose();expect(w.terminate).toHaveBeenCalledOnce()
    await expect(p).rejects.toMatchObject({code:'CANCELLED'})
    w.reply({id:1,type:'error',code:'VIDEO_MUX_FAILED'})
    const b=new VideoWorkerClient(),ready=b.open(meta);WorkerDouble.latest.reply({id:1,type:'ready',probe:{apiPresent:true,candidates:[],selected:null}});await ready;b.dispose()
  })
  it('cleans up a Worker message failure',async()=>{
    const c=new VideoWorkerClient(),p=c.open(meta);WorkerDouble.latest.onmessageerror?.()
    await expect(p).rejects.toMatchObject({code:'WORKER_FAILED'});expect(WorkerDouble.latest.terminate).toHaveBeenCalledOnce()
  })
})
