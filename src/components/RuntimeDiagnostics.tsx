import { useSyncExternalStore } from 'react'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'

export function RuntimeDiagnosticsPanel() {
  const snapshot = useSyncExternalStore(runtimeDiagnostics.subscribe, runtimeDiagnostics.getSnapshot, runtimeDiagnostics.getSnapshot)
  const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1'
  return debug ? <div className="viewer-diagnostics"><output data-testid="runtime-metrics">{JSON.stringify(snapshot)}</output></div> : null
}
