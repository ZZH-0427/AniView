import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { mediaMessage } from '../i18n/media-errors'
import { MediaError } from '../media/errors'
import type { MediaErrorCode } from '../media/errors'
import type { ArchiveFormat } from '../archive/archive-source-session'

/** Only this mounted panel holds editable input. Never pass its state to diagnostics or storage. */
export function ArchivePasswordPrompt({ busy, error, onUnlock, onCancel, scope = 'entry', format = 'zip' }: {
  busy: boolean; error?: MediaErrorCode | undefined
  scope?: 'archive' | 'entry'; format?: ArchiveFormat
  onUnlock: (password: string) => void; onCancel: () => void
}) {
  const { t, text } = useI18n(), id = useId(), input = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState(''), [shown, setShown] = useState(false)
  useEffect(() => { if (!busy) input.current?.focus() }, [busy])
  const cancel = () => { setPassword(''); setShown(false); onCancel() }
  return <form className="archive-password" data-testid="archive-password-prompt" autoComplete="off"
    aria-labelledby={id + '-heading'} onSubmit={event => { event.preventDefault(); if (!busy && password) onUnlock(password) }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() } }}>
    <h2 id={id + '-heading'}>{t(scope === 'archive' ? 'archive.passwordRequired' : 'zip.passwordRequired')}</h2>
    <p id={id + '-help'}>{t(scope === 'archive' ? 'archive.passwordHelp' : format === 'zip' ? 'zip.passwordHelp' : 'archive.entryPasswordHelp')}</p>
    <label htmlFor={id}>{t('zip.password')}</label>
    <input ref={input} id={id} name="archive-entry-secret" type={shown ? 'text' : 'password'} value={password}
      autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} data-testid="archive-password-input"
      aria-invalid={!!error} aria-describedby={id + '-help' + (error ? ' ' + id + '-error' : '')}
      onChange={event => setPassword(event.currentTarget.value)} />
    <label className="archive-password-show"><input type="checkbox" checked={shown} disabled={busy}
      data-testid="archive-password-show" onChange={event => setShown(event.currentTarget.checked)} />
      {t(shown ? 'zip.hidePassword' : 'zip.showPassword')}</label>
    {error && <p role="alert" id={id + '-error'} data-testid="archive-password-error">{format !== 'zip' && error === 'ARCHIVE_PASSWORD_OR_CORRUPTED'
      ? t('errors.media.extendedPasswordOrCorrupt') : text(mediaMessage(new MediaError(error)))}</p>}
    <div className="archive-password-actions">
      <button type="button" onClick={cancel} data-testid="archive-password-cancel">{t('common.cancel')}</button>
      <button type="submit" disabled={busy || !password} data-testid="archive-password-unlock">{t('zip.unlock')}</button>
    </div>
    {busy && <p role="status" data-testid="archive-password-busy">{t(scope === 'archive' ? 'archive.openingPassword' : 'zip.unlocking')}</p>}
  </form>
}
