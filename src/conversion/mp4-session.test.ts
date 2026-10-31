import {describe,it,expect,vi} from 'vitest'
import {ConversionSession,conversionErrorMessage} from './conversion-session'
import {VideoError,emptyVideoMetrics,type VideoResult,type VideoErrorCode} from '../video/model'
import type {VideoConversionRuntime} from './video-runtime-contract'
import type {ConversionDependencies} from './convert'
import type {VirtualFile} from '../input/virtual-file'
const gate=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return{promise,resolve}}
function fixture(width=319,height=241){
  const meta={width,height,frameCount:2,playCount:0},release=vi.fn(),revokeUrl=vi.fn(),createUrl=vi.fn(()=> 'blob:mp4-result')
  const file:VirtualFile={name:'private-source.gif',size:1,source:'archive',read:async()=>new ArrayBuffer(1),release}
  const close=vi.fn(async()=>{}),pipeline:ConversionDependencies={source:async()=>({metadata:meta,metrics:{decodeMs:0,decoderHeapBytes:0,decoderBackupBytes:0},
    next:async()=>null,acknowledgeFrame(){},reset:async()=>{},close}),encoder:()=>({capabilities:{deflate:true},open:async()=>{},addFrame:async()=>{},finish:async()=>{throw Error('not image encoding')},dispose(){}})}
  const output:VideoResult&{peakCanonicalRgbaFrames:number}={data:new ArrayBuffer(12),metrics:{...emptyVideoMetrics(),framesCreated:4,framesClosed:4,peakVideoFrames:1,maxEncodeQueue:2},
    config:{codec:'avc1.42e01f',width:width+width%2,height:height+height%2},probe:{apiPresent:true,candidates:[],selected:null},peakCanonicalRgbaFrames:1,
    timing:[{timestampUs:0,durationUs:27000},{timestampUs:27000,durationUs:27000}],
    validation:{durationUs:54007,codec:'avc1.64000d',width:width+width%2,height:height+height%2,frameCount:2,audioTracks:0,maxTimestampErrorUs:7,maxDurationErrorUs:7,totalDurationErrorUs:7,
      meanRgbError:1,p95RgbError:2,maxRgbError:3,perFrame:[]}}
  let hold:ReturnType<typeof gate>|undefined,phase:'encoding'|'finalizing'|'checking'='encoding'
  const reached=gate(),run=vi.fn<VideoConversionRuntime['run']>(async(source,signal,hooks)=>{
    const s=await source(signal);hooks.worker(true)
    try{
      hooks.progress({phase:'encoding',currentFrame:1,totalFrames:2});hooks.metrics(output.metrics)
      if(phase!=='encoding')hooks.progress({phase:'finalizing',currentFrame:2,totalFrames:2})
      if(phase==='checking')hooks.phase('inspecting')
      reached.resolve()
      if(hold)await new Promise<void>((resolve,reject)=>{const stop=()=>reject(new VideoError('CANCELLED'));signal.addEventListener('abort',stop,{once:true});hold!.promise.then(resolve).finally(()=>signal.removeEventListener('abort',stop));if(signal.aborted)stop()})
      return output
    }finally{await s.close();hooks.worker(false)}
  })
  const loadVideo=vi.fn<()=>Promise<VideoConversionRuntime>>(async()=>({run})),session=new ConversionSession(file,{pipeline,detector:{detect:async()=>({kind:'gif',animated:true})},loadVideo,createUrl,revokeUrl})
  return{session,loadVideo,run,output,file,release,revokeUrl,createUrl,reached,setHold:(p:typeof phase)=>{hold=gate();phase=p},clearHold:()=>{hold?.resolve();hold=undefined}}
}
describe('MP4 product session',()=>{
  it('loads no video runtime in prepare or on target selection',async()=>{const f=fixture();await f.session.prepare();f.session.selectTarget('mp4');expect(f.loadVideo).not.toHaveBeenCalled();await f.session.dispose()})
  it('uses actual MP4 readback facts, MIME, one-cycle metadata and safe unique download names',async()=>{
    const f=fixture();await f.session.prepare();f.session.selectTarget('mp4');await f.session.start();const s=f.session.getSnapshot()
    expect(s).toMatchObject({status:'success',target:'mp4',source:{width:319,height:241,durationMs:54},result:{format:'mp4',metadata:{width:320,height:242,durationMs:54.007,codec:'avc1.64000d',playCount:1}},
      diagnostics:{videoConversionsStarted:1,videoConversionsCompleted:1,activeDecoderWorkers:0,activeVideoWorkers:0,peakCanonicalRgbaFrames:1,peakVideoFrames:1,maxEncodeQueue:2,ownedVideoFrames:0,videoFramesBalanced:true,lastMp4Bytes:12,lastCodec:'avc1.64000d'}})
    expect(s.result!.blob.type).toBe('video/mp4');const names=[f.session.nextDownloadName(),f.session.nextDownloadName()];expect(new Set(names).size).toBe(2);expect(names.every(n=>n.endsWith('.mp4'))).toBe(true)
    await f.session.dispose();expect(f.revokeUrl).toHaveBeenCalledOnce();expect(f.release).not.toHaveBeenCalled();expect(f.session.getSnapshot().diagnostics.activeObjectUrls).toBe(0)
  })
  it.each(['encoding','finalizing','checking'] as const)('keeps cancellation live during %s and reruns the retained MP4/source',async phase=>{
    const f=fixture();await f.session.prepare();f.session.selectTarget('mp4');f.setHold(phase);const task=f.session.start();await f.reached.promise
    if(phase==='checking')expect(f.session.getSnapshot().status).toBe('verifying')
    await f.session.cancel();await task;expect(f.session.getSnapshot()).toMatchObject({status:'cancelled',target:'mp4',diagnostics:{videoCancellations:1,activeVideoWorkers:0,activeDecoderWorkers:0}})
    expect(f.createUrl).not.toHaveBeenCalled();f.clearHold();await f.session.start();expect(f.session.getSnapshot().status).toBe('success');await f.session.dispose()
  })
  it('Back/disposal hard-stops the active MP4 and never releases the borrowed source',async()=>{
    const f=fixture();await f.session.prepare();f.session.selectTarget('mp4');f.setHold('finalizing');const task=f.session.start();await f.reached.promise;await f.session.dispose();await task
    expect(f.createUrl).not.toHaveBeenCalled();expect(f.release).not.toHaveBeenCalled();expect(f.session.getSnapshot().diagnostics).toMatchObject({activeVideoWorkers:0,videoCancellations:1,cancellations:1})
  })
  it('cancels a pending lazy import without starting a stale job after a successful rerun',async()=>{
    const f=fixture();let resolve!:(r:VideoConversionRuntime)=>void;f.loadVideo.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
    await f.session.prepare();f.session.selectTarget('mp4');const first=f.session.start();await f.session.cancel();await first
    await f.session.start();resolve({run:f.run});await Promise.resolve();expect(f.run).toHaveBeenCalledOnce();expect(f.session.getSnapshot().status).toBe('success');await f.session.dispose()
  })
  it.each<VideoErrorCode>(['VIDEO_API_UNAVAILABLE','VIDEO_CONFIG_UNSUPPORTED','VIDEO_ENCODER_INIT_FAILED','VIDEO_ENCODE_FAILED','VIDEO_MUX_FAILED','VIDEO_OUTPUT_TOO_LARGE','RESOURCE_LIMIT','WORKER_FAILED'])(
    'retains typed %s errors without a fallback or publishing a result',async code=>{
      const f=fixture();f.run.mockRejectedValue(new VideoError(code));await f.session.prepare();f.session.selectTarget('mp4');await f.session.start()
      expect(f.session.getSnapshot()).toMatchObject({status:'error',error:code,target:'mp4'});expect(conversionErrorMessage(code,'mp4').length).toBeGreaterThan(10);expect(f.createUrl).not.toHaveBeenCalled();await f.session.dispose()
    })
  it('rejects incorrect inspected dimensions before publishing a URL',async()=>{
    const f=fixture();f.run.mockResolvedValue({...f.output,validation:{...f.output.validation,width:319}});await f.session.prepare();f.session.selectTarget('mp4');await f.session.start()
    expect(f.session.getSnapshot().error).toBe('VIDEO_VALIDATION_FAILED');expect(f.createUrl).not.toHaveBeenCalled();await f.session.dispose()
  })
  it('releases MP4 output when switching back to an existing image target',async()=>{
    const f=fixture();await f.session.prepare();f.session.selectTarget('mp4');await f.session.start();f.session.selectTarget('webp')
    expect(f.revokeUrl).toHaveBeenCalledOnce();expect(f.session.getSnapshot()).toMatchObject({status:'ready',target:'webp',result:undefined});await f.session.dispose()
  })
})
