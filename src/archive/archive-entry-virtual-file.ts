import type { VirtualFile } from '../input/virtual-file'
import type { ArchiveEntryMetadata } from './archive-policy'

interface EntrySource {
  readonly id: string
  extractEntry(entryId: number): Promise<Blob>
  releaseEntry(entryId: number): Promise<void>
}

/** A Blob cache belongs to the session; every byte reader receives a fresh buffer. */
export class ArchiveEntryVirtualFile implements VirtualFile {
  readonly source = 'archive' as const
  readonly archiveId: string
  readonly entryPath: string
  readonly name: string
  readonly size: number
  readonly entryId: number
  constructor(private readonly session: EntrySource, entry: ArchiveEntryMetadata) {
    this.archiveId = session.id
    this.entryId = entry.id
    this.entryPath = this.name = entry.path
    this.size = entry.uncompressedSize
  }
  async read(start?: number, end?: number): Promise<ArrayBuffer> {
    const blob = await this.session.extractEntry(this.entryId)
    return blob.slice(start, end).arrayBuffer()
  }
  release(): Promise<void> { return this.session.releaseEntry(this.entryId) }
}
