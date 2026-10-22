import { lazy, Suspense } from 'react'
import { Home } from '../pages/Home/Home'

const WebPSpikePage = lazy(() => import('../spikes/webp/WebPSpikePage'))

export function App() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('spike') === 'webp') {
    return <Suspense fallback={<p>Loading engineering harness…</p>}><WebPSpikePage /></Suspense>
  }
  return <Home />
}
