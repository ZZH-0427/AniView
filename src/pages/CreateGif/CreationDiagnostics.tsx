import { useSyncExternalStore } from 'react'
import type { CreationSnapshot } from '../../creation/creation-types'
import { runtimeDiagnostics } from '../../media/runtime-diagnostics'
import { DiagnosticsGroup, DiagnosticsPanel } from '../../components/DiagnosticsPanel'

/** Local numeric evidence only; selected names, paths and media never enter it. */
export function CreationDiagnostics({ snapshot }: { snapshot: CreationSnapshot }) {
  const resources = useSyncExternalStore(runtimeDiagnostics.subscribe, runtimeDiagnostics.getSnapshot, runtimeDiagnostics.getSnapshot)
  const { diagnostics, result } = snapshot
  return <DiagnosticsPanel title="Creation diagnostics">
    <div className="diagnostics-groups">
      <DiagnosticsGroup title="Generation" values={[
        { label: 'Started / cancelled', value: `${diagnostics.generations} / ${diagnostics.cancellations}` },
        { label: 'Last GIF bytes', value: diagnostics.lastOutputBytes },
        { label: 'Last encode time', value: result ? `${result.metrics.totalMs.toFixed(1)} ms` : '—' },
        { label: 'Peak RGBA frames', value: result?.metrics.peakRgbaFrames ?? '—' },
        { label: 'Peak frame bytes', value: result?.metrics.peakFrameBytes ?? '—' },
      ]} />
      <DiagnosticsGroup title="Resources" values={[
        { label: 'Workers active / peak', value: `${resources.activeWorkers} / ${resources.peakWorkers}` },
        { label: 'Workers created / terminated', value: `${resources.workersCreated} / ${resources.workersTerminated}` },
        { label: 'Cleanup errors', value: resources.cleanupErrors },
      ]} />
    </div>
    <details className="diagnostics-raw">
      <summary>Raw JSON</summary>
      <output data-testid="creation-debug">{JSON.stringify({ status: snapshot.status, diagnostics, metrics: result?.metrics, resources })}</output>
    </details>
  </DiagnosticsPanel>
}
