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
      <DiagnosticsGroup title="Time breakdown" values={[
        { label: 'Source checks before Generate', value: diagnostics.sourceCheckMs === undefined ? '—' : `${diagnostics.sourceCheckMs.toFixed(1)} ms` },
        { label: 'Source read round trips', value: result?.metrics.sourceReadMs === undefined ? '—' : `${result.metrics.sourceReadMs.toFixed(1)} ms` },
        { label: 'Source decode', value: result ? `${result.metrics.decodeMs.toFixed(1)} ms` : '—' },
        { label: 'Format and dimension checks', value: result?.metrics.identifyMs === undefined ? '—' : `${result.metrics.identifyMs.toFixed(1)} ms` },
        { label: 'Canvas composition/readback', value: result?.metrics.composeMs === undefined ? '—' : `${result.metrics.composeMs.toFixed(1)} ms` },
        { label: 'Quantization', value: result ? `${result.metrics.quantizeMs.toFixed(1)} ms` : '—' },
        { label: 'GIF write', value: result ? `${result.metrics.writeMs.toFixed(1)} ms` : '—' },
        { label: 'Yield wait', value: result?.metrics.checkpointMs === undefined ? '—' : `${result.metrics.checkpointMs.toFixed(1)} ms` },
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
