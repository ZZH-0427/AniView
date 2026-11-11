import { useSyncExternalStore } from 'react'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'
import { conversionCleanup } from '../media/conversion-cleanup'
import { creationCleanup } from '../media/creation-cleanup'
import { archiveCleanup } from '../media/archive-cleanup'
import { extendedArchiveCleanup } from '../media/extended-archive-cleanup'
import {videoAnimationCleanup} from '../video-conversion/cleanup'
import { DiagnosticsGroup, DiagnosticsPanel, RawDiagnostics } from './DiagnosticsPanel'

export function RuntimeDiagnosticsPanel() {
  const snapshot = useSyncExternalStore(runtimeDiagnostics.subscribe, runtimeDiagnostics.getSnapshot, runtimeDiagnostics.getSnapshot)
  const lastCreationCleanup = useSyncExternalStore(creationCleanup.subscribe, creationCleanup.getSnapshot, creationCleanup.getSnapshot)
  const lastArchiveCleanup = useSyncExternalStore(archiveCleanup.subscribe, archiveCleanup.getSnapshot, archiveCleanup.getSnapshot)
  const lastExtendedArchiveCleanup = useSyncExternalStore(extendedArchiveCleanup.subscribe, extendedArchiveCleanup.getSnapshot, extendedArchiveCleanup.getSnapshot)
  const lastConversionCleanup=useSyncExternalStore(conversionCleanup.subscribe,conversionCleanup.getSnapshot,conversionCleanup.getSnapshot)
  const lastVideoAnimationCleanup=useSyncExternalStore(videoAnimationCleanup.subscribe,videoAnimationCleanup.getSnapshot,videoAnimationCleanup.getSnapshot)
  return <DiagnosticsPanel title="Resource diagnostics">
    <div className="diagnostics-groups">
      <DiagnosticsGroup title="Resources" values={[
        { label: 'Workers active / peak', value: `${snapshot.activeWorkers} / ${snapshot.peakWorkers}` },
        { label: 'Workers created / terminated', value: `${snapshot.workersCreated} / ${snapshot.workersTerminated}` },
        { label: 'Bitmaps active / peak', value: `${snapshot.activeBitmaps} / ${snapshot.peakBitmaps}` },
        { label: 'Bitmaps created / closed', value: `${snapshot.bitmapsCreated} / ${snapshot.bitmapsClosed}` },
      ]} />
      <DiagnosticsGroup title="Archive" values={[
        { label: 'Sessions active', value: snapshot.activeArchiveSessions },
        { label: 'Opened / closed', value: `${snapshot.archiveSessionsOpened} / ${snapshot.archiveSessionsClosed}` },
        { label: 'Extractions started / completed', value: `${snapshot.entryExtractionsStarted} / ${snapshot.entryExtractionsCompleted}` },
        { label: 'Extractions discarded', value: snapshot.entryExtractionsDiscarded },
        { label: 'Stale results discarded', value: snapshot.staleResultsDiscarded },
      ]} />
      <DiagnosticsGroup title="Errors" values={[
        { label: 'Decoder', value: snapshot.decoderErrors }, { label: 'Static decode', value: snapshot.staticDecodeErrors },
        { label: 'Archive', value: snapshot.archiveErrors }, { label: 'Cleanup', value: snapshot.cleanupErrors },
      ]} />
    </div>
    <RawDiagnostics items={[{ testId: 'runtime-metrics', value: {...snapshot,...(lastArchiveCleanup?{lastArchiveCleanup}:{}),...(lastExtendedArchiveCleanup?{lastExtendedArchiveCleanup}:{}),...(lastCreationCleanup?{lastCreationCleanup}:{}),...(lastConversionCleanup?{lastConversionCleanup}:{}),...(lastVideoAnimationCleanup?{lastVideoAnimationCleanup}:{})} }]} />
  </DiagnosticsPanel>
}
