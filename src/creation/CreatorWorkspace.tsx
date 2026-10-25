import { useEffect, useRef, useState } from 'react'
import CreateGif from '../pages/CreateGif/CreateGif'
import { Viewer } from '../pages/Viewer/Viewer'
import { CreationSession } from './creation-session'
import type { CreationResult } from './creation-types'
import { isCreationBusy } from './creation-types'
import type { VirtualFile } from '../input/virtual-file'

interface Preview { readonly result: CreationResult; readonly file: VirtualFile }

/** A creation lifetime survives result preview; its source list never enters MediaSession. */
export default function CreatorWorkspace({ onBack }: { onBack: () => void }) {
  const [session] = useState(() => new CreationSession())
  const [preview, setPreview] = useState<Preview>()
  const [closingPreview, setClosingPreview] = useState(false)
  const transition = useRef(Promise.resolve())
  const lifetime = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const owner = lifetime
    const id = ++owner.current
    return () => {
      mounted.current = false
      // StrictMode replays mount effects in development. Only the final unmount
      // owns disposal; a replayed mount increments the lifetime first.
      queueMicrotask(() => { if (owner.current === id) void session.dispose() })
    }
  }, [session])
  useEffect(() => {
    if (!closingPreview) return
    let active = true
    // Viewer publishes its decoder/renderer teardown gate during unmount.
    void transition.current.then(() => { if (active) setClosingPreview(false) })
    return () => { active = false }
  }, [closingPreview])

  if (preview) return <div className="media-app has-media"><Viewer file={preview.file} transition={transition} position={1} count={1}
    onPrevious={() => {}} onNext={() => {}} onRemove={() => { setClosingPreview(true); setPreview(undefined) }}
    onClose={() => { setClosingPreview(true); setPreview(undefined) }} /></div>
  if (closingPreview) return <p role="status">Closing preview…</p>
  return <CreateGif session={session} onBack={() => {
    void session.dispose().then(() => { if (mounted.current) onBack() })
  }} onPreview={result => {
    if (isCreationBusy(session.getSnapshot().status)) return
    const file: VirtualFile = { name: 'aniview-animation.gif', size: result.blob.size, mimeType: 'image/gif', source: 'file',
      read: (start, end) => result.blob.slice(start, end).arrayBuffer() }
    setPreview({ result, file })
  }} />
}
