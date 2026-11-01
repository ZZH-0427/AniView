import { useRef } from 'react'
import { useI18n } from '../i18n'

/** ZIP has a separate intent and picker hint from image selection. */
export function ArchiveInput({ onOpen }: { onOpen: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  return <div className="archive-input">
    <button type="button" onClick={() => input.current?.click()}>
      <span className="mobile-label">{t('home.openZipMobile')}</span><span className="desktop-label">{t('home.openZip')}</span>
    </button>
    <input ref={input} data-testid="archive-input" type="file" hidden
      accept=".zip,application/zip,application/x-zip-compressed" aria-label={t('home.openZip')}
      onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) onOpen(file)
      }} />
  </div>
}
