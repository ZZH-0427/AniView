import { describe, it, expect, vi } from 'vitest'
import { animationToMP4, AnimationVideoJob } from './convert'
import type { VideoTransport } from './convert'
import { emptyVideoMetrics } from './model'
import { ConversionError, type AnimationFrameSource } from '../conversion/model'
function fixture() {
  const log:string[]=[], meta={width:2,height:2,frameCount:2,playCount:0}; let index=0
  const source:AnimationFrameSource={metadata:meta,metrics:{decodeMs:1,decoderHeapBytes:0,decoderBackupBytes:0},next:async()=>{log.push('pull');return{index:index++,durationMs:27,rgba:new ArrayBuffer(16)}},acknowledgeFrame:()=>log.push('ack'),close:async()=>{log.push('source-close')},reset:async()=>{}}
  const transport:VideoTransport={open:async()=>{},addFrame:async f=>{structuredClone(f.rgba,{transfer:[f.rgba]});return emptyVideoMetrics()},finish:vi.fn(async()=>{throw Error('finish sentinel')}),dispose:()=>{log.push('terminate')}}
  return{source,transport,log}
}
describe('source independent video broker ownership',()=>{
  it('preserves the existing source workload guard',async()=>{
    await expect(animationToMP4(async()=>{throw new ConversionError('RESOURCE_LIMIT')},new AbortController().signal)).rejects.toMatchObject({code:'RESOURCE_LIMIT'})
  })
  it('fails cleanly when source cleanup rejects, without publishing a result',async()=>{
    const f=fixture();f.source.close=vi.fn(async()=>{throw Error('close failed')})
    await expect(animationToMP4(async()=>f.source,new AbortController().signal,undefined,()=>f.transport)).rejects.toMatchObject({code:'WORKER_FAILED'})
    expect(f.source.close).toHaveBeenCalledOnce();expect(f.transport.finish).not.toHaveBeenCalled();expect(f.log.at(-1)).toBe('terminate')
  })
  it('waits for transfer acceptance and closes decoder before finalizing',async()=>{
    const f=fixture();let accept!:()=>void, observed!:()=>void
    const seen=new Promise<void>(r=>{observed=r}),gate=new Promise<void>(r=>{accept=r})
    const add=f.transport.addFrame;f.transport.addFrame=async frame=>{const r=await add(frame);observed();await gate;return r}
    const pending=animationToMP4(async()=>f.source,new AbortController().signal,undefined,()=>f.transport).catch(e=>e)
    await seen;expect(f.log).toEqual(['pull']);accept();await pending
    expect(f.log).toEqual(['pull','ack','pull','ack','source-close','terminate'])
  })
  it('rejects a copying transport without pulling another frame',async()=>{
    const f=fixture();f.transport.addFrame=async()=>emptyVideoMetrics()
    await expect(animationToMP4(async()=>f.source,new AbortController().signal,undefined,()=>f.transport)).rejects.toMatchObject({code:'WORKER_FAILED'})
    expect(f.log.filter(x=>x==='pull')).toHaveLength(1)
  })
  it.each(['encoding','finalizing'])('cancels %s, hard-stops Worker and publishes no result',async phase=>{
    const f=fixture(),c=new AbortController()
    await expect(animationToMP4(async()=>f.source,c.signal,p=>{if(p.phase===phase)c.abort()},()=>f.transport)).rejects.toMatchObject({code:'CANCELLED'})
    expect(f.log).toContain('source-close');expect(f.log).toContain('terminate');expect(f.transport.finish).not.toHaveBeenCalled()
  })
  it('isolates a superseded source opening from a new run',async()=>{
    const a=fixture(),b=fixture(),job=new AnimationVideoJob();let resolve!:(s:AnimationFrameSource)=>void
    const first=job.run(()=>new Promise(r=>{resolve=r}),undefined,()=>a.transport).catch(e=>e)
    await job.run(async()=>b.source,undefined,()=>b.transport).catch(()=>{})
    resolve(a.source);expect(await first).toMatchObject({code:'CANCELLED'});expect(a.log).toEqual(['source-close'])
  })
})
