import { useRef } from 'react'

/** ZIP has a separate intent and picker hint from image selection. */
export function ArchiveInput({ onOpen }: { onOpen: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="archive-input">
    <button type="button" onClick={() => input.current?.click()}>
      <span className="mobile-label">打开 ZIP 压缩包</span><span className="desktop-label">Open ZIP</span>
    </button>
    <input ref={input} data-testid="archive-input" type="file" hidden
      accept=".zip,application/zip,application/x-zip-compressed" aria-label="Open ZIP"
      onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) onOpen(file)
      }} />
  </div>
}
