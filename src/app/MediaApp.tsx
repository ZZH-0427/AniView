import { useEffect, useRef, useState } from 'react'
import { Home } from '../pages/Home/Home'
import { Viewer } from '../pages/Viewer/Viewer'
import { ImageInput } from '../components/ImageInput'
import { ArchiveInput } from '../components/ArchiveInput'
import { ArchiveSummary } from '../components/ArchiveSummary'
import { droppedFiles } from '../input/drag-drop'
import { currentSessionItem, nextFile, previousFile, removeCurrentFile } from '../media/media-session'
import { useMediaSource } from './use-media-source'
import { RuntimeDiagnosticsPanel } from '../components/RuntimeDiagnostics'

export function MediaApp() {
  const [dragging, setDragging] = useState(false)
  const transition = useRef(Promise.resolve())
  const { session, notice, archive, addFiles, openArchive, clear, changeSession } = useMediaSource(transition)
  const current = currentSessionItem(session)

  // File drops anywhere in the app must never replace the page with a local file.
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault(); depth++; setDragging(true)
    }
    const over = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = hasFiles(event) ? 'copy' : 'none'
    }
    const leave = () => { if (depth > 0 && --depth === 0) setDragging(false) }
    const drop = (event: DragEvent) => {
      event.preventDefault(); depth = 0; setDragging(false)
      if (event.dataTransfer) addFiles(droppedFiles(event.dataTransfer))
    }
    const reset = () => { depth = 0; setDragging(false) }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', reset)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', reset); window.removeEventListener('blur', reset)
    }
  }, [addFiles])

  return <div className={`media-app${current ? ' has-media' : ''}${archive ? ' has-archive' : ''}`}>
    {archive && <ArchiveSummary key={archive.status === 'open' ? archive.session.id : `${archive.status}:${archive.name}`}
      archive={archive} onClose={clear} count={session.items.length} />}
    {current ? <>
      <nav className="session-controls" aria-label="Image list">
        <details className="session-options"><summary>Image list options</summary>
        <div className="session-actions">
          <ImageInput append={!archive} onFiles={addFiles} />
          <ArchiveInput onOpen={openArchive} />
          <button onClick={clear}>Clear session</button>
        </div>
        </details>
      </nav>
      <Viewer key={current.id} file={current.file} transition={transition} onClose={clear}
        position={session.currentIndex + 1} count={session.items.length}
        onPrevious={() => changeSession(previousFile)} onNext={() => changeSession(nextFile)}
        onRemove={() => changeSession(removeCurrentFile)} />
    </> : <Home onOpen={addFiles} onArchive={openArchive} />}
    {notice && <p className="session-notice" role="status">{notice}</p>}
    <RuntimeDiagnosticsPanel />
    {dragging && <div className="drop-overlay" aria-hidden="true">Drop images here</div>}
  </div>
}
