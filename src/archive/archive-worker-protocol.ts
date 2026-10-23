import type { MediaErrorCode } from '../media/errors'
import type { ArchiveEntryMetadata, ArchiveLimits } from './archive-policy'
import type { ArchiveEngineMetrics } from './archive-engine'

export type ArchiveCommand =
  | { type: 'open'; file: Blob; limits: ArchiveLimits }
  | { type: 'extract'; entryId: number; password?: string }
  | { type: 'close' }
export type ArchiveRequest = (ArchiveCommand & { id: number }) | { type: 'cancel'; target: number }
export type ArchiveResponse =
  | { id: number; type: 'ready'; entries: readonly ArchiveEntryMetadata[]; metrics: ArchiveEngineMetrics }
  | { id: number; type: 'extracted'; blob: Blob; metrics: ArchiveEngineMetrics }
  | { id: number; type: 'closed' }
  | { id: number; type: 'error'; code: MediaErrorCode; aborted?: boolean }
