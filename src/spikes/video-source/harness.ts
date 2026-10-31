/** Engineering-only entry; never imported from ordinary AniView navigation. */
import { inspectVideo,convertVideoToAnimation } from '../../video-source/convert'
import { createSamplingPlan,validateTargetTiming } from '../../video-source/sampling-plan'
import { VideoInputError,VIDEO_INPUT_LIMITS } from '../../video-source/model'
import type { VideoSourceMetrics,VideoSourceOptions,VideoInspection } from '../../video-source/model'
import type { ConversionFormat } from '../../conversion/model'
import type { VirtualFile } from '../../input/virtual-file'
import { browserFile } from '../../input/browser-file'
import { runtimeDiagnostics } from '../../media/runtime-diagnostics'
import { inspectAnimation,verifyOutput } from './verification'
import type { FixtureRecord } from './verification'
declare const __VIDEO_SOURCE_BUILD__:string
const buildIdentity=__VIDEO_SOURCE_BUILD__

const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T
const progress=element('progress'),summary=element('summary'),raw=element('result'),preflight=element('preflight')
const formats:ConversionFormat[]=['gif','webp','apng']
const rows:Record<string,unknown>[]=[]
let controller:AbortController|undefined,generation=0,group=0
let selected:VirtualFile|undefined,inspection:VideoInspection|undefined,lastOutput:{data:ArrayBuffer;byteLength:number}|undefined,resultUrl:string|undefined
let activeUrls=0,manifestPromise:Promise<{fixtures:FixtureRecord[]}>|undefined
let activeRun:Promise<Record<string,unknown>>|undefined,groupBusy=false
function controls(){for(const id of['input','target','start','end','fps','size','convert','run-h264','run-vp9','run-correctness','run-resize','run-150','run-cancel']){
  const control=element<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>(id);control.disabled=!!controller||groupBusy
}}
const virtual=(data:ArrayBuffer,byteLength=data.byteLength):VirtualFile=>({name:'local-video-test',size:byteLength,source:'file',read:async(start=0,end=byteLength)=>data.slice(start,end)})
function clearOutput(){if(resultUrl){URL.revokeObjectURL(resultUrl);resultUrl=undefined;activeUrls--}lastOutput=undefined}
function assert(condition:unknown,label:string):asserts condition{if(!condition)throw new Error(label)}
async function manifest(){
  manifestPromise??=(async()=>{
    const value:unknown=await(await fetch(new URL('fixtures/manifest.json',location.href))).json()
    assert(typeof value==='object'&&value!==null&&'fixtures'in value&&Array.isArray(value.fixtures),'FIXTURE_MANIFEST')
    const fixtures:FixtureRecord[]=[]
    for(const v of value.fixtures){
      assert(typeof v==='object'&&v!==null&&typeof v.name==='string'&&/^[a-z0-9-]+\.(mp4|webm)$/.test(v.name)
        &&typeof v.width==='number'&&typeof v.height==='number'&&typeof v.codec==='string'
        &&typeof v.displayWidth==='number'&&typeof v.displayHeight==='number'&&typeof v.rotation==='number'&&typeof v.flip==='boolean'
        &&Array.isArray(v.pts)&&v.pts.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x))
        &&Array.isArray(v.ids)&&v.ids.every((x:unknown)=>Number.isSafeInteger(x))
        &&typeof v.duration==='number','FIXTURE_SCHEMA')
      fixtures.push(v)
    }
    return{fixtures}
  })()
  return manifestPromise
}
async function fixtureFile(name:string){
  const fixture=(await manifest()).fixtures.find(f=>f.name===name)
  assert(fixture,'FIXTURE_NOT_FOUND')
  const response=await fetch(new URL('fixtures/'+fixture.name,location.href));assert(response.ok,'FIXTURE_HTTP')
  return{fixture,file:virtual(await response.arrayBuffer())}
}
function summaryValue(){
  const successful=rows.filter(r=>r.status==='PASS'),failed=rows.filter(r=>r.status==='FAIL')
  const metrics=rows.map(r=>r.videoSource).filter((m):m is VideoSourceMetrics=>typeof m==='object'&&m!==null&&'observedSourceSamples'in m)
  return{build:buildIdentity,secureContext:isSecureContext,hmr:!!import.meta.hot,browser:navigator.userAgent,
    pass:successful.length,cancelled:rows.filter(r=>r.status==='CANCELLED').length,
    failures:failed.map(r=>({case:r.name,target:r.target,error:r.error,stage:r.stage})),
    coverage:successful.map(r=>({case:r.name,target:r.target})),
    peakAppSamples:Math.max(0,...metrics.map(m=>m.peakSamples)),peakAppExplicitVideoFrames:0,
    peakCanonicalRgba:Math.max(0,...successful.map(r=>Number(r.peakRgbaFrames))),
    maxObservedSourceSamples:Math.max(0,...metrics.map(m=>m.observedSourceSamples)),
    maxObservedSourcePixels:Math.max(0,...metrics.map(m=>m.observedSourcePixels)),
    heartbeatMaxGapMs:Math.max(0,...rows.map(r=>Number(r.heartbeatMaxGapMs??0))),
    lastSourceCleanup:metrics.at(-1)?{activeSamples:metrics.at(-1)!.activeSamples,activeCanvases:metrics.at(-1)!.activeCanvases,
      activeImageData:metrics.at(-1)!.activeImageData,ownedRgba:metrics.at(-1)!.ownedRgba,awaitingAck:metrics.at(-1)!.awaitingAck,
      cleanupErrors:metrics.at(-1)!.cleanupErrors}:null,
    lastSourceDisposition:rows.at(-1)?.cleanup??null,nativeGpuMemoryBytes:null,activeObjectUrls:activeUrls,resources:runtimeDiagnostics.getSnapshot()}
}
function render(){summary.textContent=JSON.stringify(summaryValue());raw.textContent=JSON.stringify(rows,null,2)}
export interface RunOptions extends Partial<VideoSourceOptions> {cancelAt?:VideoSourceMetrics['phase']|'encoding'|'finalizing'|'encoder-ack'}
async function execute(file:VirtualFile,name:string,target:ConversionFormat,options:RunOptions={},fixture?:FixtureRecord){
  controller?.abort();const id=++generation,own=new AbortController();controller=own
  controls()
  clearOutput()
  let lastMetrics:VideoSourceMetrics|undefined,gap=0,last=performance.now(),beats=0
  let stage='opening'
  let closeEvidence:{softClosed:boolean;hardTerminated:boolean}|undefined
  const heartbeat=setInterval(()=>{const now=performance.now();gap=Math.max(gap,now-last);last=now;beats++},16)
  const deadline=setTimeout(()=>own.abort(),VIDEO_INPUT_LIMITS.deadlineMs)
  const started=performance.now()
  let row:Record<string,unknown>
  try{
    const result=await convertVideoToAnimation(file,target,{startUs:options.startUs??0,endUs:options.endUs??1_000_000,
      fps:options.fps??(target==='gif'?10:15),longSide:options.longSide??480,evidence:true},{
      signal:own.signal,
      onPreflight:(info,plan,predictedMs)=>{if(id===generation)preflight.textContent=JSON.stringify({inspection:info,plan,
        expectedEncodedDurationMs:predictedMs,sourceCodedArea:info.codedWidth*info.codedHeight,
        observedSourcePixels:lastMetrics?.observedSourcePixels,estimatedDecodePixels:null,withinLimits:true,limits:VIDEO_INPUT_LIMITS},null,2)},
      onSourceMetrics:metrics=>{
        lastMetrics=metrics;stage=metrics.phase
        if(id===generation)progress.textContent=metrics.phase+' · source samples '+metrics.observedSourceSamples
        if(options.cancelAt===metrics.phase&&(metrics.phase!=='preroll'||metrics.observablePrerollSamples>0))own.abort()
      },
      onProgress:p=>{if(p.phase==='encoding'||p.phase==='finalizing'){stage=p.phase;if(options.cancelAt===p.phase)own.abort()}},
      onEncoderFrameSent:()=>{if(options.cancelAt==='encoder-ack')own.abort()},
      onSourceClosed:(cleanup,metrics)=>{closeEvidence=cleanup;lastMetrics=metrics},
    })
    assert(!own.signal.aborted,'CANCELLED')
    stage='verification'
    const decoded=await inspectAnimation(virtual(result.data,result.byteLength),target,fixture??{rotation:0,flip:false},own.signal)
    const validation=verifyOutput(result.plan,target,fixture,result.videoSource.evidence,decoded)
    assert(result.peakRgbaFrames===1&&result.videoSource.peakSamples<=2,'OWNERSHIP_PEAK')
    assert(result.videoSource.activeSamples===0&&result.videoSource.activeCanvases===0&&result.videoSource.cleanupErrors===0,'SOURCE_CLEANUP')
    assert(!result.cleanup.hardTerminated,'UNCONFIRMED_SOFT_CLEANUP')
    row={name,target,status:'PASS',inspection:result.inspection,plan:result.plan,validation,
      totalMs:result.totalMs,encodeMs:result.metrics.encodeMs,byteLength:result.byteLength,
      peakRgbaFrames:result.peakRgbaFrames,videoSource:result.videoSource,cleanup:result.cleanup,encoder:result.metrics}
    if(id===generation)lastOutput={data:result.data,byteLength:result.byteLength}
  }catch(error){
    const code=error instanceof VideoInputError?error.videoCode:own.signal.aborted?'CANCELLED':error instanceof Error?error.message:'UNKNOWN_FAILURE'
    row={name,target,status:code==='CANCELLED'?'CANCELLED':'FAIL',error:code,stage:lastMetrics?.stoppedAt??stage,videoSource:lastMetrics,cleanup:closeEvidence}
  }finally{
    clearInterval(heartbeat);clearTimeout(deadline)
    if(id===generation){controller=undefined;controls()}
  }
  row={...row,wallMs:performance.now()-started,heartbeatCount:beats,heartbeatMaxGapMs:gap,resources:runtimeDiagnostics.getSnapshot()}
  rows.push(row);if(id===generation){progress.textContent=String(row.status)+' · '+name+' → '+target;render()}
  return row
}
async function run(file:VirtualFile,name:string,target:ConversionFormat,options:RunOptions={},fixture?:FixtureRecord){
  while(activeRun){const previous=activeRun;controller?.abort();await previous.catch(()=>{});if(activeRun===previous)activeRun=undefined}
  const operation=execute(file,name,target,options,fixture);activeRun=operation
  try{return await operation}finally{if(activeRun===operation)activeRun=undefined}
}
async function runCase(name:string,target:ConversionFormat,options:RunOptions={}){
  const token=group
  const {fixture,file}=await fixtureFile(name)
  if(token!==group)return{name,target,status:'CANCELLED',error:'CANCELLED',stage:'fixture-download'}
  return run(file,name,target,options,fixture)
}
async function runGroup(kind:string){
  const token=++group
  groupBusy=true;controls()
  const cases:{name:string;target:ConversionFormat;options?:RunOptions}[]=[]
  if(kind==='h264'||kind==='vp9')for(const target of formats)cases.push({name:kind==='h264'?'cfr.mp4':'vp9.webm',target})
  else if(kind==='correctness'){
    cases.push({name:'vfr.mp4',target:'apng',options:{fps:20,endUs:1_030_000}},
      {name:'bframes.mp4',target:'webp',options:{fps:10,endUs:2_000_000}},
      {name:'rotation.mp4',target:'apng'},{name:'portrait.mp4',target:'webp'},
      {name:'par.mp4',target:'apng'},{name:'nonzero.webm',target:'apng'},
      {name:'negative.mp4',target:'apng'},
      {name:'long.mp4',target:'webp',options:{startUs:20_300_000,endUs:21_330_000,fps:10}},
      {name:'vfr.mp4',target:'gif',options:{endUs:1_030_000,fps:10}})
  }else if(kind==='resize')cases.push({name:'1080.mp4',target:'webp',options:{longSide:480,fps:10}},{name:'1080.mp4',target:'apng',options:{longSide:720,fps:10}},
    {name:'photo.mp4',target:'apng',options:{longSide:480,fps:10}})
  else if(kind==='150')cases.push({name:'benchmark.mp4',target:'webp',options:{endUs:10_000_000,fps:15,longSide:480}})
  else if(kind==='cancel')cases.push({name:'benchmark.mp4',target:'apng',options:{endUs:10_000_000,fps:15,cancelAt:'sampling'}},{name:'cfr.mp4',target:'apng'})
  try{for(const c of cases){if(token!==group)break;const row=await runCase(c.name,c.target,c.options);if(row.status==='FAIL')break}}
  finally{groupBusy=false;controls()}
  render();return summaryValue()
}
function cancel(){group++;controller?.abort()}
async function inspectSelected(){
  assert(selected,'SELECT_VIDEO')
  controller?.abort();await activeRun?.catch(()=>{})
  const own=new AbortController();controller=own;controls()
  try{inspection=await inspectVideo(selected,own.signal)}finally{if(controller===own)controller=undefined;controls()}
  const fps=Number(element<HTMLSelectElement>('fps').value),longSide=element<HTMLSelectElement>('size').value
  let end=Math.min(5_000_000,inspection.durationUs)
  while(end>1_000){
    try{createSamplingPlan(inspection,{startUs:0,endUs:end,fps,longSide:longSide==='original'?'original':Number(longSide) as 360|480|720});break}
    catch{end-=1000}
  }
  element<HTMLInputElement>('start').value='0';element<HTMLInputElement>('end').value=String(end/1e6)
  preflight.textContent=JSON.stringify(inspection,null,2);updatePlan()
}
function selection():VideoSourceOptions{
  const long=element<HTMLSelectElement>('size').value
  return{startUs:Math.ceil(Number(element<HTMLInputElement>('start').value)*1e6),
    endUs:Math.floor(Number(element<HTMLInputElement>('end').value)*1e6),fps:Number(element<HTMLSelectElement>('fps').value),
    longSide:long==='original'?'original':Number(long) as 360|480|720}
}
function updatePlan(){
  if(!inspection)return
  try{const plan=createSamplingPlan(inspection,selection()),target=element<HTMLSelectElement>('target').value as ConversionFormat
    const predictedMs=validateTargetTiming(plan,target)
    preflight.textContent=JSON.stringify({inspection,plan,expectedEncodedDurationMs:predictedMs,withinLimits:true,limits:VIDEO_INPUT_LIMITS},null,2)
  }catch(error){preflight.textContent=JSON.stringify({withinLimits:false,reason:error instanceof VideoInputError?error.videoCode:'INVALID_SETTINGS'})}
}
function bind(id:string,operation:()=>unknown){element<HTMLButtonElement>(id).onclick=()=>{void Promise.resolve().then(operation).catch(error=>{progress.textContent=error instanceof Error?error.message:'ERROR'})}}
element<HTMLInputElement>('input').onchange=()=>{const f=element<HTMLInputElement>('input').files?.[0];if(f){selected=browserFile(f);void inspectSelected().catch(e=>progress.textContent=e instanceof VideoInputError?e.videoCode:'INSPECTION_FAILED')}}
for(const id of['start','end','fps','size'])element(id).onchange=updatePlan
element('target').onchange=()=>{
  const target=element<HTMLSelectElement>('target').value,select=element<HTMLSelectElement>('fps'),old=Number(select.value)
  const values=target==='gif'?[5,10,20]:[5,10,15,20,24,30]
  select.replaceChildren(...values.map(value=>new Option(String(value),String(value))))
  select.value=String(values.includes(old)?old:target==='gif'?10:15);updatePlan()
}
for(const kind of['h264','vp9','correctness','resize','150','cancel'])bind('run-'+kind,()=>runGroup(kind))
bind('convert',()=>{assert(selected,'SELECT_VIDEO');return run(selected,'local-input',element<HTMLSelectElement>('target').value as ConversionFormat,selection())})
bind('cancel',cancel)
bind('close',()=>{cancel();clearOutput();render()})
bind('copy',()=>navigator.clipboard.writeText(JSON.stringify(summaryValue())))
bind('export',()=>{
  const blob=new Blob([JSON.stringify({summary:summaryValue(),rows},null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download='aniview-8d1-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
})
bind('download',()=>{
  assert(lastOutput,'NO_RESULT')
  if(resultUrl){URL.revokeObjectURL(resultUrl);activeUrls--}
  const target=String(rows.at(-1)?.target)
  resultUrl=URL.createObjectURL(new Blob([new Uint8Array(lastOutput.data,0,lastOutput.byteLength)],{type:target==='apng'?'image/png':'image/'+target}));activeUrls++
  const a=document.createElement('a');a.href=resultUrl;a.download='aniview-8d1-'+Date.now()+(target==='apng'?'.png':'.'+target);a.click();render()
})
globalThis.addEventListener('pagehide',()=>{cancel();clearOutput()})
element('environment').textContent='Secure context: '+isSecureContext+' · HMR: '+!!import.meta.hot+' · build: '+buildIdentity
declare global{interface Window{__videoSourceHarness:{
  runCase:typeof runCase;runGroup:typeof runGroup;cancel:typeof cancel;summary:typeof summaryValue;rows:typeof rows
  outputBase64():string;clear():void
}}}
window.__videoSourceHarness={runCase,runGroup,cancel,summary:summaryValue,rows,
  outputBase64(){assert(lastOutput,'NO_RESULT');let s='';for(const n of new Uint8Array(lastOutput.data,0,lastOutput.byteLength))s+=String.fromCharCode(n);return btoa(s)},
  clear(){clearOutput();render()}}
render()
