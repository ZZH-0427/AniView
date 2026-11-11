import { useCallback, useEffect, useRef, useState } from 'react'
import type { VirtualFile } from '../input/virtual-file'
import type { ArchiveSourceSession, ArchiveFormat } from '../archive/archive-source-session'
import type { ArchiveOpeningSource } from '../archive/archive-source-factory'
import { appendFiles, clearMediaSession, createMediaSession, MAX_SESSION_ITEMS } from '../media/media-session'
import type { MediaSession } from '../media/media-session'
import { MediaError } from '../media/errors'
import type { MediaErrorCode } from '../media/errors'
import { countRuntimeEvent } from '../media/runtime-diagnostics'
import type { Message } from '../i18n/messages'
import { mediaMessage } from '../i18n/media-errors'

export type ArchiveState = { status: 'opening'; name: string }
  | { status: 'open'; name: string; session: ArchiveSourceSession; chunkMs: number }
  | { status: 'locked'; name: string; format: ArchiveFormat; prompt: boolean; busy: boolean; error?: MediaErrorCode }
  | { status: 'error'; name: string; message: string; errorMessage?: Message; canRetry?: boolean }
type SourceChoice = { kind: 'archive'; file: File }
  | { kind: 'loose'; files: readonly VirtualFile[] } | { kind: 'clear' }
type SourceRequest = SourceChoice & { id: number }

const addition = (session: MediaSession, files: readonly VirtualFile[]) => {
  const result = appendFiles(session, files)
  return { session: result.session, notice: result.truncated
    ? `Only the first ${result.added} files were added. The list holds up to ${MAX_SESSION_ITEMS} images.` : '',
    noticeMessage: result.truncated ? { key: 'session.truncated', params: { added: result.added, max: MAX_SESSION_ITEMS } } satisfies Message : undefined }
}
const requiresPassword = (cause: unknown) => cause instanceof MediaError
  && ['ARCHIVE_ENCRYPTED', 'ARCHIVE_WRONG_PASSWORD', 'ARCHIVE_PASSWORD_OR_CORRUPTED'].includes(cause.code)

