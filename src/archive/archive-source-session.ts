import type { VirtualFile } from '../input/virtual-file'

export type ArchiveFormat = 'zip' | 'rar' | '7z'

/** UI metadata only. ZIP and extended native metadata stay in their own adapters. */
export interface ArchiveSourceEntry {
  readonly id: number
  readonly path: string
  readonly directory: boolean
  readonly encrypted: boolean | null
  readonly mediaCandidate: boolean
}

export interface ArchiveSourceMetrics {
  readonly entryCount: number
  readonly mediaCount: number
  readonly totalDeclaredBytes: number
  readonly extractions: number
  readonly metadataMs: number
  readonly extractMs: number
  readonly currentEntryId: number | null
  readonly currentExtractedBytes: number
  readonly peakExtractedBytes: number
  readonly pendingReads: number
  readonly pendingPasswordAccess: number
}

/** Selection/access boundary, never a common decoder or shared password store. */
export interface ArchiveSourceSession {
  readonly id: string
  readonly name: string
  readonly format: ArchiveFormat
  readonly entries: readonly ArchiveSourceEntry[]
  readonly files: readonly VirtualFile[]
  readonly metrics: ArchiveSourceMetrics
  entryForFile(file: VirtualFile): ArchiveSourceEntry | undefined
  ensureEntryAvailable(id: number, options?: { signal?: AbortSignal }): Promise<void>
  unlockEntry(id: number, password: string, options?: { signal?: AbortSignal }): Promise<void>
  releaseEntry(id: number): Promise<void>
  close(): Promise<void>
}
