import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ArchiveSourceSession } from '../archive/archive-source-session'
import { MediaError } from '../media/errors'
import type { MediaErrorCode } from '../media/errors'
import { useI18n } from '../i18n'
import { mediaMessage } from '../i18n/media-errors'
import { FileNavigation } from '../pages/Viewer/ViewerControls'
import { ArchivePasswordPrompt } from './ArchivePasswordPrompt'
import './archive-password.css'

type AccessState = { kind: 'checking' | 'ready' | 'locked' | 'prompt' | 'error' | 'cancelled'; busy?: boolean; error?: MediaErrorCode }
const retryable = (code: MediaErrorCode) => ['ARCHIVE_ENCRYPTED', 'ARCHIVE_WRONG_PASSWORD', 'ARCHIVE_PASSWORD_OR_CORRUPTED'].includes(code)

/** UI selection gate only. Session owns credentials, authentication and materialization. */
export default function ArchiveEntryAccess({ session, entryId, transition, position, count, onPrevious, onNext, children }: {
  session: ArchiveSourceSession; entryId: number; transition: { current: Promise<void> }
  position: number; count: number; onPrevious: () => void; onNext: () => void; children: ReactNode
}) {
  const { t, text } = useI18n(), [state, setState] = useState<AccessState>({ kind: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const selection = useRef(0), current = useRef<AbortController | undefined>(undefined)
  const task = useRef<Promise<void>>(Promise.resolve()), unlock = useRef<HTMLButtonElement>(null)
  const submitting = useRef(false)
  useEffect(() => {
    const owner = selection, operation = current, cleanupTask = task
    const token = ++owner.current, abort = new AbortController(); operation.current = abort
    const previous = transition.current
    task.current = (async () => {
      await previous
      if (abort.signal.aborted || token !== selection.current) return
      try {
        await session.ensureEntryAvailable(entryId, { signal: abort.signal })
        if (!abort.signal.aborted && token === selection.current) setState({ kind: 'ready' })
      } catch (cause) {
        if (abort.signal.aborted || token !== selection.current) return
        const code = cause instanceof MediaError ? cause.code : 'ARCHIVE_CORRUPTED'
        setState(retryable(code) ? { kind: 'prompt', ...(code === 'ARCHIVE_ENCRYPTED' ? {} : { error: code }) } : { kind: 'error', error: code })
      }
    })()
    return () => {
      ++owner.current; operation.current?.abort()
      // Publish pending access cleanup before the next selected entry/ZIP begins.
      transition.current = Promise.all([transition.current, cleanupTask.current, session.releaseEntry(entryId)]).then(() => {})
    }
  }, [session, entryId, transition, attempt])
  useEffect(() => { if (state.kind === 'locked') unlock.current?.focus() }, [state.kind])
  const submit = (password: string) => {
    if (submitting.current) return
    submitting.current = true
    current.current?.abort()
    const token = ++selection.current, abort = new AbortController(); current.current = abort
    setState({ kind: 'prompt', busy: true })
    task.current = (async () => {
      try {
        await session.unlockEntry(entryId, password, { signal: abort.signal })
        if (!abort.signal.aborted && token === selection.current) setState({ kind: 'ready' })
      } catch (cause) {
        if (abort.signal.aborted || token !== selection.current) return
        const code = cause instanceof MediaError ? cause.code : 'ARCHIVE_CORRUPTED'
        setState({ kind: retryable(code) ? 'prompt' : 'error', error: code })
      } finally { if (token === selection.current) submitting.current = false }
    })()
  }
  const cancel = () => {
    submitting.current = false
    ++selection.current; current.current?.abort()
    const pending = task.current
    task.current = Promise.all([pending, session.releaseEntry(entryId)]).then(() => {})
    setState({ kind: state.kind === 'prompt' ? 'locked' : 'cancelled' })
  }
  const retry = () => { setState({ kind: 'checking' }); setAttempt(previous => previous + 1) }
  if (state.kind === 'ready') return children
  return <section className="archive-entry-access" data-testid="archive-entry-access" data-state={state.kind}>
    <FileNavigation position={position} count={count} onPrevious={onPrevious} onNext={onNext} />
    {state.kind === 'checking' && <><p role="status">{t('zip.checkingAccess')}</p>
      {session.format !== 'zip' && <button onClick={cancel} data-testid="archive-extraction-cancel">{t('common.cancel')}</button>}</>}
    {state.kind === 'prompt' && <ArchivePasswordPrompt format={session.format} busy={!!state.busy} error={state.error} onUnlock={submit} onCancel={cancel} />}
    {state.kind === 'locked' && <div className="archive-password"><p>{t('zip.locked')}</p>
      <button ref={unlock} data-testid="archive-password-retry" onClick={() => setState({ kind: 'prompt' })}>{t('zip.unlock')}</button></div>}
    {state.kind === 'cancelled' && <div className="archive-password"><p role="status">{t('archive.cancelled')}</p>
      <button data-testid="archive-extraction-retry" onClick={retry}>{t('archive.retry')}</button></div>}
    {state.kind === 'error' && <><p role="alert" data-testid="archive-entry-error">{text(mediaMessage(new MediaError(state.error ?? 'ARCHIVE_CORRUPTED')))}</p>
      {session.format !== 'zip' && <button data-testid="archive-extraction-retry" onClick={retry}>{t('archive.retry')}</button>}</>}
  </section>
}
