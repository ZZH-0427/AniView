import { useSyncExternalStore } from 'react'
import type { CreationSnapshot } from '../../creation/creation-types'
import { runtimeDiagnostics } from '../../media/runtime-diagnostics'
import { DiagnosticsGroup, DiagnosticsPanel } from '../../components/DiagnosticsPanel'

/** Local numeric ownership evidence; never source names, local paths, pixels or result URLs. */
export function CreationDiagnostics({ snapshot }: { snapshot: CreationSnapshot }) {
  const resources = useSyncExternalStore(runtimeDiagnostics.subscribe, runtimeDiagnostics.getSnapshot, runtimeDiagnostics.getSnapshot)
  const { diagnostics, result } = snapshot, source = result?.creationMetrics.source
  const summary = { status: snapshot.status, target: snapshot.settings.target, resultFormat: result?.format,
    inputFrames: result?.inputFrameCount, outputFrames: result?.metadata.frameCount, ...diagnostics }
  return <DiagnosticsPanel title="Creation diagnostics">
    <div className="diagnostics-groups">
      <DiagnosticsGroup title="Generation" values={[
        { label: 'Started / completed / cancelled', value: `${diagnostics.generations} / ${diagnostics.completed} / ${diagnostics.cancellations}` },
        { label: 'Target / result', value: `${snapshot.settings.target} / ${result?.format ?? '—'}` },
        { label: 'Input / actual frames', value: `${result?.inputFrameCount ?? '—'} / ${result?.metadata.frameCount ?? '—'}` },
        { label: 'Last output bytes', value: diagnostics.lastOutputBytes },
        { label: 'Peak canonical RGBA', value: diagnostics.peakCanonicalRgbaFrames },
        { label: 'Peak source bitmaps', value: source?.peakBitmaps ?? '—' },
        { label: 'Peak frame bytes', value: source?.peakFrameBytes ?? '—' },
      ]} />
      <DiagnosticsGroup title="Measured time" values={[
        { label: 'Source admission (ms)', value: diagnostics.sourceCheckMs?.toFixed(1) ?? '—' },
        { label: 'Source reads (ms)', value: source?.sourceReadMs.toFixed(1) ?? '—' },
        { label: 'Native decode, both passes (ms)', value: source?.decodeMs.toFixed(1) ?? '—' },
        { label: 'Composition/readback (ms)', value: source?.composeMs.toFixed(1) ?? '—' },
        { label: 'Target encode (ms)', value: result?.metrics.encodeMs.toFixed(1) ?? '—' },
        { label: 'Job before output checking (ms)', value: result?.creationMetrics.totalMs.toFixed(1) ?? '—' },
      ]} />
      <DiagnosticsGroup title="Resources" values={[
        { label: 'Source / encoder Workers', value: `${diagnostics.activeSourceWorkers} / ${diagnostics.activeEncoderWorkers}` },
        { label: 'Validation / inspection Workers', value: `${diagnostics.activeValidationDecoderWorkers} / ${diagnostics.activeInspectionWorkers}` },
        { label: 'Workers active / peak', value: `${resources.activeWorkers} / ${resources.peakWorkers}` },
        { label: 'Workers created / terminated', value: `${resources.workersCreated} / ${resources.workersTerminated}` },
        { label: 'Owned RGBA / awaiting ACK', value: `${diagnostics.ownedRgba} / ${diagnostics.awaitingAck}` },
        { label: 'Cleanup errors', value: diagnostics.cleanupErrors },
      ]} />
    </div>
    <details className="diagnostics-raw"><summary>Summary JSON</summary><output data-testid="creation-summary">{JSON.stringify(summary)}</output></details>
    <details className="diagnostics-raw"><summary>Raw JSON</summary>
      <output data-testid="creation-debug">{JSON.stringify({ ...summary, diagnostics, metrics: result?.creationMetrics, encoderMetrics: result?.metrics, resources })}</output>
    </details>
  </DiagnosticsPanel>
}
