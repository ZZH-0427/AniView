import type { ReactNode } from 'react'
import type { ViewportSnapshot } from '../renderer/viewport-controller'
import './DiagnosticsPanel.css'

export function DiagnosticsPanel({ title, children }: { title: string; children: ReactNode }) {
  const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1'
  if (!debug) return null
  return <details className="diagnostics-panel" data-testid="diagnostics-panel">
    <summary>{title}</summary>
    <div className="diagnostics-panel-content">{children}</div>
  </details>
}

export function DiagnosticsGroup({ title, values }: {
  title: string; values: readonly { label: string; value: ReactNode }[]
}) {
  return <section className="diagnostics-group" aria-label={title}>
    <h3>{title}</h3>
    <dl>{values.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>
}

export function RawDiagnostics({ items }: { items: readonly { testId: string; value: unknown }[] }) {
  return <details className="diagnostics-raw" data-testid="diagnostics-raw">
    <summary>Raw JSON</summary>
    {items.map(({ testId, value }) => <output key={testId} data-testid={testId}>{JSON.stringify(value)}</output>)}
  </details>
}

interface ViewerDiagnosticsProps {
  metrics: { cacheBytes: number; cachedFrames: number; peakBytes: number; peakFrames: number; maxBytes: number; underruns: number }
  stepMetrics: { cacheHits: number; reconstructions: number; reconstructedFrames: number }
  view: ViewportSnapshot | undefined
  info: { kind: 'static' | 'animation'; width: number; height: number } | undefined
}

const number = (value: number | undefined, digits = 0) => value === undefined ? '—'
  : value.toLocaleString('en-US', { maximumFractionDigits: digits })

/** Read-only presentation of existing numeric snapshots; no collection or policy changes. */
export function ViewerDiagnostics({ metrics, stepMetrics, view, info }: ViewerDiagnosticsProps) {
  // Ordinary playback has no diagnostic DOM or per-frame number formatting work.
  if (typeof location === 'undefined' || new URLSearchParams(location.search).get('debug') !== '1') return null
  const resource = { kind: info?.kind, width: info?.width, height: info?.height }
  return <DiagnosticsPanel title="Image diagnostics">
    <div className="diagnostics-groups">
      <DiagnosticsGroup title="Playback" values={[
        { label: 'Cache-hit steps', value: number(stepMetrics.cacheHits) },
        { label: 'Reconstructions', value: number(stepMetrics.reconstructions) },
        { label: 'Reconstructed frames', value: number(stepMetrics.reconstructedFrames) },
      ]} />
      <DiagnosticsGroup title="Frame cache" values={[
        { label: 'Frames / peak', value: `${number(metrics.cachedFrames)} / ${number(metrics.peakFrames)}` },
        { label: 'Current', value: `${number(metrics.cacheBytes)} B` },
        { label: 'Peak / budget', value: `${number(metrics.peakBytes)} / ${number(metrics.maxBytes)} B` },
        { label: 'Underruns', value: number(metrics.underruns) },
      ]} />
      <DiagnosticsGroup title="Viewport" values={[
        { label: 'Mode', value: view?.mode ?? '—' },
        { label: 'Scale / fit', value: `${number(view?.scale, 3)} / ${number(view?.fitScale, 3)}` },
        { label: 'Offset (CSS px)', value: `${number(view?.offsetX, 1)}, ${number(view?.offsetY, 1)}` },
        { label: 'Surface (CSS px)', value: `${number(view?.viewportWidth)} × ${number(view?.viewportHeight)}` },
      ]} />
      <DiagnosticsGroup title="Media" values={[
        { label: 'Kind', value: info?.kind ?? '—' },
        { label: 'Size (px)', value: `${number(info?.width)} × ${number(info?.height)}` },
      ]} />
    </div>
    <RawDiagnostics items={[
      { testId: 'playback-metrics', value: metrics }, { testId: 'step-metrics', value: stepMetrics },
      { testId: 'viewport-metrics', value: view }, { testId: 'media-resource', value: resource },
    ]} />
  </DiagnosticsPanel>
}
