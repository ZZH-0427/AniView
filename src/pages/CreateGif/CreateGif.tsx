import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from '../../components/Icon'
import { IconButton } from '../../components/IconButton'
import type { CreationSession } from '../../creation/creation-session'
import type { CreationResult, CreationSnapshot } from '../../creation/creation-types'
import { isCreationBusy } from '../../creation/creation-types'
import { droppedFiles } from '../../input/drag-drop'
import { takeFileSelection } from '../../input/file-input'
import { CreationDiagnostics } from './CreationDiagnostics'
import './create-gif.css'

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B`
  : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(2)} MiB`
const validDuration = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 20 && Number(value) <= 10000
const validPlayCount = (value: string) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100

function operationMessage(snapshot: CreationSnapshot) {
  const progress = snapshot.progress
  switch (snapshot.status) {
    case 'adding': return 'Checking source images…'
    case 'preparing': return progress ? `Preparing images ${progress.currentFrame} / ${progress.totalFrames}…` : 'Preparing images…'
    case 'encoding': return `Encoding ${Math.min((progress?.currentFrame ?? 0) + 1, progress?.totalFrames ?? snapshot.sources.length)} / ${progress?.totalFrames ?? snapshot.sources.length}`
    case 'finalizing': return 'Finalizing GIF…'
    case 'cancelling': return 'Cancelling…'
    case 'cancelled': return 'Generation cancelled'
    case 'success': return 'GIF generated'
    default: return ''
  }
}

