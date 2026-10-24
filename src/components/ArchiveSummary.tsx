import { useEffect, useState } from 'react'
import type { ArchiveState } from '../app/use-media-source'
import { DiagnosticsGroup, DiagnosticsPanel, RawDiagnostics } from './DiagnosticsPanel'

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
      {debug && <DiagnosticsPanel title="Archive diagnostics">
        <DiagnosticsGroup title="Archive" values={[
          { label: 'Entries / media', value: `${metrics?.entryCount ?? 0} / ${metrics?.mediaCount ?? 0}` },
          { label: 'Declared bytes', value: metrics?.totalDeclaredBytes ?? 0 },
          { label: 'Extractions', value: metrics?.extractions ?? 0 },
          { label: 'Current / peak bytes', value: `${metrics?.currentExtractedBytes ?? 0} / ${metrics?.peakExtractedBytes ?? 0}` },
          { label: 'Chunk / metadata / extraction (ms)', value: `${archive.chunkMs.toFixed(1)} / ${(metrics?.metadataMs ?? 0).toFixed(1)} / ${(metrics?.extractMs ?? 0).toFixed(1)}` },
        ]} />
        <RawDiagnostics items={[{ testId: 'archive-metrics', value: { ...metrics, chunkMs: archive.chunkMs } }]} />
      </DiagnosticsPanel>}
    </>}
    <button onClick={onClose}>Close archive</button>
  </section>
}
