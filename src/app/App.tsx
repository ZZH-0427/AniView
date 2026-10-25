import { lazy, Suspense, useState } from 'react'
import { MediaApp } from './MediaApp'

const WebPSpikePage = lazy(() => import('../spikes/webp/WebPSpikePage'))
const CreatorWorkspace = lazy(() => import('../creation/CreatorWorkspace'))

export function App() {
  const [creating, setCreating] = useState(false)
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('spike') === 'webp') {
    return <Suspense fallback={<p>Loading engineering harness…</p>}><WebPSpikePage /></Suspense>
  }
  if (creating) return <Suspense fallback={<p role="status">Opening GIF creator…</p>}>
    <CreatorWorkspace onBack={() => setCreating(false)} />
  </Suspense>
  return <MediaApp onCreate={() => setCreating(true)} />
}