/** UI source replacement waits for keyed Viewer cleanup before releasing ZIP ownership. */
export function useMediaSource(transition: { current: Promise<void> }) {
  const [state, setState] = useState<{ session: MediaSession; notice: string; noticeMessage?: Message | undefined }>(() => ({ session: createMediaSession(), notice: '' }))
  const [archive, setArchive] = useState<ArchiveState>()
  const [request, setRequest] = useState<SourceRequest>()
  const mode = useRef<'loose' | 'archive' | 'switching'>('loose')
  const activeArchive = useRef<ArchiveOpeningSource | undefined>(undefined)
  const pendingArchive = useRef<{ id: number; source: ArchiveOpeningSource; chunkMs: number } | undefined>(undefined)
  const generation = useRef(0)
  const tasks = useRef(Promise.resolve())
  const opening = useRef<AbortController | undefined>(undefined)
  const mounted = useRef(true)

  const replace = useCallback((next: SourceChoice) => {
    const id = ++generation.current
    mode.current = 'switching'
    opening.current?.abort()
    pendingArchive.current = undefined
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
    const abort = typeof AbortController === 'function' ? new AbortController() : undefined
    opening.current = abort
    const isCurrent = () => mounted.current && !abort?.signal.aborted && generation.current === request.id
    tasks.current = tasks.current.then(async () => {
      if (!abort) throw new MediaError('VIEWER_RUNTIME_UNAVAILABLE')
      await transition.current
      const old = activeArchive.current
      activeArchive.current = undefined
      await old?.close()
      if (!isCurrent()) return
      if (request.kind === 'archive') {
        const started = performance.now()
        const { createArchiveSource } = await import('../archive/archive-source-factory')
        if (!isCurrent()) return
        const source = await createArchiveSource(request.file, abort.signal)
        if (!isCurrent()) { await source.close(); return }
        const chunkMs = performance.now() - started
        activeArchive.current = source
        pendingArchive.current = { id: request.id, source, chunkMs }
        const session = await source.open({ signal: abort.signal })
        if (!isCurrent()) { await source.close(); return }
        pendingArchive.current = undefined
        mode.current = 'archive'
        setArchive({ status: 'open', name: session.name, session, chunkMs })
        setState(previous => addition(previous.session, session.files))
      } else {
        mode.current = 'loose'
        if (request.kind === 'loose') setState(previous => addition(previous.session, request.files))
      }
    }).catch((cause: unknown) => {
      if (!isCurrent()) return
      const pending = pendingArchive.current
      if (pending?.id === request.id && requiresPassword(cause)) {
        setArchive({ status: 'locked', name: pending.source.name, format: pending.source.format, prompt: true, busy: false,
          ...(cause instanceof MediaError && cause.code !== 'ARCHIVE_ENCRYPTED' ? { error: cause.code } : {}) })
        return
      }
      mode.current = 'loose'
      setArchive({ status: 'error', name: request.kind === 'archive' ? request.file.name : '',
        message: cause instanceof MediaError ? cause.message : 'This archive could not be opened. Please try another archive.',
        errorMessage: mediaMessage(cause, 'errors.archive'), canRetry: !!pending })
    })
    return () => abort?.abort()
  }, [request, transition])

  const retryOpening = useCallback((password?: string) => {
    const pending = pendingArchive.current
    if (!pending || pending.id !== generation.current) return
    opening.current?.abort()
    const abort = new AbortController(); opening.current = abort
    const isCurrent = () => mounted.current && !abort.signal.aborted && generation.current === pending.id
    setArchive(password === undefined ? { status: 'opening', name: pending.source.name }
      : { status: 'locked', name: pending.source.name, format: pending.source.format, prompt: true, busy: true })
    tasks.current = tasks.current.then(async () => {
      if (!isCurrent()) return
      const session = await pending.source.open({ signal: abort.signal, ...(password === undefined ? {} : { password }) })
      if (!isCurrent()) return
      pendingArchive.current = undefined
      mode.current = 'archive'
      setArchive({ status: 'open', name: session.name, session, chunkMs: pending.chunkMs })
      setState(previous => addition(previous.session, session.files))
    }).catch((cause: unknown) => {
      if (!isCurrent()) return
      if (requiresPassword(cause)) {
        setArchive({ status: 'locked', name: pending.source.name, format: pending.source.format, prompt: true, busy: false,
          ...(cause instanceof MediaError && cause.code !== 'ARCHIVE_ENCRYPTED' ? { error: cause.code } : {}) })
      } else setArchive({ status: 'error', name: pending.source.name, message: '', errorMessage: mediaMessage(cause, 'errors.archive'), canRetry: true })
    })
  }, [])
  const cancelArchiveAccess = useCallback(() => {
    const pending = pendingArchive.current
    if (!pending) return
    opening.current?.abort()
    setArchive({ status: 'locked', name: pending.source.name, format: pending.source.format, prompt: false, busy: false })
  }, [])
  const showArchivePrompt = useCallback(() => {
    const pending = pendingArchive.current
    if (pending) setArchive({ status: 'locked', name: pending.source.name, format: pending.source.format, prompt: true, busy: false })
  }, [])

  const shutdown = useCallback(() => {
    mounted.current = false; generation.current++; opening.current?.abort()
    void tasks.current.then(async () => {
      // Read the latest gate after the child Viewer has published its teardown.
      await transition.current
      const old = activeArchive.current; activeArchive.current = undefined
      await old?.close()
    }).catch(() => countRuntimeEvent('cleanupErrors'))
  }, [transition])
  useEffect(() => { mounted.current = true; return shutdown }, [shutdown])

  const addFiles = useCallback((files: readonly VirtualFile[]) => {
    if (!files.length) return // Cancellation never replaces or closes a source.
    // Failed preparation may still own a retryable source even though no entry
    // list was published. Gallery replacement must close that owner as well.
    if (mode.current !== 'loose' || activeArchive.current || pendingArchive.current) { replace({ kind: 'loose', files }); return }
    setArchive(undefined)
    setState(previous => addition(previous.session, files))
  }, [replace])
  const openArchive = useCallback((file: File) => replace({ kind: 'archive', file }), [replace])
  const clear = useCallback(() => replace({ kind: 'clear' }), [replace])
  const changeSession = (change: (session: MediaSession) => MediaSession) => {
    setState(previous => ({ ...previous, session: change(previous.session) }))
  }
  return { ...state, archive, addFiles, openArchive, clear, changeSession,
    unlockArchive: retryOpening, retryArchive: () => retryOpening(), cancelArchiveAccess, showArchivePrompt }
}
