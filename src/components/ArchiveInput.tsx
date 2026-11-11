import { useRef } from 'react'
import { useI18n } from '../i18n'

/** Archive picker hints never decide which backend reads the selected bytes. */
export function ArchiveInput({ onOpen }: { onOpen: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  return <div className="archive-input">
    <button type="button" onClick={() => input.current?.click()}>
      {t('archive.openAction')}
    </button>
    <input ref={input} data-testid="archive-input" type="file" hidden
      accept=".zip,.rar,.7z,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/x-7z-compressed" aria-label={t('archive.openAction')}
      onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) onOpen(file)
      }} />
  </div>
}
