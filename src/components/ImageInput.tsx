import { useRef } from 'react'
import { takeFileSelection } from '../input/file-input'
import type { VirtualFile } from '../input/virtual-file'

/** A user gesture opens the standard browser/system picker on every platform. */
export function ImageInput({ onFiles, append = false }: {
  onFiles: (files: readonly VirtualFile[]) => void
  append?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="image-input">
    <button type="button" className="image-picker" onClick={() => input.current?.click()}>
      <span className="mobile-label">选择图片</span>
      <span className="desktop-label">{append ? 'Choose more images' : 'Open Images'}</span>
    </button>
    <input ref={input} data-testid="image-input" type="file" accept="image/*" multiple hidden
      aria-label={append ? 'Choose more images' : 'Open Images'}
      onChange={event => onFiles(takeFileSelection(event.currentTarget))} />
  </div>
}
