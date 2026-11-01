import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {DiagnosticsPanel} from '../components/DiagnosticsPanel'
import {runtimeDiagnostics} from '../media/runtime-diagnostics'
import {VIDEO_INPUT_LIMITS} from '../video-source/model'
import type {VideoInspection} from '../video-source/model'
import {videoBusy} from './video-conversion-session'
import type {VideoConversionSession,VideoConversionSnapshot} from './video-conversion-session'
import {normalizedPreviewTime,videoFps,videoTime} from './settings'
import {videoErrorMessage} from './errors'
import '../pages/ConvertAnimation/convert-animation.css'
import './video-conversion.css'
const label=(target:string)=>target==='webp'?'Animated WebP':target.toUpperCase()
const notes={gif:'Best compatibility, limited to 256 colors.',webp:'Lossless animated WebP; usually smaller than APNG.',apng:'Lossless animation; file sizes may be larger.'}
function NativePreview({url,info,onTime,busy}:{url:string;info:VideoInspection;onTime:(us:number)=>void;busy:boolean}){
 const ref=useRef<HTMLVideoElement>(null)
 useEffect(()=>{const video=ref.current;return()=>{if(video){video.pause();video.removeAttribute('src');video.load()}}},[url])
 useEffect(()=>{if(busy)ref.current?.pause()},[busy])
 // The visual box uses parsed track geometry, including orientation and PAR.
 const aspect=info.displayWidth/info.displayHeight
 return <div className="video-preview-box" style={{width:`min(100%, 640px, calc(48vh * ${aspect}))`,aspectRatio:String(aspect)}}>
  <video ref={ref} src={url} controls playsInline muted preload="metadata" data-testid="video-source-preview"
   onPlay={e=>{if(busy)e.currentTarget.pause()}}
   onTimeUpdate={e=>onTime(normalizedPreviewTime(e.currentTarget.currentTime,e.currentTarget.duration,info))}/></div>
}
export default function ConvertVideo({session,snapshot,onBack,onPreview}:{session:VideoConversionSession;snapshot:VideoConversionSnapshot;onBack:()=>void;onPreview:()=>void}){
 const [cursor,setCursor]=useState<{url:string|undefined;us:number}>({url:undefined,us:0}),[dragging,setDragging]=useState(false)
 const resources=useSyncExternalStore(runtimeDiagnostics.subscribe,runtimeDiagnostics.getSnapshot,runtimeDiagnostics.getSnapshot)
 const {status,metadata,settings,result,progress,preflight,diagnostics}=snapshot,busy=videoBusy(status)
 const current=cursor.url===snapshot.previewUrl?cursor.us:0
 useEffect(()=>{
  const over=(e:DragEvent)=>{e.preventDefault();const files=Array.from(e.dataTransfer?.types??[]).includes('Files');if(e.dataTransfer)e.dataTransfer.dropEffect=files?'copy':'none';if(files)setDragging(true)}
  const drop=(e:DragEvent)=>{e.preventDefault();setDragging(false);const file=e.dataTransfer?.files[0];if(file)void session.select(file)}
  const leave=()=>setDragging(false)
  const exit=(e:DragEvent)=>{if(!e.relatedTarget)leave()}
  window.addEventListener('dragover',over);window.addEventListener('drop',drop);window.addEventListener('dragend',leave)
  window.addEventListener('dragleave',exit);window.addEventListener('blur',leave)
  return()=>{window.removeEventListener('dragover',over);window.removeEventListener('drop',drop);window.removeEventListener('dragend',leave);window.removeEventListener('dragleave',exit);window.removeEventListener('blur',leave)}
 },[session])
 const estimate=preflight?.estimate
 const operation=status==='preparing'?'Preparing video…':status==='verifying'?'Checking output…':status==='cancelling'?'Cancelling…'
  :status==='cancelled'?'Conversion cancelled. Your video and settings are retained.':status==='success'?'Conversion complete':status==='error'?'Conversion stopped'
   :status==='converting'?progress?.stage==='finalizing'?'Finalizing…':progress?.stage==='sampling'?`Sampling ${progress.current+1} / ${progress.total}`
    :progress?.stage==='encoding'?`Encoding ${progress.current+1} / ${progress.total}`:'Preparing video…':'Choose settings and convert'
 return <main className={`conversion-page video-conversion-page${dragging?' video-dragging':''}`} data-testid="video-conversion-page">
  <header className="conversion-header"><button onClick={onBack} data-testid="video-conversion-back" aria-label="Back to Home">← Home</button><h1>Convert video</h1></header>
  <section className="conversion-card"><h2>Source video</h2>
   <label className="video-file-label">{metadata?'Choose another video':'Choose video'}<input type="file" accept=".mp4,.webm,video/mp4,video/webm" data-testid="video-input"
    onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void session.select(file)}}/></label>
   <p className="conversion-note">MP4 with H.264 or WebM with VP9. Audio is ignored in the animation. You can also drop a video here.</p>
   {snapshot.sourceName&&<p className="conversion-filename" title={snapshot.sourceName}>{snapshot.sourceName}</p>}
   {metadata&&<dl className="conversion-metadata"><div><dt>Duration</dt><dd>{(metadata.durationUs/1e6).toFixed(3)} s</dd></div>
    <div><dt>Display dimensions</dt><dd>{metadata.displayWidth} × {metadata.displayHeight}</dd></div><div><dt>Container</dt><dd>{metadata.container.toUpperCase()}</dd></div>
    <div><dt>Codec</dt><dd>{metadata.codec==='avc'?'H.264':'VP9'}</dd></div></dl>}
   {metadata&&snapshot.previewUrl&&<NativePreview key={snapshot.previewUrl} url={snapshot.previewUrl} info={metadata} busy={busy} onTime={us=>setCursor({url:snapshot.previewUrl,us})}/>}
   {!metadata&&snapshot.sourceName&&!busy&&<button onClick={()=>{void session.retryPrepare()}}>Prepare again</button>}
  </section>
  <fieldset className="conversion-card video-trim" disabled={busy||!metadata}><legend>Trim</legend>
   <p>Current time: <output data-testid="video-current-time">{videoTime(current)}</output></p>
   <div className="conversion-actions"><button data-testid="video-set-start" onClick={()=>session.update({startUs:current})}>Set Start</button>
    <button data-testid="video-set-end" onClick={()=>session.update({endUs:current})}>Set End</button></div>
   <div className="video-fields"><label>Start (seconds)<input type="number" min="0" step="0.001" value={Number.isFinite(settings.startUs)?settings.startUs/1e6:''} data-testid="video-start-time"
    onChange={e=>session.update({startUs:Math.round(e.currentTarget.valueAsNumber*1e6)})}/></label>
    <label>End (seconds)<input type="number" min="0" step="0.001" value={Number.isFinite(settings.endUs)?settings.endUs/1e6:''} data-testid="video-end-time"
     onChange={e=>session.update({endUs:Math.round(e.currentTarget.valueAsNumber*1e6)})}/></label></div>
  </fieldset>
  <fieldset className="conversion-card video-fields" disabled={busy||!metadata}><legend>Output</legend>
   <label>Format<select value={settings.target} data-testid="video-target" onChange={e=>{const target=e.currentTarget.value;if(target==='gif'||target==='webp'||target==='apng')session.update({target})}}>
    <option value="gif">GIF</option><option value="webp">Animated WebP</option><option value="apng">APNG</option></select></label>
   <label>FPS<select value={settings.fps} data-testid="video-fps" onChange={e=>session.update({fps:Number(e.currentTarget.value)})}>{videoFps(settings.target).map(fps=><option key={fps} value={fps}>{fps}</option>)}</select></label>
   <label>Output long side<select value={settings.longSide} data-testid="video-size" onChange={e=>{const value=e.currentTarget.value;session.update({longSide:value==='original'?'original':Number(value) as 360|480|720})}}>
    <option value="360">360</option><option value="480">480</option><option value="720">720</option><option value="original">Original</option></select></label>
   <p className="conversion-note">{notes[settings.target]} Loop forever. Aspect ratio is preserved; smaller videos are not enlarged.</p>
  </fieldset>
  <section className="conversion-card" aria-labelledby="video-estimate-heading"><h2 id="video-estimate-heading">Estimated result</h2>
   {estimate?<dl className="conversion-metadata" data-testid="video-estimate"><div><dt>Selected duration</dt><dd>{(estimate.durationUs/1e6).toFixed(3)} s</dd></div>
    <div><dt>FPS</dt><dd>{estimate.fps}</dd></div><div><dt>Sampled frames</dt><dd>{estimate.frameCount} / 150</dd></div>
    <div><dt>Output dimensions</dt><dd>{estimate.width} × {estimate.height}</dd></div><div><dt>Frame-pixel workload</dt><dd>{(estimate.framePixels/1e6).toFixed(2)} MP / 15.36 MP</dd></div></dl>:<p>Choose a video and a valid clip.</p>}
   {preflight&&!preflight.ok&&<p role="alert" data-testid="video-preflight-error" className="conversion-error">{preflight.message}</p>}
  </section>
  <div className="conversion-actions"><button className="conversion-primary" data-testid="video-convert" disabled={busy||!preflight?.ok} onClick={()=>{void session.start()}}>Convert</button>
   {busy&&<button data-testid="video-cancel" disabled={status==='cancelling'} onClick={()=>{void session.cancel()}}>Cancel</button>}</div>
  <p role="status" data-testid="video-conversion-status">{operation}</p>
  {status==='converting'&&<progress aria-label="Video conversion progress" {...(progress&&progress.stage!=='finalizing'?{max:1,value:progress.fraction}:{})}/>}
  {status==='verifying'&&<progress aria-label="Checking converted animation"/>}
  {snapshot.error&&<p role="alert" data-testid="video-conversion-error" className="conversion-error">{videoErrorMessage(snapshot.error)}</p>}
  {result&&<section className="conversion-card" data-testid="video-conversion-result"><h2>Converted {label(result.format)}</h2>
   <dl className="conversion-metadata"><div><dt>Dimensions</dt><dd>{result.metadata.width} × {result.metadata.height}</dd></div><div><dt>Output frames</dt><dd>{result.metadata.frameCount}</dd></div>
    <div><dt>Duration</dt><dd>{(result.metadata.durationMs/1000).toFixed(3)} s</dd></div><div><dt>Playback</dt><dd>Loop forever</dd></div><div><dt>Size</dt><dd>{result.blob.size.toLocaleString()} bytes</dd></div></dl>
   {result.sampledFrames!==result.metadata.frameCount&&<p>Sampled frames: {result.sampledFrames}. Identical WebP frames were combined with their timing retained.</p>}
   <div className="conversion-actions"><button onClick={onPreview} data-testid="video-result-preview">Preview</button>
    <a className="conversion-download" href={result.url} download={result.filename} data-testid="video-result-download" onClick={e=>{e.currentTarget.download=session.nextDownloadName()}}>Download {label(result.format)}</a></div>
   <p className="conversion-note">Find saved files in Downloads or Files. Gallery visibility depends on your browser and device.</p>
  </section>}
  <DiagnosticsPanel title="Video conversion diagnostics"><details className="diagnostics-raw"><summary>Summary JSON</summary><output data-testid="video-conversion-debug">{JSON.stringify({status,jobId:snapshot.jobId,target:settings.target,
   ...diagnostics,activeWorkers:resources.activeWorkers,activeBitmaps:resources.activeBitmaps,activeArchiveSessions:resources.activeArchiveSessions,
   source:metadata?{container:metadata.container,codec:metadata.codec,width:metadata.displayWidth,height:metadata.displayHeight,durationUs:metadata.durationUs}:null,
   plan:preflight?.ok?preflight.plan:null,limits:VIDEO_INPUT_LIMITS,error:snapshot.error??null,nativeGpuMemoryBytes:null})}</output></details></DiagnosticsPanel>
  <footer>Files are processed locally in your browser.</footer>
 </main>
}
