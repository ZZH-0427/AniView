import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react'
import type {Ref} from 'react'
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
import {useI18n} from '../i18n'
import {numberText} from '../i18n/messages'
import type {MessageKey} from '../i18n/messages'
const label=(target:string)=>target==='webp'?'Animated WebP':target.toUpperCase()
const notes={gif:'video.gifNote',webp:'video.webpNote',apng:'video.apngNote'} as const
const preflightKeys={trim:'errors.trim',duration:'errors.clipDuration',frames:'errors.outputFrames',workload:'errors.outputWorkload',size:'errors.outputSize',apng:'errors.apngUnavailable'} as const satisfies Record<string,MessageKey>
function NativePreview({url,info,onTime,busy}:{url:string;info:VideoInspection;onTime:(us:number)=>void;busy:boolean}){
 const {t}=useI18n()
 const ref=useRef<HTMLVideoElement>(null)
 useEffect(()=>{const video=ref.current;return()=>{if(video){video.pause();video.removeAttribute('src');video.load()}}},[url])
 useEffect(()=>{if(busy)ref.current?.pause()},[busy])
 // The visual box uses parsed track geometry, including orientation and PAR.
 const aspect=info.displayWidth/info.displayHeight
 return <div className="video-preview-box" style={{width:`min(100%, 640px, calc(48vh * ${aspect}))`,aspectRatio:String(aspect)}}>
  <video ref={ref} src={url} controls playsInline muted preload="metadata" data-testid="video-source-preview" aria-label={t('video.preview')}
   onPlay={e=>{if(busy)e.currentTarget.pause()}}
   onTimeUpdate={e=>onTime(normalizedPreviewTime(e.currentTarget.currentTime,e.currentTarget.duration,info))}/></div>
}
export default function ConvertVideo({session,snapshot,onBack,onPreview,previewButtonRef}:{session:VideoConversionSession;snapshot:VideoConversionSnapshot;onBack:()=>void;onPreview:()=>void;previewButtonRef?:Ref<HTMLButtonElement>}){
 const {t,locale}=useI18n()
 const [cursor,setCursor]=useState<{url:string|undefined;us:number}>({url:undefined,us:0}),[dragging,setDragging]=useState(false)
 const resources=useSyncExternalStore(runtimeDiagnostics.subscribe,runtimeDiagnostics.getSnapshot,runtimeDiagnostics.getSnapshot)
 const {status,metadata,settings,result,progress,preflight,diagnostics}=snapshot,busy=videoBusy(status)
 const current=cursor.url===snapshot.previewUrl?cursor.us:0
 const errorId=useId(),sourceErrorId=`${errorId}-source`,trimErrorId=`${errorId}-trim`,outputErrorId=`${errorId}-output`
 // Metadata marks completed source admission. Later decoder/encoder failures belong to the job.
 const sourceError=!metadata&&snapshot.error?videoErrorMessage(snapshot.error,locale):undefined
 const jobError=metadata&&snapshot.error?videoErrorMessage(snapshot.error,locale):undefined
 const invalidPreflight=preflight&&!preflight.ok?preflight:undefined
 const preflightText=invalidPreflight?t(invalidPreflight.issue==='timing'
  ? !videoFps(settings.target).includes(settings.fps)?'errors.fps':'errors.shortFrame' : preflightKeys[invalidPreflight.issue]):undefined
 const trimError=invalidPreflight&&(invalidPreflight.issue==='trim'||invalidPreflight.issue==='duration')?preflightText:undefined
 const outputError=invalidPreflight&&!trimError?preflightText:undefined
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
 const operation=status==='preparing'?t('progress.preparingVideo'):status==='verifying'?t('progress.checkingOutput'):status==='cancelling'?t('progress.cancelling')
  :status==='cancelled'?t('progress.videoCancelled'):status==='success'?t('progress.complete'):status==='error'?t('progress.stopped')
   :status==='converting'?progress?.stage==='finalizing'?t('progress.finalizing'):progress?.stage==='sampling'?t('progress.sampling',{current:progress.current+1,total:progress.total})
    :progress?.stage==='encoding'?t('progress.encodingCount',{current:progress.current+1,total:progress.total}):t('progress.preparingVideo'):t('progress.chooseSettings')
 return <main className={`conversion-page video-conversion-page${dragging?' video-dragging':''}`} data-testid="video-conversion-page">
  <header className="conversion-header"><button onClick={onBack} data-testid="video-conversion-back" aria-label={t('common.backHome')}>← {t('common.home')}</button><h1>{t('home.convertVideo')}</h1></header>
  <section className="conversion-card" data-testid="video-source-section"><h2>{t('video.source')}</h2>
   <label className="video-file-label">{t(metadata?'video.chooseAnother':'video.choose')}<input type="file" accept=".mp4,.webm,video/mp4,video/webm" data-testid="video-input"
    aria-invalid={sourceError?true:undefined} aria-describedby={sourceError?sourceErrorId:undefined}
    onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void session.select(file)}}/></label>
   {status==='preparing'&&<p role="status" data-testid="video-conversion-status">{operation}</p>}
   {sourceError&&<p role="alert" id={sourceErrorId} data-testid="video-conversion-error" data-error-location="source" className="conversion-error">{sourceError}</p>}
   <p className="conversion-note">{t('video.sourceNote')}</p>
   {snapshot.sourceName&&<p className="conversion-filename" title={snapshot.sourceName}>{snapshot.sourceName}</p>}
   {metadata&&<dl className="conversion-metadata"><div><dt>{t('result.duration')}</dt><dd>{numberText(locale,metadata.durationUs/1e6,3)} s</dd></div>
    <div><dt>{t('video.displaySize')}</dt><dd>{metadata.displayWidth} × {metadata.displayHeight}</dd></div><div><dt>{t('video.container')}</dt><dd>{metadata.container.toUpperCase()}</dd></div>
    <div><dt>{t('result.codec')}</dt><dd>{metadata.codec==='avc'?'H.264':'VP9'}</dd></div></dl>}
   {metadata&&snapshot.previewUrl&&<NativePreview key={snapshot.previewUrl} url={snapshot.previewUrl} info={metadata} busy={busy} onTime={us=>setCursor({url:snapshot.previewUrl,us})}/>}
   {!metadata&&snapshot.sourceName&&!busy&&<button onClick={()=>{void session.retryPrepare()}}>{t('video.prepareAgain')}</button>}
  </section>
  <fieldset className="conversion-card video-trim" disabled={busy||!metadata} aria-invalid={trimError?true:undefined} aria-describedby={trimError?trimErrorId:undefined}><legend>{t('video.trim')}</legend>
   <p>{t('video.current',{time:videoTime(current)})}<output data-testid="video-current-time" className="visually-hidden" aria-hidden="true">{videoTime(current)}</output></p>
   <div className="conversion-actions"><button data-testid="video-set-start" onClick={()=>session.update({startUs:current})}>{t('video.setStart')}</button>
    <button data-testid="video-set-end" onClick={()=>session.update({endUs:current})}>{t('video.setEnd')}</button></div>
   <div className="video-fields"><label>{t('video.start')}<input type="number" min="0" step="0.001" value={Number.isFinite(settings.startUs)?settings.startUs/1e6:''} data-testid="video-start-time"
    aria-describedby={trimError?trimErrorId:undefined}
    onChange={e=>session.update({startUs:Math.round(e.currentTarget.valueAsNumber*1e6)})}/></label>
    <label>{t('video.end')}<input type="number" min="0" step="0.001" value={Number.isFinite(settings.endUs)?settings.endUs/1e6:''} data-testid="video-end-time"
     aria-describedby={trimError?trimErrorId:undefined}
     onChange={e=>session.update({endUs:Math.round(e.currentTarget.valueAsNumber*1e6)})}/></label></div>
   {/* Inline validation is read with the controls, without assertive announcements on each edit. */}
   {trimError&&<p id={trimErrorId} data-testid="video-preflight-error" data-error-location="trim" className="conversion-error">{trimError}</p>}
  </fieldset>
  <fieldset className="conversion-card video-fields" disabled={busy||!metadata} aria-invalid={outputError?true:undefined} aria-describedby={outputError?outputErrorId:undefined}><legend>{t('video.output')}</legend>
   <label>{t('video.format')}<select value={settings.target} data-testid="video-target" onChange={e=>{const target=e.currentTarget.value;if(target==='gif'||target==='webp'||target==='apng')session.update({target})}}>
    <option value="gif">GIF</option><option value="webp">Animated WebP</option><option value="apng">APNG</option></select></label>
   <label>{t('video.fps')}<select value={settings.fps} data-testid="video-fps" onChange={e=>session.update({fps:Number(e.currentTarget.value)})}>{videoFps(settings.target).map(fps=><option key={fps} value={fps}>{fps}</option>)}</select></label>
   <label>{t('video.longSide')}<select value={settings.longSide} data-testid="video-size" onChange={e=>{const value=e.currentTarget.value;session.update({longSide:value==='original'?'original':Number(value) as 360|480|720})}}>
    <option value="360">360</option><option value="480">480</option><option value="720">720</option><option value="original">{t('video.original')}</option></select></label>
   <p className="conversion-note">{t(notes[settings.target])} {t('video.aspectNote')}</p>
  </fieldset>
  <section className="conversion-card" aria-labelledby="video-estimate-heading"><h2 id="video-estimate-heading">{t('video.estimate')}</h2>
   {estimate?<dl className="conversion-metadata" data-testid="video-estimate"><div><dt>{t('video.selectedDuration')}</dt><dd>{numberText(locale,estimate.durationUs/1e6,3)} s</dd></div>
    <div><dt>{t('video.fps')}</dt><dd>{estimate.fps}</dd></div><div><dt>{t('video.sampledFrames')}</dt><dd>{estimate.frameCount} / 150</dd></div>
    <div><dt>{t('video.outputDimensions')}</dt><dd>{estimate.width} × {estimate.height}</dd></div></dl>:<p>{t('video.chooseClip')}</p>}
   {outputError&&<p id={outputErrorId} data-testid="video-preflight-error" data-error-location="output" className="conversion-error">{outputError}</p>}
  </section>
  <div className="conversion-actions"><button className="conversion-primary" data-testid="video-convert" disabled={busy||!preflight?.ok} onClick={()=>{void session.start()}}>{t('common.convert')}</button>
   {busy&&<button data-testid="video-cancel" disabled={status==='cancelling'} onClick={()=>{void session.cancel()}}>{t('common.cancel')}</button>}</div>
  {metadata&&status!=='preparing'&&<p role="status" data-testid="video-conversion-status">{operation}</p>}
  {status==='converting'&&<progress aria-label={t('video.progress')} {...(progress&&progress.stage!=='finalizing'?{max:1,value:progress.fraction}:{})}/>}
  {status==='verifying'&&<progress aria-label={t('video.checkProgress')}/>}
  {jobError&&<p role="alert" data-testid="video-conversion-error" data-error-location="job" className="conversion-error">{jobError}</p>}
  {result&&<section className="conversion-card" data-testid="video-conversion-result"><h2>{t('result.converted',{format:label(result.format)})}</h2>
   <dl className="conversion-metadata"><div><dt>{t('result.dimensions')}</dt><dd>{result.metadata.width} × {result.metadata.height}</dd></div><div><dt>{t('video.outputFrames')}</dt><dd>{result.metadata.frameCount}</dd></div>
    <div><dt>{t('result.duration')}</dt><dd>{numberText(locale,result.metadata.durationMs/1000,3)} s</dd></div><div><dt>{t('result.playback')}</dt><dd>{t('creator.loop')}</dd></div><div><dt>{t('result.size')}</dt><dd>{t('result.bytes',{count:numberText(locale,result.blob.size)})}</dd></div></dl>
   {result.sampledFrames!==result.metadata.frameCount&&<p>{t('video.merged',{count:result.sampledFrames})}</p>}
   <div className="conversion-actions"><button ref={previewButtonRef} className="preview-return-trigger" onClick={onPreview} data-testid="video-result-preview">{t('common.preview')}</button>
    <a className="conversion-download" href={result.url} download={result.filename} data-testid="video-result-download" onClick={e=>{e.currentTarget.download=session.nextDownloadName()}}>{t('common.download',{format:label(result.format)})}</a></div>
   <p className="conversion-note">{t('common.savedFiles')}</p>
  </section>}
  <DiagnosticsPanel title="Video conversion diagnostics"><details className="diagnostics-raw"><summary>Summary JSON</summary><output data-testid="video-conversion-debug">{JSON.stringify({status,jobId:snapshot.jobId,target:settings.target,
   ...diagnostics,activeWorkers:resources.activeWorkers,activeBitmaps:resources.activeBitmaps,activeArchiveSessions:resources.activeArchiveSessions,
   source:metadata?{container:metadata.container,codec:metadata.codec,width:metadata.displayWidth,height:metadata.displayHeight,durationUs:metadata.durationUs}:null,
   plan:preflight?.ok?preflight.plan:null,estimate:estimate??null,preflightIssue:invalidPreflight?.issue??null,limits:VIDEO_INPUT_LIMITS,error:snapshot.error??null,nativeGpuMemoryBytes:null})}</output></details></DiagnosticsPanel>
  <footer>{t('common.privacy')}</footer>
 </main>
}
