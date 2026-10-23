import { useCallback, useEffect, useRef, useState } from 'react'
import type { VirtualFile } from '../input/virtual-file'
import type { ArchiveSession } from '../archive/archive-session'
import { appendFiles, clearMediaSession, createMediaSession, MAX_SESSION_ITEMS } from '../media/media-session'
import type { MediaSession } from '../media/media-session'
import { MediaError } from '../media/errors'

export type ArchiveState = { status: 'opening'; name: string }
  | { status: 'open'; name: string; session: ArchiveSession; chunkMs: number }
  | { status: 'error'; name: string; message: string }
type SourceChoice = { kind: 'archive'; file: File }
  | { kind: 'loose'; files: readonly VirtualFile[] } | { kind: 'clear' }
type SourceRequest = SourceChoice & { id: number }

const addition = (session: MediaSession, files: readonly VirtualFile[]) => {
  const result = appendFiles(session, files)
  return { session: result.session, notice: result.truncated
    ? `Only the first ${result.added} files were added. The list holds up to ${MAX_SESSION_ITEMS} images.` : '' }
}

/** UI source replacement waits for keyed Viewer cleanup before releasing ZIP ownership. */
export function useMediaSource(transition: { current: Promise<void> }) {
  const [state, setState] = useState(() => ({ session: createMediaSession(), notice: '' }))
  const [archive, setArchive] = useState<ArchiveState>()
  const [request, setRequest] = useState<SourceRequest>()
  const mode = useRef<'loose' | 'archive' | 'switching'>('loose')
  const activeArchive = useRef<ArchiveSession | undefined>(undefined)
  const generation = useRef(0)
  const tasks = useRef(Promise.resolve())
  const opening = useRef<AbortController | undefined>(undefined)
  const mounted = useRef(true)

  const replace = useCallback((next: SourceChoice) => {
    const id = ++generation.current
    mode.current = 'switching'
    opening.current?.abort()
    setState(previous => ({ session: clearMediaSession(previous.session), notice: '' }))
    if (next.kind === 'archive') {
      setArchive({ status: 'opening', name: next.file.name })
      setRequest({ id, kind: 'archive', file: next.file })
    } else if (next.kind === 'loose') {
      setArchive(undefined); setRequest({ id, kind: 'loose', files: next.files })
    } else { setArchive(undefined); setRequest({ id, kind: 'clear' }) }
  }, [])

  // Runs after the previous Viewer has unmounted and published its cleanup gate.
  useEffect(() => {
    if (!request) return
    const abort = new AbortController()
    opening.current = abort
    const isCurrent = () => mounted.current && !abort.signal.aborted && generation.current === request.id
    tasks.current = tasks.current.then(async () => {
      await transition.current
      const old = activeArchive.current
      activeArchive.current = undefined
      await old?.close()
      if (!isCurrent()) return
      if (request.kind === 'archive') {
        const started = performance.now()
        const { ArchiveSession } = await import('../archive/archive-session')
        const chunkMs = performance.now() - started
        if (!isCurrent()) return
        const session = await ArchiveSession.open(request.file, { signal: abort.signal })
        if (!isCurrent()) { await session.close(); return }
        activeArchive.current = session
        mode.current = 'archive'
        setArchive({ status: 'open', name: session.name, session, chunkMs })
        setState(previous => addition(previous.session, session.files))
      } else {
        mode.current = 'loose'
        if (request.kind === 'loose') setState(previous => addition(previous.session, request.files))
      }
    }).catch((cause: unknown) => {
      if (!isCurrent()) return
      mode.current = 'loose'
      setArchive({ status: 'error', name: request.kind === 'archive' ? request.file.name : '',
        message: cause instanceof MediaError ? cause.message : 'This archive could not be opened. Please try another ZIP.' })
    })
    return () => abort.abort()
  }, [request, transition])

  const shutdown = useCallback(() => {
    mounted.current = false; generation.current++; opening.current?.abort()
    void tasks.current.then(async () => {
      // Read the latest gate after the child Viewer has published its teardown.
      await transition.current
      const old = activeArchive.current; activeArchive.current = undefined
      await old?.close()
    }).catch(() => {})
  }, [transition])
  useEffect(() => { mounted.current = true; return shutdown }, [shutdown])

  const addFiles = useCallback((files: readonly VirtualFile[]) => {
    if (!files.length) return // Cancellation never replaces or closes a source.
    if (mode.current !== 'loose') { replace({ kind: 'loose', files }); return }
    setArchive(undefined)
    setState(previous => addition(previous.session, files))
  }, [replace])
  const openArchive = useCallback((file: File) => replace({ kind: 'archive', file }), [replace])
  const clear = useCallback(() => replace({ kind: 'clear' }), [replace])
  const changeSession = (change: (session: MediaSession) => MediaSession) => {
    setState(previous => ({ ...previous, session: change(previous.session) }))
  }
  return { ...state, archive, addFiles, openArchive, clear, changeSession }
}
