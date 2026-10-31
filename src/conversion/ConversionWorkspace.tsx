import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { VirtualFile } from '../input/virtual-file'
import { Viewer } from '../pages/Viewer/Viewer'
import { ConversionSession, resultVirtualFile } from './conversion-session'
import ConvertAnimation from '../pages/ConvertAnimation/ConvertAnimation'

/** MediaApp retains the borrowed source and archive; only the result belongs here. */
export default function ConversionWorkspace({ file, transition, onBack }: {
  file: VirtualFile; transition: { current: Promise<void> }; onBack: () => void
}) {
  const [session] = useState(() => new ConversionSession(file))
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const [preview, setPreview] = useState<VirtualFile>()
  const [closingPreview, setClosingPreview] = useState(false)
  const lifetime = useRef(0), mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const owner = lifetime, id = ++owner.current
    let active = true
    void transition.current.then(() => { if (active) void session.prepare() })
    return () => {
      active = false; mounted.current = false
      queueMicrotask(() => { if (owner.current === id) void session.dispose() })
    }
  }, [session, transition])
  useEffect(() => {
    if (!closingPreview) return
    let active = true
    void transition.current.then(() => { if (active) setClosingPreview(false) })
    return () => { active = false }
  }, [closingPreview, transition])
  const closePreview = () => { setClosingPreview(true); setPreview(undefined) }
  if (preview) return <div className="media-app has-media"><Viewer file={preview} transition={transition} position={1} count={1}
    onPrevious={() => {}} onNext={() => {}} onRemove={closePreview} onClose={closePreview} /></div>
  if (closingPreview) return <p role="status">Closing preview…</p>
  return <ConvertAnimation session={session} snapshot={snapshot} onBack={() => {
    void session.dispose().then(() => { if (mounted.current) onBack() })
  }} onPreview={() => { if (snapshot.result) setPreview(resultVirtualFile(snapshot.result)) }} />
}
