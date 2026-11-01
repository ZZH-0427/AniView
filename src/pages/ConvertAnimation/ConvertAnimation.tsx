import { useSyncExternalStore } from 'react'
import type { Ref } from 'react'
import { DiagnosticsPanel } from '../../components/DiagnosticsPanel'
import { runtimeDiagnostics } from '../../media/runtime-diagnostics'
import { ConversionSession, conversionBusy, conversionErrorMessage, formatLabel } from '../../conversion/conversion-session'
import type { ConversionSnapshot, ConversionMetadata, ConversionTarget } from '../../conversion/conversion-session'
import { CONVERSION_LIMITS } from '../../conversion/model'
import './convert-animation.css'
import { useI18n } from '../../i18n'
import { numberText } from '../../i18n/messages'
import type { MessageKey } from '../../i18n/messages'

const notes: Record<ConversionTarget, MessageKey> = { gif: 'convert.gifNote', webp: 'convert.webpNote', apng: 'convert.apngNote', mp4: 'convert.mp4Note' }
function Metadata({ info, bytes,video=false }: { info: ConversionMetadata; bytes: number;video?:boolean }) {
  const { t, locale } = useI18n()
  return <dl className="conversion-metadata">
    <div><dt>{t('result.dimensions')}</dt><dd>{info.width} × {info.height}</dd></div>
    {!video&&<div><dt>{t('result.frames')}</dt><dd>{info.frameCount}</dd></div>}
    <div><dt>{t('result.duration')}</dt><dd>{info.durationMs === null ? t('result.notMeasured') : `${numberText(locale, info.durationMs / 1000, 3)} s`}</dd></div>
    {video?<div><dt>{t('result.codec')}</dt><dd>H.264</dd></div>:<div><dt>{t('result.playback')}</dt><dd>{info.playCount === 0 ? t('creator.loop') : t(info.playCount === 1 ? 'result.onePlay' : 'result.plays', { count: info.playCount })}</dd></div>}
    <div><dt>{t('result.size')}</dt><dd>{t('result.bytes', { count: numberText(locale, bytes) })}</dd></div>
  </dl>
}
export default function ConvertAnimation({ session, snapshot, onBack, onPreview, previewButtonRef }: {
  session: ConversionSession; snapshot: ConversionSnapshot; onBack: () => void; onPreview: () => void
  previewButtonRef?: Ref<HTMLButtonElement>
}) {
  const { t, locale } = useI18n()
  const resources = useSyncExternalStore(runtimeDiagnostics.subscribe, runtimeDiagnostics.getSnapshot, runtimeDiagnostics.getSnapshot)
  const { status, source, sourceFormat, target, result, progress, diagnostics } = snapshot
  const busy = conversionBusy(status)
  const stage = t(progress?.phase === 'encoding' ? target === 'mp4' ? 'progress.encodingVideo' : 'progress.encoding' : progress?.phase === 'decoding' ? 'progress.decoding' : 'progress.preparing')
  const operation = status === 'preparing' ? t('progress.preparingSource') : status === 'verifying' ? t('progress.checkingOutput')
    : status === 'cancelling' ? t('progress.cancelling') : status === 'cancelled' ? t('progress.conversionCancelled')
      : status === 'converting' ? progress?.phase === 'finalizing' ? t(target === 'mp4' ? 'progress.finalizingMp4' : 'progress.finalizing')
        : progress?.totalFrames ? t('progress.frame', { stage, current: Math.min(progress.currentFrame + 1, progress.totalFrames), total: progress.totalFrames }) : `${stage}…`
        : t(status === 'success' ? 'progress.complete' : status === 'error' ? 'progress.stopped' : 'progress.ready')
  return <main className="conversion-page" data-testid="conversion-page">
    <header className="conversion-header"><button onClick={onBack} aria-label={t('common.backSource')} data-testid="conversion-back">← {t('common.back')}</button><h1>{t('viewer.convert')}</h1></header>
    <section className="conversion-card" aria-labelledby="conversion-source-heading">
      <h2 id="conversion-source-heading">{t('convert.source')}</h2><p className="conversion-filename" title={session.file.name}>{session.file.name}</p>
      {source && sourceFormat && <><p>{formatLabel(sourceFormat)}</p><Metadata info={source} bytes={session.file.size} /></>}
    </section>
    <fieldset className="conversion-card conversion-targets" disabled={busy}><legend>{t('convert.target')}</legend>
      {(['gif', 'webp', 'apng','mp4'] as const).map(format => <label key={format}>
        <input type="radio" name="conversion-target" value={format} checked={target === format}
          disabled={!source || snapshot.deflate===null || format === sourceFormat || (format === 'apng' && snapshot.deflate !== true)}
          onChange={() => session.selectTarget(format)} />
        <span>{formatLabel(format)}{format==='mp4'&&<small>{t('convert.h264')}</small>}{format === sourceFormat && <small>{t('convert.already', { format: formatLabel(format) })}</small>}</span>
      </label>)}
    </fieldset>
    {snapshot.deflate === false && <p role="status">{t('convert.apngUnavailable')}</p>}
    <p className="conversion-note">{t(notes[target])}</p>
    <div className="conversion-actions"><button className="conversion-primary" data-testid="conversion-start" disabled={busy || !source || snapshot.deflate === null}
      onClick={() => { void session.start() }}>{t('common.convert')}</button>
      {['converting', 'verifying', 'cancelling'].includes(status) && <button data-testid="conversion-cancel" disabled={status === 'cancelling'} onClick={() => { void session.cancel() }}>{t('common.cancel')}</button>}
    </div>
    <p role="status" data-testid="conversion-status">{operation}</p>
    {['converting', 'verifying'].includes(status) && !(target==='mp4'&&progress?.phase==='finalizing') && <progress aria-label={t('convert.progress')}
      {...(progress?.totalFrames ? { max: progress.totalFrames, value: progress.currentFrame } : {})} />}
    {snapshot.error && <p role="alert" className="conversion-error" data-testid="conversion-error">{conversionErrorMessage(snapshot.error, target, locale)}</p>}
    {result && <section className="conversion-card" data-testid="conversion-result" aria-labelledby="conversion-result-heading">
      <h2 id="conversion-result-heading">{t('result.converted', { format: formatLabel(result.format) })}</h2><Metadata info={result.metadata} bytes={result.blob.size} video={result.format==='mp4'} />
      {result.format==='mp4'&&source&&(source.width!==result.metadata.width||source.height!==result.metadata.height)&&<p className="conversion-note">{t('result.padding')}</p>}
      <div className="conversion-actions"><button ref={previewButtonRef} className="preview-return-trigger" disabled={busy} data-testid="conversion-preview" onClick={onPreview}>{t('common.preview')}</button>
        <a className="conversion-download" href={result.url} download={result.filename} aria-disabled={busy} tabIndex={busy ? -1 : 0}
          onClick={event => { if (busy) event.preventDefault(); else event.currentTarget.download = session.nextDownloadName() }}
          data-testid="conversion-download">{t('common.download', { format: formatLabel(result.format) })}</a></div>
      <p className="conversion-note">{t('common.savedFiles')}</p>
    </section>}
    <DiagnosticsPanel title="Conversion diagnostics"><details className="diagnostics-raw"><summary>Summary JSON</summary>
      <output data-testid="conversion-debug">{JSON.stringify({ status, target, deflate: snapshot.deflate, jobId: snapshot.jobId, ...diagnostics,
        activeWorkers: resources.activeWorkers, activeArchiveSessions: resources.activeArchiveSessions, activeBitmaps: resources.activeBitmaps, cleanupErrors: diagnostics.cleanupErrors + resources.cleanupErrors,
        source: source ? { width: source.width, height: source.height, frameCount: source.frameCount, framePixels: source.width * source.height * source.frameCount } : null,
        limits: {...CONVERSION_LIMITS,...(target==='mp4'?{maxDurationUs:30000000}:{})}, error: snapshot.error ?? null })}</output>
    </details></DiagnosticsPanel>
    <footer>{t('common.privacy')}</footer>
  </main>
}
