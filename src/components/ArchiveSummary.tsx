import { useEffect, useState } from 'react'
import type { ArchiveState } from '../app/use-media-source'

export function ArchiveSummary({ archive, onClose, count }: {
  archive: ArchiveState; onClose: () => void; count: number
}) {
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
  const [metrics, setMetrics] = useState(() => archive.status === 'open' ? archive.session.metrics : null)
  useEffect(() => {
    if (!debug || archive.status !== 'open') return
    const timer = setInterval(() => setMetrics({ ...archive.session.metrics }), 100)
    return () => clearInterval(timer)
  }, [archive, debug])
  return <section className="archive-summary" aria-label="ZIP archive">
    <h2 data-testid="archive-name">{archive.name}</h2>
    <p data-testid="archive-status" role="status">{archive.status}</p>
    {archive.status === 'opening' && <p>Reading ZIP contents…</p>}
    {archive.status === 'error' && <p role="alert">{archive.message}</p>}
    {archive.status === 'open' && <>
      <p>{archive.session.entries.length} entries · {count} images in the viewing list</p>
      {!count && <p>{archive.session.files.length ? 'No images remain in the viewing list.' : 'No viewable media found in this ZIP.'}</p>}
      {debug && <output data-testid="archive-metrics">{JSON.stringify({ ...metrics, chunkMs: archive.chunkMs })}</output>}
    </>}
    <button onClick={onClose}>Close archive</button>
  </section>
}
