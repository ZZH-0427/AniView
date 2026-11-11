import { runtimeDiagnostics } from './runtime-diagnostics'

export interface ExtendedArchiveCleanup {
  readonly extendedArchiveWorkersCreated: number
  readonly extendedArchiveWorkersTerminated: number
  readonly activeExtendedArchiveWorkers: number
  readonly activeWasmInstances: number
  readonly activeArchiveSessions: number
  readonly activeExtraction: number
  readonly pendingAccess: number
  readonly currentExtractedBytes: number
  readonly activeObjectUrls: number
  readonly cleanupErrors: number
  readonly peakWasmBytes: number
  readonly timeouts: number
}

let snapshot: ExtendedArchiveCleanup | null = null
const listeners = new Set<() => void>()
export const extendedArchiveCleanup = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    if (!runtimeDiagnostics.enabled) return () => {}
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

/** Numeric ownership only: never retain a source, entry path, password or backend request. */
export function recordExtendedArchiveCleanup(value: ExtendedArchiveCleanup): void {
  if (!runtimeDiagnostics.enabled) return
  snapshot = {
    extendedArchiveWorkersCreated: value.extendedArchiveWorkersCreated,
    extendedArchiveWorkersTerminated: value.extendedArchiveWorkersTerminated,
    activeExtendedArchiveWorkers: value.activeExtendedArchiveWorkers,
    activeWasmInstances: value.activeWasmInstances,
    activeArchiveSessions: value.activeArchiveSessions,
    activeExtraction: value.activeExtraction,
    pendingAccess: value.pendingAccess,
    currentExtractedBytes: value.currentExtractedBytes,
    activeObjectUrls: value.activeObjectUrls,
    cleanupErrors: value.cleanupErrors,
    peakWasmBytes: value.peakWasmBytes,
    timeouts: value.timeouts,
  }
  for (const listener of listeners) listener()
}
