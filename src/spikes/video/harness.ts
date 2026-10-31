import { AnimationVideoJob } from '../../video/convert'
import { VideoWorkerClient, type VideoWorkerFailureEvidence } from '../../video/worker-client'
import { VideoError } from '../../video/model'
import type { VideoMetrics, ProbeResult, VideoFinalizePhase } from '../../video/model'
import { openAnimationFrameSource } from '../../conversion/frame-source'
import type { ConversionFormat } from '../../conversion/model'
import type { FixtureScene } from '../conversion/fixtures'
import { runtimeDiagnostics, trackRuntimeResource } from '../../media/runtime-diagnostics'
import type { VirtualFile } from '../../input/virtual-file'
import heldWorkerUrl from './held-encoder.worker.ts?worker&url'
import encoderWorkerUrl from '../../video/encoder.worker.ts?worker&url'

interface CaseOptions { source: ConversionFormat; width: number; height: number; count: number; scene?: FixtureScene; photo?: boolean; softEdges?: boolean;
  durations?: number[]; playCount?: number; cancelAt?: 'encode' | 'finalize-held' }
type CaseReport = Record<string, unknown>
type CasePhase='fixture'|'source-open'|'source-next'|'encoder-open'|'encoding'|'finalizing'|'held-finalizing'|'complete'
interface WorkerObservation {role:'fixture'|'encoder'|'held-encoder';trigger:string;operation:string|null;moduleBooted:boolean;requestId:number|null;elapsedMs:number}
interface Investigation {jobId:number;phase:CasePhase;finalizePhase:VideoFinalizePhase|null;acceptedFrames:number;finalizeHeld:boolean;worker:WorkerObservation|null}
const diagnosticVersion='finalize-trace-1',debug=new URLSearchParams(location.search).get('debug')==='1'
const results: CaseReport[] = [], job = new AnimationVideoJob(), urls: string[] = []
const counters = { jobsStarted: 0, jobsCompleted: 0, cancellations: 0, activeDecoderWorkers: 0, activeEncoderWorkers: 0, cleanupErrors: 0 }
let active: AbortController | undefined, suite = 0
let lastProbe:ProbeResult|undefined
const status = document.querySelector<HTMLOutputElement>('#progress')!, resultElement = document.querySelector<HTMLElement>('#result')!, videos = document.querySelector<HTMLElement>('#videos')!
function summary(){
  // The full rows are already local numeric reports; this aggregation keeps phone copy short.
  const rows=results as {status?:string;options?:CaseOptions;error?:string;finalizeHeld?:boolean;investigation?:Investigation;probe?:{apiPresent:boolean;selected:unknown};
    metrics?:VideoMetrics;validation?:{codec:string|null;meanRgbError:number;p95RgbError:number;maxTimestampErrorUs:number;maxDurationErrorUs:number;totalDurationErrorUs:number};heartbeat?:{maxGapMs:number}}[]
  const passed=rows.filter(r=>r.status==='PASS'),max=(select:(r:typeof passed[number])=>number)=>Math.max(0,...passed.map(select))
  return{diagnosticVersion,secureContext:isSecureContext,hmr:import.meta.env.DEV,apiPresent:lastProbe?.apiPresent??null,configSupported:lastProbe?lastProbe.selected!==null:null,
    sources:Object.fromEntries(['gif','apng','webp'].map(s=>[s,passed.filter(r=>r.options?.source===s).length])),
    codecs:[...new Set(passed.map(r=>r.validation?.codec))],...counters,activeObjectUrls:urls.length,
    failures:rows.filter(r=>r.status==='FAIL').map(r=>({source:r.options?.source,error:r.error,cancelAt:r.options?.cancelAt,investigation:r.investigation})),
    encodeCancelled:rows.some(r=>r.error==='CANCELLED'&&r.options?.cancelAt==='encode'),finalizingCancelled:rows.some(r=>r.error==='CANCELLED'&&r.finalizeHeld),
    maxTimestampErrorUs:max(r=>r.validation?.maxTimestampErrorUs??0),maxDurationErrorUs:max(r=>r.validation?.maxDurationErrorUs??0),maxTotalDurationErrorUs:max(r=>r.validation?.totalDurationErrorUs??0),
    meanRgbErrorMax:max(r=>r.validation?.meanRgbError??0),p95RgbErrorMax:max(r=>r.validation?.p95RgbError??0),maxEncodeQueue:max(r=>r.metrics?.maxEncodeQueue??0),
    ownedVideoFramesActive:max(r=>r.metrics?.activeVideoFrames??0),ownedFramesBalanced:passed.every(r=>r.metrics?.framesCreated===r.metrics?.framesClosed),
    peakOwnedVideoFrames:max(r=>r.metrics?.peakVideoFrames??0),heartbeatMaxGapMs:Math.max(0,...rows.map(r=>r.heartbeat?.maxGapMs??0)),resources:runtimeDiagnostics.getSnapshot()}
}
function staticWorkerResponses(){
  return ['fixture','encoder','held-encoder','apng-decoder'].flatMap(role=>{
    const entries=performance.getEntriesByType('resource').filter(e=>{const u=new URL(e.name);return u.origin===location.origin&&u.pathname.startsWith(import.meta.env.BASE_URL+'assets/'+role+'.worker-')})
    const last=entries.at(-1);if(!last)return[]
    const status='responseStatus' in last&&typeof last.responseStatus==='number'?last.responseStatus:null
    return[{role,status,durationMs:last.duration}]
  })
}
const publish = () => { if (debug) {document.querySelector('#summary')!.textContent=JSON.stringify(summary());document.querySelector('#failures')!.textContent=JSON.stringify({diagnosticVersion,failures:summary().failures,staticWorkerResponses:staticWorkerResponses()});resultElement.textContent = JSON.stringify({
  environment: { secureContext: isSecureContext, hmr: import.meta.env.DEV, origin: location.origin, browser: navigator.userAgent },
  counters, activeObjectUrls: urls.length, results, resources: runtimeDiagnostics.getSnapshot(),
}, null, 2) } }
function clear() { for (const video of videos.querySelectorAll('video')) { video.pause(); video.removeAttribute('src'); video.load() } videos.replaceChildren(); urls.splice(0).forEach(url => URL.revokeObjectURL(url)); publish() }
function cancel() { suite++; active?.abort(); job.cancel() }
async function sourceFixture(options: CaseOptions, signal: AbortSignal, photoData?:ArrayBuffer,onFailure?:(e:WorkerObservation)=>void): Promise<VirtualFile> {
  const worker = new Worker(new URL('./fixture.worker.ts', import.meta.url), { type: 'module' }), release = trackRuntimeResource('worker')
  try {
    const result = await new Promise<{ data: ArrayBuffer; byteLength: number }>((resolve, reject) => {
      let booted=false;const started=performance.now()
      const failed=(trigger:'error-event'|'message-error')=>{onFailure?.({role:'fixture',trigger,operation:'generate',moduleBooted:booted,requestId:null,elapsedMs:performance.now()-started});cleanup();reject(new VideoError('WORKER_FAILED'))}
      const abort = () => reject(new VideoError('CANCELLED'))
      signal.addEventListener('abort', abort, { once: true })
      const cleanup = () => signal.removeEventListener('abort', abort)
      worker.onmessage = (e: MessageEvent<{ type: string; data: ArrayBuffer; byteLength: number }>) => {if(e.data.type==='fixture-boot'){booted=true;return} cleanup(); if (e.data.type !== 'fixture') reject(new VideoError('VIDEO_FRAME_FAILED')); else resolve(e.data) }
      worker.onerror = e => { e.preventDefault();failed('error-event') }
      worker.onmessageerror=()=>failed('message-error')
      if(signal.aborted){cleanup();reject(new VideoError('CANCELLED'));return}
      worker.postMessage({ format: options.source, photoData, photo: options.photo ?? false, softEdges: options.softEdges ?? false, options: { width: options.width, height: options.height, count: options.count,
        scene: options.scene ?? 'flat', playCount: options.playCount ?? 2, durations: options.durations ?? [27,100,41,500,20,250,33] } },photoData?[photoData]:[])
    })
    return { name: 'engineering-fixture', size: result.byteLength, source: 'file', read: async (start = 0, end = result.byteLength) => result.data.slice(start, end) }
  } finally { worker.terminate(); release() }
}
function preview(data: ArrayBuffer, source: ConversionFormat) {
  const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' })); urls.push(url)
  const label = document.createElement('h2'); label.textContent = `${source.toUpperCase()} → MP4`
  const video = document.createElement('video'); video.controls = true; video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url
  videos.append(label, video)
}
async function runCase(options: CaseOptions, originalBytes?: number[], photoBytes?:number[]) {
  active?.abort(); const controller = new AbortController(); active = controller; counters.jobsStarted++
  const jobId=counters.jobsStarted
  let phase:CasePhase='fixture',failurePhase:CasePhase|undefined,acceptedFrames=0,workerFailure:WorkerObservation|null=null
  let finalizePhase:VideoFinalizePhase|null=null
  const observe=(e:WorkerObservation)=>{workerFailure=e;failurePhase=phase}
  let heartbeat = 0, maxGapMs = 0, previous = performance.now(), finalizeHeld = false, lastMetrics: VideoMetrics | undefined
  const timer = setInterval(() => { const now = performance.now(); if (document.visibilityState === 'visible') { heartbeat++; maxGapMs = Math.max(maxGapMs, now - previous) } previous = now }, 16)
  const check = () => { if (controller.signal.aborted) throw new VideoError('CANCELLED') }
  let row: CaseReport
  const started = performance.now()
  try {
    status.textContent = 'Generating local source fixture…'
    const bytes = originalBytes && new Uint8Array(originalBytes)
    const file = bytes ? { name: 'original-conformance-fixture', size: bytes.byteLength, source: 'file' as const, read: async () => bytes.slice().buffer } : await sourceFixture(options, controller.signal,photoBytes?new Uint8Array(photoBytes).buffer:undefined,debug?observe:undefined)
    check(); const fixtureMs = performance.now() - started
    const abort = () => job.cancel(); controller.signal.addEventListener('abort', abort, { once: true })
    try {
      const result = await job.run(async signal => {
        phase='source-open'
        const source = await openAnimationFrameSource(file, options.source, signal); counters.activeDecoderWorkers++
        const next=source.next.bind(source);source.next=()=>{phase='source-next';return next()}
        const close = source.close.bind(source); let released = false
        source.close = async () => { try { await close() } finally { if (!released) { released = true; counters.activeDecoderWorkers-- } } }
        return source
      }, p => {
        status.textContent = `${p.phase} ${p.frame}/${p.total}`
        if (options.cancelAt === 'encode' && p.phase === 'encoding' && p.frame >= 1) job.cancel()
      }, () => {
        counters.activeEncoderWorkers++; let disposed = false
        const url = new URL(options.cancelAt === 'finalize-held' ? heldWorkerUrl : encoderWorkerUrl, import.meta.url)
        const client = new VideoWorkerClient(url, u => {
          const w = new Worker(u, { type: 'module' })
          w.addEventListener('message', (event: MessageEvent<{ type: string; metrics?: VideoMetrics;phase?:VideoFinalizePhase }>) => {
            if(event.data.type==='accepted')lastMetrics=event.data.metrics
            if(event.data.type==='finalize-phase'&&event.data.phase)finalizePhase=event.data.phase
            if(event.data.type==='finalize-held'){finalizeHeld=true;phase='held-finalizing';job.cancel()}
          }); return w
        },debug?(e:VideoWorkerFailureEvidence)=>observe({role:options.cancelAt==='finalize-held'?'held-encoder':'encoder',...e}):undefined)
        return { open: metadata=>{phase='encoder-open';return client.open(metadata)}, addFrame:async frame=>{phase='encoding';const result=await client.addFrame(frame);acceptedFrames++;return result}, finish:()=>{phase='finalizing';return client.finish()}, dispose: (reason?: VideoError) => {
          client.dispose(reason); if(!disposed){disposed=true;counters.activeEncoderWorkers--}
        } }
      })
      check();phase='complete';lastProbe=result.probe; const {data,...numeric}=result; preview(data,options.source); counters.jobsCompleted++
      row={status:'PASS',options,fixtureMs,...numeric,qualityScope:'256 evenly spaced RGB pixels per decoded frame; source is decoded canonical after white composite',
        qualityAssessment:result.validation.meanRgbError<=8&&result.validation.p95RgbError<=30?'WITHIN_SPIKE_THRESHOLD':'CHROMA_FIDELITY_LIMITATION'}
    } finally { controller.signal.removeEventListener('abort',abort) }
  } catch (cause) {
    const code=cause instanceof VideoError?cause.code:'VIDEO_FRAME_FAILED'
    if(code==='CANCELLED')counters.cancellations++
    row={status:code==='CANCELLED'?'CANCELLED':'FAIL',options,error:code,finalizeHeld,lastObservedMetrics:lastMetrics??null,
      ...(debug?{investigation:{jobId,phase:failurePhase??phase,finalizePhase,acceptedFrames,finalizeHeld,worker:workerFailure} satisfies Investigation}:{})}
  } finally { clearInterval(timer); if(active===controller)active=undefined }
  row.heartbeat={count:heartbeat,maxGapMs};row.resources=runtimeDiagnostics.getSnapshot();row.counters={...counters};results.push(row)
  status.textContent=String(row.status);publish();return row
}
async function runSet(large=false) {
  cancel();clear(); const id=suite
  for(const source of ['gif','apng','webp'] as const){
    if(id!==suite)break
    const r=await runCase({source,width:large?1024:320,height:large?1024:240,count:large?4:10,scene:'flat',softEdges:source!=='gif'})
    if(r.status!=='PASS')break
  }
}
async function cancellationTest(finalizing=false) {
  cancel();clear()
  const cancelled=await runCase({source:'apng',width:320,height:240,count:20,cancelAt:finalizing?'finalize-held':'encode'})
  if(cancelled.status==='CANCELLED')await runCase({source:'webp',width:320,height:240,count:10,softEdges:true})
}
async function probe() {
  const worker = new VideoWorkerClient(); counters.activeEncoderWorkers++
  try { const result=await worker.open({width:320,height:240,frameCount:1,playCount:0});lastProbe=result; results.push({stage:'capability-only (no real encode yet)',result}); }
  catch(e){if(e instanceof VideoError&&['VIDEO_API_UNAVAILABLE','VIDEO_CONFIG_UNSUPPORTED'].includes(e.code))lastProbe={apiPresent:e.code!=='VIDEO_API_UNAVAILABLE',selected:null,candidates:[]};results.push({stage:'capability',error:e instanceof VideoError?e.code:'WORKER_FAILED'})}
  finally{worker.dispose();counters.activeEncoderWorkers--;publish()}
}
document.querySelector('#environment')!.textContent=`Secure context: ${isSecureContext}; HMR: ${import.meta.env.DEV}; diagnostics: ${diagnosticVersion}; origin: ${location.origin}`
document.querySelector('#probe')!.addEventListener('click',()=>{void probe()})
document.querySelector('#small')!.addEventListener('click',()=>{void runSet()})
document.querySelector('#medium')!.addEventListener('click',()=>{void runSet(true)})
document.querySelector('#cancel-test')!.addEventListener('click',()=>{void cancellationTest()})
document.querySelector('#finalize-test')!.addEventListener('click',()=>{void cancellationTest(true)})
document.querySelector('#odd')!.addEventListener('click',()=>{cancel();clear();void runCase({source:'apng',width:319,height:241,count:10,softEdges:true})})
document.querySelector('#cancel')!.addEventListener('click',cancel)
document.querySelector('#clear')!.addEventListener('click',()=>{cancel();clear()})
declare global { interface Window { __videoHarness: { runCase:typeof runCase; runSet:typeof runSet; probe:typeof probe; clear:typeof clear; cancel:typeof cancel; results:typeof results; comparePaths():Promise<unknown>; outputBase64():Promise<string> } } }
window.__videoHarness={runCase,runSet,probe,clear,cancel,results,comparePaths:async()=>{
  const w=new Worker(new URL('./benchmark.worker.ts',import.meta.url),{type:'module'}),release=trackRuntimeResource('worker')
  try{return await new Promise((resolve,reject)=>{w.onmessage=e=>resolve(e.data);w.onerror=()=>reject(Error('Worker failed'));w.postMessage({})})}finally{w.terminate();release()}
},outputBase64:async()=>{
  const blob=await(await fetch(urls.at(-1)!)).blob()
  return await new Promise<string>((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(String(f.result).split(',')[1]!);f.onerror=reject;f.readAsDataURL(blob)})
}}
publish()
