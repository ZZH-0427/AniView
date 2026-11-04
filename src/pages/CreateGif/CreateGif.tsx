import { memo, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { Ref } from 'react'
import { Icon } from '../../components/Icon'
import { IconButton } from '../../components/IconButton'
import type { CreationSession } from '../../creation/creation-session'
import type { CreationResult, CreationSnapshot, CreationSource } from '../../creation/creation-types'
import { isCreationBusy, creationFormats } from '../../creation/creation-types'
import { droppedFiles } from '../../input/drag-drop'
import { takeFileSelection } from '../../input/file-input'
import { CreationDiagnostics } from './CreationDiagnostics'
import './create-gif.css'
import { useI18n } from '../../i18n'
import { numberText } from '../../i18n/messages'
import type { Locale } from '../../i18n/locale'

const formatBytes = (bytes: number, locale: Locale) => bytes < 1024 ? `${numberText(locale, bytes)} B`
  : bytes < 1024 * 1024 ? `${numberText(locale, bytes / 1024, 1)} KiB` : `${numberText(locale, bytes / 1024 / 1024, 2)} MiB`
const validDuration = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 20 && Number(value) <= 10000
const validPlayCount = (value: string) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100

function operationMessage(snapshot: CreationSnapshot, t: ReturnType<typeof useI18n>['t']) {
  const progress = snapshot.progress
  switch (snapshot.status) {
    case 'adding': return snapshot.addingProgress ? t('progress.checkingSourcesCount', snapshot.addingProgress) : t('progress.checkingSources')
    case 'preparing': return progress ? t('progress.preparingImagesCount', { current: progress.completedFrames, total: progress.totalFrames }) : t('progress.preparingImages')
    case 'encoding': return t('progress.encodingCount', { current: progress?.completedFrames ?? 0, total: progress?.totalFrames ?? snapshot.sources.length })
    case 'finalizing': return t('progress.finalizing')
    case 'verifying': return t('progress.checkingOutput')
    case 'cancelling': return t('progress.cancelling')
    case 'cancelled': return t('progress.generationCancelled')
    case 'success': return t('creator.generatedFormat', { format: creationFormats[snapshot.result?.format ?? snapshot.settings.target].label })
    default: return ''
  }
}

// Worker progress changes frequently, while the source handles stay identical.
// Keep the 200-row source list out of those progress-only render passes.
const SourceList = memo(function SourceList({ sources, busy, session }: {
  sources: readonly CreationSource[]; busy: boolean; session: CreationSession
}) {
  const { t, locale } = useI18n()
  return <ol className="creator-source-list" data-testid="creation-source-list" aria-label={t('creator.order')}>
    {sources.map((source, index) => <li key={source.id} className="creator-source-row" data-testid="creation-source-row"
      data-source-id={source.id} aria-label={t('creator.imageLabel', { number: index + 1, name: source.file.name })}>
      <span className="creator-position" aria-hidden="true">{index + 1}</span>
      <div className="creator-source-info"><p className="creator-filename" title={source.file.name}>{source.file.name}</p>
        <p className="creator-source-meta">{source.format.toUpperCase()} · {formatBytes(source.file.size, locale)}</p></div>
      <div className="creator-row-actions">
        <IconButton icon="arrow-up" label={t('creator.up')} data-action="up" disabled={busy || index === 0} onClick={() => session.move(source.id, 'up')} />
        <IconButton icon="arrow-down" label={t('creator.down')} data-action="down" disabled={busy || index === sources.length - 1} onClick={() => session.move(source.id, 'down')} />
        <IconButton icon="close" label={t('creator.remove')} data-action="remove" disabled={busy} onClick={() => session.remove(source.id)} />
      </div>
    </li>)}
  </ol>
})

/** Creation owns handles/settings only. Preview delegates to the existing Viewer. */
export default function CreateGif({ session, onBack, onPreview, previewButtonRef }: {
  session: CreationSession
  onBack: () => void
  onPreview: (result: CreationResult) => void
  previewButtonRef?: Ref<HTMLButtonElement>
}) {
  const { t, text, locale } = useI18n()
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const { sources, settings, result } = snapshot
  const input = useRef<HTMLInputElement>(null)
  const minimumSourceId = useId()
  const [duration, setDuration] = useState(String(settings.frameDurationMs))
  const [playCount, setPlayCount] = useState(String(settings.playCount))
  const [dragging, setDragging] = useState(false)
  const busy = isCreationBusy(snapshot.status)
  const generating = ['preparing', 'encoding', 'finalizing', 'verifying', 'cancelling'].includes(snapshot.status)
  const durationValid = validDuration(duration), countValid = validPlayCount(playCount)
  const progress = snapshot.progress
  const actualProgress = progress?.phase === 'encoding' && progress.totalFrames > 0
    ? { value: progress.completedFrames, max: progress.totalFrames } : undefined
  const generateLabel = t(settings.target === 'gif' ? 'creator.generate' : settings.target === 'webp' ? 'creator.generateWebp' : 'creator.generateApng')

  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (!busy) { depth++; setDragging(true) }
    }
    const over = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = !busy && hasFiles(event) ? 'copy' : 'none'
    }
    const leave = () => { if (depth > 0 && --depth === 0) setDragging(false) }
    const reset = () => { depth = 0; setDragging(false) }
    const drop = (event: DragEvent) => {
      event.preventDefault(); reset()
      if (busy || !event.dataTransfer) return
      const transfer = event.dataTransfer
      // A directory can appear as an empty File in browser drop APIs. Exclude
      // directory entries rather than treating them as creation source files.
      const files = transfer.items.length ? Array.from(transfer.items)
        .filter(item => item.kind === 'file' && !item.webkitGetAsEntry?.()?.isDirectory)
        .map(item => item.getAsFile()).filter((file): file is File => !!file) : Array.from(transfer.files)
      void session.add(droppedFiles({ files }))
    }
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave); window.addEventListener('drop', drop)
    window.addEventListener('dragend', reset); window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', reset); window.removeEventListener('blur', reset)
    }
  }, [busy, session])

  const commitDuration = () => {
    if (!durationValid) { session.updateSettings({ frameDurationMs: Number(duration) }); return }
    const normalized = Math.round(Number(duration) / 10) * 10
    setDuration(String(normalized)); session.updateSettings({ frameDurationMs: normalized })
  }
  const commitPlayCount = () => { session.updateSettings({ playCount: Number(playCount) }) }
  const generate = () => {
    if (!durationValid || (!settings.loopForever && !countValid)) return
    const normalized = Math.round(Number(duration) / 10) * 10
    setDuration(String(normalized))
    session.updateSettings({ frameDurationMs: normalized, playCount: countValid ? Number(playCount) : settings.playCount })
    void session.generate()
  }

  return <main className="gif-creator" data-testid="creator-page">
    <header className="creator-header">
      <IconButton icon="previous-file" label={t('common.back')} data-testid="creation-back" onClick={onBack} />
      <div><p className="creator-eyebrow">AniView</p><h1>{t('home.createAnimation')}</h1></div>
    </header>

    <section className="creator-sources creator-card" aria-labelledby="creation-sources-heading">
      <div className="creator-section-heading">
        <h2 id="creation-sources-heading">{t('creator.sources')}</h2>
        <div className="creator-list-actions">
          <IconButton icon="add" label={t(sources.length ? 'creator.add' : 'home.chooseImages')} disabled={busy}
            {...(sources.length ? {} : { text: t('home.chooseImages') })} onClick={() => input.current?.click()} />
          {sources.length > 0 && <details className="creator-more">
            <summary aria-label={t('creator.listOptions')} title={t('creator.listOptions')}><Icon name="more" /></summary>
            <div className="creator-more-actions"><IconButton icon="remove" label={t('creator.clear')} text={t('creator.clear')}
              data-testid="creation-clear" disabled={busy} onClick={() => { void session.clear() }} /></div>
          </details>}
        </div>
      </div>
      <input ref={input} className="visually-hidden" type="file" accept="image/*" multiple disabled={busy}
        aria-label={t('creator.choose')} data-testid="creation-input" tabIndex={-1}
        onChange={event => { const files = takeFileSelection(event.currentTarget); if (files.length) void session.add(files) }} />
      <div className="creator-budget" aria-label={t('creator.limits')}>
        <p>{t('creator.count', { count: sources.length })}</p><p>{numberText(locale, snapshot.totalSourceBytes / 1024 / 1024, 2)} MiB / 16 MiB</p>
      </div>
      {sources.length ? <SourceList sources={sources} busy={busy} session={session} /> : <div className="creator-empty">
        <Icon name="create" /><p>{t('creator.empty')}</p><p>JPEG · PNG · WebP</p>
      </div>}
      {sources.length === 1 && <p className="creator-note" id={minimumSourceId} data-testid="creation-minimum-sources">{t('creator.minimum')}</p>}
      <p className="creator-drop-hint">{t('creator.dropHint')}</p>
      {snapshot.notice && <p className="creator-notice" role="status" data-testid="creation-notice">{snapshot.noticeReasons
        ? t(snapshot.rejectedCount === 1 ? 'creator.notAddedOne' : 'creator.notAdded', { count: snapshot.rejectedCount ?? 0, reasons: snapshot.noticeReasons.map(text).join(' ') })
        : text(snapshot.noticeMessage ?? { key: 'errors.generic' })}</p>}
    </section>

    <section className="creator-settings creator-card" aria-labelledby="creation-settings-heading">
      <h2 id="creation-settings-heading">{t('creator.animation')}</h2>
      <fieldset className="creator-format" disabled={busy}>
        <legend>{t('creator.outputFormat')}</legend>
        <div className="creator-format-options">{(['gif', 'webp', 'apng'] as const).map(target => <label key={target} className="creator-checkbox">
          <input type="radio" name="creation-target" value={target} checked={settings.target === target}
            onChange={() => session.updateSettings({ target })} />{creationFormats[target].label}
        </label>)}</div>
      </fieldset>
      <div className="creator-fields">
        <div className="creator-field"><label htmlFor="creation-duration">{t('creator.duration')}</label>
          <input id="creation-duration" type="number" min="20" max="10000" step="10" inputMode="numeric"
            value={duration} disabled={busy} aria-describedby="creation-duration-help" aria-invalid={!durationValid}
            onChange={event => setDuration(event.currentTarget.value)} onBlur={commitDuration} />
          <p id="creation-duration-help">{t('creator.durationPolicy')}</p>
        </div>
        <div className="creator-loop-field">
          <label className="creator-checkbox" htmlFor="creation-loop-forever">
            <input id="creation-loop-forever" type="checkbox" checked={settings.loopForever} disabled={busy}
              onChange={event => session.updateSettings({ loopForever: event.currentTarget.checked })} />{t('creator.loop')}</label>
          {!settings.loopForever && <div className="creator-field"><label htmlFor="creation-play-count">{t('creator.playCount')}</label>
            <input id="creation-play-count" type="number" min="1" max="100" step="1" inputMode="numeric"
              value={playCount} disabled={busy} aria-describedby="creation-play-count-help" aria-invalid={!countValid}
              onChange={event => setPlayCount(event.currentTarget.value)} onBlur={commitPlayCount} />
            <p id="creation-play-count-help">{t('creator.playHelp')}</p>
          </div>}
        </div>
      </div>
      <p className="creator-note">{t('creator.canvasNote')}</p>
      <p className="creator-note" data-testid="creation-target-hint">{t(settings.target === 'gif' ? 'creator.colorNote' : settings.target === 'webp' ? 'creator.webpHint' : 'creator.apngHint')}</p>
    </section>

    <section className="creator-generation" aria-label={t('creator.generateGroup')}>
      <div className="creator-generation-actions">
        <IconButton icon="create" label={generateLabel} text={generateLabel} className="creator-primary" data-testid="creation-generate"
          aria-describedby={sources.length === 1 ? minimumSourceId : undefined}
          disabled={busy || sources.length < 2 || snapshot.totalSourceBytes > 16 * 1024 * 1024 || !durationValid || (!settings.loopForever && !countValid)} onClick={generate} />
        {generating && <IconButton icon="close" label={t('common.cancel')} text={t('common.cancel')} data-testid="creation-cancel"
          disabled={snapshot.status === 'cancelling'} onClick={() => { void session.cancel() }} />}
      </div>
      <p className="creator-status" role="status" data-testid="creation-status">{operationMessage(snapshot, t)}</p>
      {generating && <progress aria-label={t('creator.animationProgress')} data-testid="creation-progress"
        {...(actualProgress ? { value: actualProgress.value, max: actualProgress.max } : {})} />}
      {snapshot.error && <p className="creator-error" role="alert" data-testid="creation-error">{text(snapshot.errorMessage ?? { key: 'errors.creation' })}</p>}
    </section>

    {result && <section className="creator-result creator-card" aria-labelledby="creation-result-heading" data-testid="creation-result">
      <h2 id="creation-result-heading">{t('creator.generatedFormat', { format: creationFormats[result.format].label })}</h2>
      <dl className="creator-result-metadata">
        <div><dt>{t('result.dimensions')}</dt><dd>{result.metadata.width} × {result.metadata.height}</dd></div>
        <div><dt>{t('result.frames')}</dt><dd>{result.metadata.frameCount}</dd></div>
        <div><dt>{t('creator.frameDuration')}</dt><dd>{result.settings.frameDurationMs} ms</dd></div>
        <div><dt>{t('creator.totalDuration')}</dt><dd>{numberText(locale, result.metadata.durationMs)} ms</dd></div>
        <div><dt>{t('result.playback')}</dt><dd>{result.metadata.playCount === 0 ? t('creator.loop') : t(result.metadata.playCount === 1 ? 'result.onePlay' : 'result.plays', { count: result.metadata.playCount })}</dd></div>
        <div><dt>{t('creator.outputSize')}</dt><dd>{formatBytes(result.metadata.bytes, locale)}</dd></div>
      </dl>
      <div className="creator-result-actions">
        <IconButton ref={previewButtonRef} className="preview-return-trigger" icon="play" label={t('common.preview')} text={t('common.preview')} data-testid="creation-preview" disabled={busy} onClick={() => onPreview(result)} />
        <a className="creator-download" href={result.url} download={result.filename} data-testid="creation-download"
          onClick={event => { event.currentTarget.download = session.nextDownloadName() }}
          aria-label={t('common.download', { format: creationFormats[result.format].label })} title={t('common.download', { format: creationFormats[result.format].label })}><Icon name="download" /><span>{t('common.download', { format: creationFormats[result.format].label })}</span></a>
      </div>
      <p className="creator-note">{t('common.savedFiles')}</p>
    </section>}

    <CreationDiagnostics snapshot={snapshot} />
    <footer>{t('common.privacy')}</footer>
    {dragging && <div className="drop-overlay" aria-hidden="true">{t('creator.drop')}</div>}
  </main>
}
