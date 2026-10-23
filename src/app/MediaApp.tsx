import { useCallback, useEffect, useRef, useState } from 'react'
import { Home } from '../pages/Home/Home'
import { Viewer } from '../pages/Viewer/Viewer'
import { ImageInput } from '../components/ImageInput'
import { droppedFiles } from '../input/drag-drop'
import type { VirtualFile } from '../input/virtual-file'
import { appendFiles, clearMediaSession, createMediaSession, currentSessionItem, nextFile,
  previousFile, removeCurrentFile, MAX_SESSION_ITEMS } from '../media/media-session'
import type { MediaSession } from '../media/media-session'

export function MediaApp() {
  const [state, setState] = useState(() => ({ session: createMediaSession(), notice: '' }))
  const { session, notice } = state
  const [dragging, setDragging] = useState(false)
  const transition = useRef(Promise.resolve())
  const current = currentSessionItem(session)
  const addFiles = useCallback((files: readonly VirtualFile[]) => {
    if (!files.length) return // Cancelling the picker preserves the current session.
    setState(previous => {
      const result = appendFiles(previous.session, files)
      return { session: result.session, notice: result.truncated
        ? `Only the first ${result.added} files were added. The list holds up to ${MAX_SESSION_ITEMS} images.` : '' }
    })
  }, [])

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

  function changeSession(change: (session: MediaSession) => MediaSession) {
    setState(previous => ({ ...previous, session: change(previous.session) }))
  }
  const clear = () => setState(previous => ({ session: clearMediaSession(previous.session), notice: '' }))

  return <>
    {current ? <>
      <nav className="session-controls" aria-label="Image list">
        <p data-testid="session-position" aria-live="polite">{session.currentIndex + 1} / {session.items.length}</p>
        <div className="session-actions">
          <button disabled={session.currentIndex === 0} onClick={() => changeSession(previousFile)}>Previous</button>
          <button disabled={session.currentIndex === session.items.length - 1} onClick={() => changeSession(nextFile)}>Next</button>
          <button onClick={() => changeSession(removeCurrentFile)}>Remove from list</button>
          <ImageInput append onFiles={addFiles} />
          <button onClick={clear}>Clear session</button>
        </div>
      </nav>
      <Viewer key={current.id} file={current.file} transition={transition} onClose={clear} />
    </> : <Home onOpen={addFiles} />}
    {notice && <p className="session-notice" role="status">{notice}</p>}
    {dragging && <div className="drop-overlay" aria-hidden="true">Drop images here</div>}
  </>
}