/** Creation owns handles/settings only. Preview delegates to the existing Viewer. */
export default function CreateGif({ session, onBack, onPreview }: {
  session: CreationSession
  onBack: () => void
  onPreview: (result: CreationResult) => void
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const { sources, settings, result } = snapshot
  const input = useRef<HTMLInputElement>(null)
  const [duration, setDuration] = useState(String(settings.frameDurationMs))
  const [playCount, setPlayCount] = useState(String(settings.playCount))
  const [dragging, setDragging] = useState(false)
  const busy = isCreationBusy(snapshot.status)
  const generating = ['preparing', 'encoding', 'finalizing', 'cancelling'].includes(snapshot.status)
  const durationValid = validDuration(duration), countValid = validPlayCount(playCount)
  const progress = snapshot.progress
  const actualProgress = progress?.completedWork !== undefined && progress.totalWork !== undefined && progress.totalWork > 0
    ? { value: progress.completedWork, max: progress.totalWork } : undefined

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
      <IconButton icon="previous-file" label="Back" data-testid="creation-back" onClick={onBack} />
      <div><p className="creator-eyebrow">AniView</p><h1>Create GIF</h1></div>
    </header>

    <section className="creator-sources creator-card" aria-labelledby="creation-sources-heading">
      <div className="creator-section-heading">
        <h2 id="creation-sources-heading">Source images</h2>
        <div className="creator-list-actions">
          <IconButton icon="add" label={sources.length ? 'Add images' : 'Choose Images'} disabled={busy}
            {...(sources.length ? {} : { text: 'Choose Images' })} onClick={() => input.current?.click()} />
          {sources.length > 0 && <details className="creator-more">
            <summary aria-label="Source list options" title="Source list options"><Icon name="more" /></summary>
            <div className="creator-more-actions"><IconButton icon="remove" label="Clear all" text="Clear all"
              data-testid="creation-clear" disabled={busy} onClick={() => { void session.clear() }} /></div>
          </details>}
        </div>
      </div>
      <input ref={input} className="visually-hidden" type="file" accept="image/*" multiple disabled={busy}
        aria-label="Choose source images" data-testid="creation-input" tabIndex={-1}
        onChange={event => { const files = takeFileSelection(event.currentTarget); if (files.length) void session.add(files) }} />
      <div className="creator-budget" aria-label="Creation source limits">
        <p>{sources.length} / 200 images</p><p>{(snapshot.totalSourceBytes / 1024 / 1024).toFixed(2)} MiB / 16 MiB</p>
      </div>
      {sources.length ? <ol className="creator-source-list" data-testid="creation-source-list" aria-label="Animation source order">
        {sources.map((source, index) => <li key={source.id} className="creator-source-row" data-testid="creation-source-row"
          data-source-id={source.id} aria-label={`Image ${index + 1}: ${source.file.name}`}>
          <span className="creator-position" aria-hidden="true">{index + 1}</span>
          <div className="creator-source-info"><p className="creator-filename" title={source.file.name}>{source.file.name}</p>
            <p className="creator-source-meta">{source.format.toUpperCase()} · {formatBytes(source.file.size)}</p></div>
          <div className="creator-row-actions">
            <IconButton icon="arrow-up" label="Move up" data-action="up" disabled={busy || index === 0} onClick={() => session.move(source.id, 'up')} />
            <IconButton icon="arrow-down" label="Move down" data-action="down" disabled={busy || index === sources.length - 1} onClick={() => session.move(source.id, 'down')} />
            <IconButton icon="close" label="Remove" data-action="remove" disabled={busy} onClick={() => session.remove(source.id)} />
          </div>
        </li>)}
      </ol> : <div className="creator-empty">
        <Icon name="create" /><p>Create an animated GIF from static images.</p><p>JPEG · PNG · WebP</p>
      </div>}
      <p className="creator-drop-hint">Drop image files here to append them.</p>
      {snapshot.notice && <p className="creator-notice" role="status" data-testid="creation-notice">{snapshot.notice}</p>}
    </section>

    <section className="creator-settings creator-card" aria-labelledby="creation-settings-heading">
      <h2 id="creation-settings-heading">Animation</h2>
      <div className="creator-fields">
        <div className="creator-field"><label htmlFor="creation-duration">Frame duration (ms)</label>
          <input id="creation-duration" type="number" min="20" max="10000" step="10" inputMode="numeric"
            value={duration} disabled={busy} aria-describedby="creation-duration-help" aria-invalid={!durationValid}
            onChange={event => setDuration(event.currentTarget.value)} onBlur={commitDuration} />
          <p id="creation-duration-help">20–10000 ms. GIF timing uses 10 ms units.</p>
        </div>
        <div className="creator-loop-field">
          <label className="creator-checkbox" htmlFor="creation-loop-forever">
            <input id="creation-loop-forever" type="checkbox" checked={settings.loopForever} disabled={busy}
              onChange={event => session.updateSettings({ loopForever: event.currentTarget.checked })} />Loop forever
          </label>
          {!settings.loopForever && <div className="creator-field"><label htmlFor="creation-play-count">Play count</label>
            <input id="creation-play-count" type="number" min="1" max="100" step="1" inputMode="numeric"
              value={playCount} disabled={busy} aria-describedby="creation-play-count-help" aria-invalid={!countValid}
              onChange={event => setPlayCount(event.currentTarget.value)} onBlur={commitPlayCount} />
            <p id="creation-play-count-help">Total complete plays, from 1 to 100.</p>
          </div>}
        </div>
      </div>
      <p className="creator-note">Images keep their original pixel size and are centered on a transparent canvas sized to the largest image.</p>
      <p className="creator-note">GIF is limited to 256 colors and 1-bit transparency. Gradients and semi-transparent edges may show visible banding or hard edges.</p>
    </section>

    <section className="creator-generation" aria-label="Generate animation">
      <div className="creator-generation-actions">
        <IconButton icon="create" label="Generate GIF" text="Generate GIF" className="creator-primary" data-testid="creation-generate"
          disabled={busy || sources.length < 2 || snapshot.totalSourceBytes > 16 * 1024 * 1024 || !durationValid || (!settings.loopForever && !countValid)} onClick={generate} />
        {generating && <IconButton icon="close" label="Cancel" text="Cancel" data-testid="creation-cancel"
          disabled={snapshot.status === 'cancelling'} onClick={() => { void session.cancel() }} />}
      </div>
      <p className="creator-status" role="status" data-testid="creation-status">{operationMessage(snapshot)}</p>
      {generating && <progress aria-label="GIF generation progress" data-testid="creation-progress"
        {...(actualProgress ? { value: actualProgress.value, max: actualProgress.max } : {})} />}
      {snapshot.error && <p className="creator-error" role="alert" data-testid="creation-error">{snapshot.error}</p>}
    </section>

    {result && <section className="creator-result creator-card" aria-labelledby="creation-result-heading" data-testid="creation-result">
      <h2 id="creation-result-heading">Generated GIF</h2>
      <dl className="creator-result-metadata">
        <div><dt>Dimensions</dt><dd>{result.metadata.width} × {result.metadata.height}</dd></div>
        <div><dt>Frames</dt><dd>{result.metadata.frameCount}</dd></div>
        <div><dt>Frame duration</dt><dd>{result.metadata.frameDurationMs} ms</dd></div>
        <div><dt>Playback</dt><dd>{result.metadata.loopForever ? 'Loop forever' : `${result.metadata.playCount} ${result.metadata.playCount === 1 ? 'play' : 'plays'}`}</dd></div>
        <div><dt>GIF size</dt><dd>{formatBytes(result.metadata.bytes)}</dd></div>
      </dl>
      <div className="creator-result-actions">
        <IconButton icon="play" label="Preview" text="Preview" data-testid="creation-preview" disabled={busy} onClick={() => onPreview(result)} />
        <a className="creator-download" href={result.url} download="aniview-animation.gif" data-testid="creation-download"
          aria-label="Download GIF" title="Download GIF"><Icon name="download" /><span>Download GIF</span></a>
      </div>
    </section>}

    <CreationDiagnostics snapshot={snapshot} />
    <footer>Files are processed locally in your browser.</footer>
    {dragging && <div className="drop-overlay" aria-hidden="true">Drop images to add frames</div>}
  </main>
}
