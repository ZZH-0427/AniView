import { useRef } from 'react'
import { takeFileSelection } from '../input/file-input'
import type { VirtualFile } from '../input/virtual-file'
import { useI18n } from '../i18n'

/** A user gesture opens the standard browser/system picker on every platform. */
export function ImageInput({ onFiles, append = false }: {
  onFiles: (files: readonly VirtualFile[]) => void
  append?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  return <div className="image-input">
    <button type="button" className="image-picker" onClick={() => input.current?.click()}>
      <span className="mobile-label">{t('home.chooseImages')}</span>
      <span className="desktop-label">{t(append ? 'home.moreImages' : 'home.openImages')}</span>
    </button>
    <input ref={input} data-testid="image-input" type="file" accept="image/*" multiple hidden
      aria-label={t(append ? 'home.moreImages' : 'home.openImages')}
      onChange={event => onFiles(takeFileSelection(event.currentTarget))} />
  </div>
}
