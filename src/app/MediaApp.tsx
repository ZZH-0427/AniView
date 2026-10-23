import { useState } from 'react'
import { Home } from '../pages/Home/Home'
import { Viewer } from '../pages/Viewer/Viewer'

export function MediaApp() {
  const [selection, setSelection] = useState<{ file: File; id: number } | undefined>(undefined)
  return selection ? <Viewer key={selection.id} file={selection.file} onClose={() => setSelection(undefined)} />
    : <Home onOpen={(file) => setSelection({ file, id: performance.now() })} />
}
