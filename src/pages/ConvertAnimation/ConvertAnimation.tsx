import { useSyncExternalStore } from 'react'
import { DiagnosticsPanel } from '../../components/DiagnosticsPanel'
import { runtimeDiagnostics } from '../../media/runtime-diagnostics'
import { ConversionSession, conversionBusy, conversionErrorMessage, formatLabel } from '../../conversion/conversion-session'
import type { ConversionSnapshot, ConversionMetadata, ConversionTarget } from '../../conversion/conversion-session'
import { CONVERSION_LIMITS } from '../../conversion/model'
import './convert-animation.css'

const notes: Record<ConversionTarget, string> = {
  gif: 'GIF supports up to 256 colors and 1-bit transparency. Some colors, soft transparency, and frame timing may be reduced.',
  webp: 'Lossless animated WebP. Adjacent identical frames may merge; timing and playback are retained.',
  apng: 'Lossless animation with full alpha. Files may be larger. Some source decoding can round semi-transparent colors.',
  mp4:'MP4 (H.264) exports one animation cycle, with no audio. Transparency is filled with white. Video encoding is lossy; fine color details may change.',
}
function Metadata({ info, bytes,video=false }: { info: ConversionMetadata; bytes: number;video?:boolean }) {
  return <dl className="conversion-metadata">
    <div><dt>Dimensions</dt><dd>{info.width} × {info.height}</dd></div>
    {!video&&<div><dt>Frames</dt><dd>{info.frameCount}</dd></div>}
    <div><dt>Duration</dt><dd>{info.durationMs === null ? 'Not measured yet' : `${(info.durationMs / 1000).toFixed(3)} s`}</dd></div>
    {video?<div><dt>Codec</dt><dd>H.264</dd></div>:<div><dt>Playback</dt><dd>{info.playCount === 0 ? 'Loop forever' : `${info.playCount} ${info.playCount === 1 ? 'play' : 'plays'}`}</dd></div>}
    <div><dt>Size</dt><dd>{bytes.toLocaleString()} bytes</dd></div>
  </dl>
}
export default function ConvertAnimation({ session, snapshot, onBack, onPreview }: {
  session: ConversionSession; snapshot: ConversionSnapshot; onBack: () => void; onPreview: () => void
}) {
  const resources = useSyncExternalStore(runtimeDiagnostics.subscribe, runtimeDiagnostics.getSnapshot, runtimeDiagnostics.getSnapshot)
  const { status, source, sourceFormat, target, result, progress, diagnostics } = snapshot
  const busy = conversionBusy(status)
  const operation = status === 'preparing' ? 'Preparing source…' : status === 'verifying' ? 'Checking output…'
    : status === 'cancelling' ? 'Cancelling…' : status === 'cancelled' ? 'Conversion cancelled. Source and target retained.'
      : status === 'converting' ? progress?.phase === 'finalizing' ? target==='mp4'?'Finalizing MP4…':'Finalizing…' : `${progress?.phase === 'encoding' ? target==='mp4'?'Encoding video':'Encoding' : progress?.phase === 'decoding' ? 'Decoding' : 'Preparing'}${progress?.totalFrames ? ` · Frame ${Math.min(progress.currentFrame + 1, progress.totalFrames)} / ${progress.totalFrames}` : '…'}`
        : status === 'success' ? 'Conversion complete' : status === 'error' ? 'Conversion stopped' : 'Ready to convert'
  return <main className="conversion-page" data-testid="conversion-page">
    <header className="conversion-header"><button onClick={onBack} aria-label="Back to source" data-testid="conversion-back">← Back</button><h1>Convert animation</h1></header>
    <section className="conversion-card" aria-labelledby="conversion-source-heading">
      <h2 id="conversion-source-heading">Source animation</h2><p className="conversion-filename" title={session.file.name}>{session.file.name}</p>
      {source && sourceFormat && <><p>{formatLabel(sourceFormat)}</p><Metadata info={source} bytes={session.file.size} /></>}
    </section>
    <fieldset className="conversion-card conversion-targets" disabled={busy}><legend>Convert to</legend>
      {(['gif', 'webp', 'apng','mp4'] as const).map(format => <label key={format}>
        <input type="radio" name="conversion-target" value={format} checked={target === format}
          disabled={!source || snapshot.deflate===null || format === sourceFormat || (format === 'apng' && snapshot.deflate !== true)}
          onChange={() => session.selectTarget(format)} />
        <span>{formatLabel(format)}{format==='mp4'&&<small>H.264 video</small>}{format === sourceFormat && <small>Already {formatLabel(format)}</small>}</span>
      </label>)}
    </fieldset>
    {snapshot.deflate === false && <p role="status">APNG encoding is not supported in this browser.</p>}
    <p className="conversion-note">{notes[target]}</p>
    <div className="conversion-actions"><button className="conversion-primary" data-testid="conversion-start" disabled={busy || !source || snapshot.deflate === null}
      onClick={() => { void session.start() }}>Convert</button>
      {['converting', 'verifying', 'cancelling'].includes(status) && <button data-testid="conversion-cancel" disabled={status === 'cancelling'} onClick={() => { void session.cancel() }}>Cancel</button>}
    </div>
    <p role="status" data-testid="conversion-status">{operation}</p>
    {['converting', 'verifying'].includes(status) && !(target==='mp4'&&progress?.phase==='finalizing') && <progress aria-label="Animation conversion progress"
      {...(progress?.totalFrames ? { max: progress.totalFrames, value: progress.currentFrame } : {})} />}
    {snapshot.error && <p role="alert" className="conversion-error" data-testid="conversion-error">{conversionErrorMessage(snapshot.error, target)}</p>}
    {result && <section className="conversion-card" data-testid="conversion-result" aria-labelledby="conversion-result-heading">
      <h2 id="conversion-result-heading">Converted {formatLabel(result.format)}</h2><Metadata info={result.metadata} bytes={result.blob.size} video={result.format==='mp4'} />
      {result.format==='mp4'&&source&&(source.width!==result.metadata.width||source.height!==result.metadata.height)&&<p className="conversion-note">White padding added on the right or bottom for video compatibility.</p>}
      <div className="conversion-actions"><button disabled={busy} data-testid="conversion-preview" onClick={onPreview}>Preview</button>
        <a className="conversion-download" href={result.url} download={result.filename} aria-disabled={busy} tabIndex={busy ? -1 : 0}
          onClick={event => { if (busy) event.preventDefault(); else event.currentTarget.download = session.nextDownloadName() }}
          data-testid="conversion-download">Download {formatLabel(result.format)}</a></div>
      <p className="conversion-note">Find saved files in your browser downloads or Files. Gallery visibility depends on your browser and device.</p>
    </section>}
    <DiagnosticsPanel title="Conversion diagnostics"><details className="diagnostics-raw"><summary>Summary JSON</summary>
      <output data-testid="conversion-debug">{JSON.stringify({ status, target, deflate: snapshot.deflate, jobId: snapshot.jobId, ...diagnostics,
        activeWorkers: resources.activeWorkers, activeArchiveSessions: resources.activeArchiveSessions, activeBitmaps: resources.activeBitmaps, cleanupErrors: diagnostics.cleanupErrors + resources.cleanupErrors,
        source: source ? { width: source.width, height: source.height, frameCount: source.frameCount, framePixels: source.width * source.height * source.frameCount } : null,
        limits: {...CONVERSION_LIMITS,...(target==='mp4'?{maxDurationUs:30000000}:{})}, error: snapshot.error ?? null })}</output>
    </details></DiagnosticsPanel>
    <footer>Files are processed locally in your browser.</footer>
  </main>
}
