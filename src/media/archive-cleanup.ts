import { runtimeDiagnostics } from './runtime-diagnostics'

export interface ArchiveCleanup {
  readonly activeArchiveWorkers: number
  readonly activeArchiveSessions: number
  readonly pendingReads: number
  readonly pendingPasswordAccess: number
  readonly currentExtractedBytes: number
  readonly cleanupErrors: number
}
let snapshot: ArchiveCleanup | null = null
const listeners = new Set<() => void>()
export const archiveCleanup = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => {
  if (!runtimeDiagnostics.enabled) return () => {}
  listeners.add(listener); return () => { listeners.delete(listener) }
} }
/** Numeric ownership only. Never serialize a Session, credential, request or entry metadata here. */
export function recordArchiveCleanup(value: ArchiveCleanup) {
  if (!runtimeDiagnostics.enabled) return
  snapshot = { activeArchiveWorkers: value.activeArchiveWorkers, activeArchiveSessions: value.activeArchiveSessions,
    pendingReads: value.pendingReads, pendingPasswordAccess: value.pendingPasswordAccess,
    currentExtractedBytes: value.currentExtractedBytes, cleanupErrors: value.cleanupErrors }
  for (const listener of listeners) listener()
}
