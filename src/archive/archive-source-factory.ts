import { detectArchiveSignature } from './archive-signature'
import type { ArchiveSourceSession, ArchiveFormat } from './archive-source-session'
import type { ArchiveSession } from './archive-session'
import { MediaError } from '../media/errors'

/** Opening can require a header password before a source has any entries. */
export interface ArchiveOpeningSource {
  readonly name: string
  readonly format: ArchiveFormat
  open(options?: { password?: string; signal?: AbortSignal }): Promise<ArchiveSourceSession>
  close(): Promise<void>
}

function zipSource(session: ArchiveSession): ArchiveSourceSession {
  return {
    id: session.id, name: session.name, format: 'zip',
    get entries() { return session.entries },
    get files() { return session.files },
    get metrics() { return session.metrics },
    entryForFile: file => session.entryForFile(file),
    ensureEntryAvailable: (id, options) => session.ensureEntryAvailable(id, options),
    unlockEntry: (id, password, options) => session.unlockEntry(id, password, options),
    releaseEntry: id => session.releaseEntry(id),
    close: () => session.close(),
  }
}

/** Signature dispatch precedes every optional import: Home and ZIP never load SevenZip. */
export async function createArchiveSource(file: File, signal?: AbortSignal): Promise<ArchiveOpeningSource> {
  const signature = await detectArchiveSignature(file, signal)
  if (signature === 'zip') {
    let source: ArchiveSourceSession | undefined, closed = false
    return {
      name: file.name, format: 'zip',
      async open(options = {}) {
        if (closed) throw new MediaError('ARCHIVE_CLOSED')
        const { ArchiveSession } = await import('./archive-session')
        options.signal?.throwIfAborted()
        source = zipSource(await ArchiveSession.open(file, options))
        if (closed) { await source.close(); throw new MediaError('ARCHIVE_CLOSED') }
        return source
      },
      async close() { closed = true; await source?.close() },
    }
  }
  const { ExtendedArchiveSession } = await import('./extended-session')
  signal?.throwIfAborted()
  const source = ExtendedArchiveSession.create(file, signature === 'rar4' ? 4 : signature === 'rar5' ? 5 : 7)
  return {
    name: source.name, format: source.format,
    async open(options) { await source.open(options); return source },
    close: () => source.close(),
  }
}
