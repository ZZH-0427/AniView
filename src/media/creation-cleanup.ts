import { runtimeDiagnostics } from './runtime-diagnostics'

export interface CreationCleanup {
  readonly activeSourceWorkers: number; readonly activeEncoderWorkers: number
  readonly activeValidationDecoderWorkers: number; readonly activeInspectionWorkers: number
  readonly activeBitmaps: number; readonly activeCanvases: number; readonly activeImageData: number
  readonly ownedRgba: number; readonly awaitingAck: number; readonly activeObjectUrls: number
  readonly cleanupErrors: number; readonly peakCanonicalRgbaFrames: number
  readonly sourceSoftClosed: boolean | null
}
export const initialCreationCleanup = (): CreationCleanup => ({ activeSourceWorkers: 0, activeEncoderWorkers: 0,
  activeValidationDecoderWorkers: 0, activeInspectionWorkers: 0, activeBitmaps: 0, activeCanvases: 0,
  activeImageData: 0, ownedRgba: 0, awaitingAck: 0, activeObjectUrls: 0, cleanupErrors: 0,
  peakCanonicalRgbaFrames: 0, sourceSoftClosed: null })
let snapshot: CreationCleanup | null = null
const listeners = new Set<() => void>()
export const creationCleanup = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => {
  if (!runtimeDiagnostics.enabled) return () => {}
  listeners.add(listener); return () => { listeners.delete(listener) }
} }
/** Debug-only post-close ownership evidence. No source identity, bytes, paths or URLs. */
export function recordCreationCleanup(value: CreationCleanup) {
  if (!runtimeDiagnostics.enabled) return
  snapshot = { activeSourceWorkers: value.activeSourceWorkers, activeEncoderWorkers: value.activeEncoderWorkers,
    activeValidationDecoderWorkers: value.activeValidationDecoderWorkers, activeInspectionWorkers: value.activeInspectionWorkers,
    activeBitmaps: value.activeBitmaps, activeCanvases: value.activeCanvases, activeImageData: value.activeImageData,
    ownedRgba: value.ownedRgba, awaitingAck: value.awaitingAck, activeObjectUrls: value.activeObjectUrls,
    cleanupErrors: value.cleanupErrors, peakCanonicalRgbaFrames: value.peakCanonicalRgbaFrames, sourceSoftClosed: value.sourceSoftClosed }
  for (const listener of listeners) listener()
}
