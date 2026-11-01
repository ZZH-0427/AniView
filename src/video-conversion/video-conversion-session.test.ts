import {describe,expect,it,vi} from 'vitest'
import {VideoConversionSession} from './video-conversion-session'
import type {VideoRuntime} from './video-conversion-session'
import {VideoInputError,emptySourceMetrics} from '../video-source/model'
import type {VideoInspection} from '../video-source/model'
import {createSamplingPlan,validateTargetTiming} from '../video-source/sampling-plan'
import type {ConversionFormat} from '../conversion/model'
const info:VideoInspection={container:'mp4',codec:'avc',codecString:'avc1.64000a',codedWidth:64,codedHeight:48,displayWidth:64,displayHeight:48,
 squarePixelWidth:64,squarePixelHeight:48,rotation:0,flip:false,timeResolution:90000,visibleStartTicks:0,visibleEndTicks:90000,durationUs:1000000,
 firstPacketTimestamp:0,secureContext:true,apiPresent:true,configSupported:true,decoderInitialized:true,firstDecoded:true,firstDraw:true,
 nativeMemoryBytes:null,colorPolicy:'SDR8-browser-to-sRGB',alpha:false,audio:'ignored',trackSelection:'primary'}
const gate=()=>{let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes});return{promise,resolve}}
function setup(){
 const options={hold:undefined as ReturnType<typeof gate>|undefined,prepareHold:undefined as ReturnType<typeof gate>|undefined,
  error:undefined as VideoInputError|undefined,deflate:true,outputFrames:undefined as number|undefined,badDuration:false,wrongSampled:false}
 const entered=gate(),revoked=vi.fn(),createUrl=vi.fn(()=> 'blob:owned-'+createUrl.mock.calls.length)
 let plan=createSamplingPlan(info,{startUs:0,endUs:1000000,fps:15,longSide:480}),target:ConversionFormat='webp'
 const runtime:VideoRuntime={prepare:vi.fn(async(_file,_signal,observe)=>{
  observe.worker('source',true);try{await options.prepareHold?.promise;if(options.error)throw options.error;return{info,deflate:options.deflate}}
  finally{observe.metrics(emptySourceMetrics());observe.worker('source',false)}
 }),convert:vi.fn(async(_file,format,settings,observe={})=>{
  target=format;plan=createSamplingPlan(info,settings);observe.onWorker?.('source',true);observe.onWorker?.('encoder',true);entered.resolve()
  try{
   await options.hold?.promise;if(options.error)throw options.error
   observe.onProgress?.({phase:'decoding',currentFrame:0,totalFrames:plan.frameCount})
   observe.onProgress?.({phase:'encoding',currentFrame:0,totalFrames:plan.frameCount})
   observe.onProgress?.({phase:'finalizing',currentFrame:plan.frameCount,totalFrames:plan.frameCount})
   return{data:new ArrayBuffer(16),byteLength:9,metrics:{encodeMs:1,outputBytes:9,outputCapacity:16},metadata:plan,plan,
    sourceMetrics:{decodeMs:1,decoderHeapBytes:0,decoderBackupBytes:0},totalMs:2,peakRgbaFrames:1,peakFrameBytes:64*48*4,
    transferredFrames:plan.frameCount+(options.wrongSampled?1:0),deflateSupported:true,inspection:info,videoSource:emptySourceMetrics(),cleanup:{softClosed:true,hardTerminated:false}}
  }finally{observe.onSourceClosed?.({softClosed:true,hardTerminated:false},emptySourceMetrics());observe.onWorker?.('encoder',false);observe.onWorker?.('source',false)}
 })}
 const inspect=vi.fn(async()=>({...plan,frameCount:options.outputFrames??plan.frameCount,durationMs:validateTargetTiming(plan,target)+(options.badDuration?100:0)}))
 const detector={detect:vi.fn(async()=>target==='gif'?{kind:'gif' as const,animated:true as const}:target==='webp'?{kind:'webp' as const,animated:true as const}:{kind:'apng' as const,animated:true as const})}
 const session=new VideoConversionSession({load:async()=>runtime,inspect,detector,createUrl,revokeUrl:revoked})
 const file=new File(['local encoded video'],'private-source.mp4',{type:'video/mp4'})
 return{session,file,options,runtime,inspect,entered,createUrl,revoked}
}
describe('video product session ownership and exact estimates',()=>{
 it('loads metadata and a separate native preview URL, with no output retained',async()=>{
  const f=setup();await f.session.select(f.file)
  expect(f.session.getSnapshot()).toMatchObject({status:'ready',metadata:info,settings:{target:'webp',fps:15,longSide:480},diagnostics:{activeObjectUrls:1,activeVideoSourceWorkers:0}})
  await f.session.dispose();expect(f.revoked).toHaveBeenCalledTimes(1)
 })
 it.each(['gif','webp','apng'] as const)('publishes actual%s metadata, exact sampled count and independently owned result URL',async target=>{
  const f=setup();await f.session.select(f.file);f.session.update({target});await f.session.start()
  const state=f.session.getSnapshot();expect(state.status).toBe('success');expect(state.result?.format).toBe(target)
  expect(state.result?.sampledFrames).toBe(state.preflight?.estimate?.frameCount);expect(state.result?.blob.size).toBe(9)
  expect(state.result?.metadata.playCount).toBe(0);expect(state.diagnostics).toMatchObject({activeObjectUrls:2,activeVideoSourceWorkers:0,activeEncoderWorkers:0,activeOutputDecoderWorkers:0})
  expect(state.result?.blob.type).toBe(target==='apng'?'image/png':'image/'+target)
  const names=[f.session.nextDownloadName(),f.session.nextDownloadName()];expect(new Set(names).size).toBe(2)
  expect(names.every(n=>n.endsWith(target==='apng'?'.png':'.'+target))).toBe(true)
  await f.session.dispose();expect(f.revoked).toHaveBeenCalledTimes(2)
 })
 it('keeps WebP merged output-frame count separate from sampled count',async()=>{
  const f=setup();f.options.outputFrames=1;await f.session.select(f.file);await f.session.start()
  expect(f.session.getSnapshot().result).toMatchObject({sampledFrames:15,metadata:{frameCount:1}});await f.session.dispose()
 })
 it('changes APNG30FPS to supported GIF defaults and revokes the previous result',async()=>{
  const f=setup();await f.session.select(f.file);await f.session.start();f.session.update({target:'apng',fps:30});f.session.update({target:'gif'})
  expect(f.session.getSnapshot()).toMatchObject({settings:{target:'gif',fps:10},result:undefined,diagnostics:{activeObjectUrls:1}})
  expect(f.revoked).toHaveBeenCalledTimes(1);await f.session.dispose()
 })
 it('does not start a Worker job for invalid trim or a preflight resource rejection',async()=>{
  const f=setup();await f.session.select(f.file);f.session.update({endUs:0});await f.session.start()
  expect(f.runtime.convert).not.toHaveBeenCalled();expect(f.session.getSnapshot().preflight).toMatchObject({ok:false,issue:'trim'});await f.session.dispose()
 })
 it('disables unsupported APNG but leaves other formats usable',async()=>{
  const f=setup();f.options.deflate=false;await f.session.select(f.file);f.session.update({target:'apng'});await f.session.start()
  expect(f.session.getSnapshot().preflight).toMatchObject({ok:false,issue:'apng'});expect(f.runtime.convert).not.toHaveBeenCalled()
  f.session.update({target:'gif'});await f.session.start();expect(f.session.getSnapshot().status).toBe('success');await f.session.dispose()
 })
 it('cancels A, ignores its late success, preserves settings and successfully runs B',async()=>{
  const f=setup();await f.session.select(f.file);f.options.hold=gate();const a=f.session.start();await f.entered.promise
  const selected=f.session.getSnapshot().settings,cancelling=f.session.cancel();f.options.hold.resolve();await a;await cancelling
  expect(f.session.getSnapshot()).toMatchObject({status:'cancelled',settings:selected,result:undefined,diagnostics:{activeVideoSourceWorkers:0,activeEncoderWorkers:0}})
  f.options.hold=undefined;await f.session.start();expect(f.session.getSnapshot().status).toBe('success');await f.session.dispose()
 })
 it('replaces the source after cleanup and deterministically resets its trim/FPS/size',async()=>{
  const f=setup();await f.session.select(f.file);f.session.update({target:'gif',fps:20,longSide:360,startUs:100000});await f.session.start()
  await f.session.select(new File(['next'],'next.webm'))
  expect(f.session.getSnapshot()).toMatchObject({status:'ready',settings:{target:'gif',fps:10,longSide:480,startUs:0,endUs:1000000},result:undefined})
  expect(f.revoked).toHaveBeenCalledTimes(2);await f.session.dispose()
 })
 it('keeps typed codec failure recoverable with a new source',async()=>{
  const f=setup();f.options.error=new VideoInputError('VIDEO_CODEC_UNSUPPORTED');await f.session.select(f.file)
  expect(f.session.getSnapshot()).toMatchObject({status:'error',error:'VIDEO_CODEC_UNSUPPORTED',previewUrl:undefined})
  f.options.error=undefined;await f.session.select(f.file);expect(f.session.getSnapshot().status).toBe('ready');await f.session.dispose()
 })
 it('rejects wrong output duration rather than presenting encoder estimates as actual metadata',async()=>{
  const f=setup();f.options.badDuration=true;await f.session.select(f.file);await f.session.start()
  expect(f.session.getSnapshot()).toMatchObject({status:'error',error:'TARGET_ENCODE_FAILED',result:undefined});await f.session.dispose()
 })
 it('disposes active work, suppresses late output and releases preview URLs',async()=>{
  const f=setup();await f.session.select(f.file);f.options.hold=gate();const run=f.session.start();await f.entered.promise
  const disposal=f.session.dispose();f.options.hold.resolve();await run;await disposal
  expect(f.session.getSnapshot().result).toBeUndefined();expect(f.createUrl).toHaveBeenCalledTimes(1)
  expect(f.session.getSnapshot().diagnostics).toMatchObject({activeVideoSourceWorkers:0,activeEncoderWorkers:0,activeObjectUrls:0})
 })
 it('does not leak source names or bytes into diagnostics',async()=>{
  const f=setup();await f.session.select(f.file);await f.session.start()
  expect(JSON.stringify(f.session.getSnapshot().diagnostics)).not.toContain('private-source');expect(JSON.stringify(f.session.getSnapshot().diagnostics)).not.toContain('local encoded video');await f.session.dispose()
 })
 it('rejects actual sampled count different from its preflight plan',async()=>{
  const f=setup();f.options.wrongSampled=true;await f.session.select(f.file);await f.session.start()
  expect(f.session.getSnapshot()).toMatchObject({status:'error',error:'TARGET_ENCODE_FAILED',result:undefined});expect(f.inspect).not.toHaveBeenCalled();await f.session.dispose()
 })
 it('never replaces a new source with a late preparation result',async()=>{
  const f=setup();f.options.prepareHold=gate();const a=f.session.select(f.file);await vi.waitFor(()=>expect(f.runtime.prepare).toHaveBeenCalledTimes(1))
  const b=f.session.select(new File(['new'],'new.mp4'));f.options.prepareHold.resolve();await a;await b
  expect(f.session.getSnapshot()).toMatchObject({status:'ready',sourceName:'new.mp4',diagnostics:{activeVideoSourceWorkers:0,activeObjectUrls:1}})
  expect(f.createUrl).toHaveBeenCalledTimes(1);await f.session.dispose()
 })
 it('allows retrying an interrupted initial preparation',async()=>{
  const f=setup();f.options.prepareHold=gate();const prepared=f.session.select(f.file);await vi.waitFor(()=>expect(f.runtime.prepare).toHaveBeenCalledTimes(1))
  const cancel=f.session.cancel();f.options.prepareHold.resolve();await prepared;await cancel
  expect(f.session.getSnapshot()).toMatchObject({status:'cancelled',metadata:undefined,sourceName:f.file.name})
  f.options.prepareHold=undefined;await f.session.retryPrepare();expect(f.session.getSnapshot().status).toBe('ready');await f.session.dispose()
 })
 it('does not wait for an unabortable module import or start work after disposal',async()=>{
  const f=setup();let resolve!:(value:VideoRuntime)=>void
  const load=vi.fn(()=>new Promise<VideoRuntime>(yes=>{resolve=yes})),session=new VideoConversionSession({load})
  const selected=session.select(f.file);await vi.waitFor(()=>expect(load).toHaveBeenCalled())
  await session.dispose();await selected;resolve(f.runtime);await Promise.resolve()
  expect(f.runtime.prepare).not.toHaveBeenCalled();expect(session.getSnapshot().diagnostics.activeObjectUrls).toBe(0)
 })
 it('replaces an active source only after A has closed and never publishes its result over B',async()=>{
  const f=setup();await f.session.select(f.file);f.options.hold=gate();const run=f.session.start();await f.entered.promise
  const replacement=f.session.select(new File(['replacement'],'replacement.mp4'));f.options.hold.resolve();await run;await replacement
  expect(f.session.getSnapshot()).toMatchObject({status:'ready',sourceName:'replacement.mp4',result:undefined,diagnostics:{activeVideoSourceWorkers:0,activeEncoderWorkers:0,activeObjectUrls:1}})
  f.options.hold=undefined;await f.session.start();expect(f.session.getSnapshot().result?.filename).toContain('replacement-aniview');await f.session.dispose()
 })
})
