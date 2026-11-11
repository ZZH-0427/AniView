import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'

interface ExtendedEntrySource {
  readonly id: string
  extractEntry(id: number): Promise<Blob>
  releaseEntry(id: number): Promise<void>
}

/** Only the session owns plaintext. Readers receive independent range buffers. */
export class ExtendedArchiveEntryVirtualFile implements VirtualFile {
  readonly source = 'archive' as const
  readonly archiveId: string
  readonly entryPath: string
  readonly entryId: number
  readonly name: string
  private verifiedSize: number | undefined

  constructor(private readonly session: ExtendedEntrySource, entry: { id: number; path: string; size: number | null }) {
    this.archiveId = session.id
    this.entryId = entry.id
    this.name = this.entryPath = entry.path
    this.verifiedSize = entry.size ?? undefined
  }

  get size(): number {
    // Unknown native size is not zero. The extended access gate materializes a
    // selected entry before handing it to Viewer/conversion, establishing size.
    if (this.verifiedSize === undefined) throw new MediaError('FILE_READ_FAILED')
    return this.verifiedSize
  }

  acceptVerifiedSize(size: number): void { this.verifiedSize = size }

  async read(start?: number, end?: number): Promise<ArrayBuffer> {
    const blob = await this.session.extractEntry(this.entryId)
    return blob.slice(start, end).arrayBuffer()
  }

  release(): Promise<void> { return this.session.releaseEntry(this.entryId) }
}
