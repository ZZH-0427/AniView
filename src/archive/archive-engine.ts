import { BlobReader, ZipReader } from '@zip.js/zip.js'
import type { Entry } from '@zip.js/zip.js'
import { MediaError } from '../media/errors'
import {
  assertArchiveTotals, assertArchiveFileSize, createArchiveEntryMetadata,
} from './archive-policy'
import type { ArchiveEntryMetadata, ArchiveLimits } from './archive-policy'
import { archiveFailure } from './archive-errors'
export { archiveFailure } from './archive-errors'

export interface ArchiveEngineMetrics {
  readonly entryCount: number
  readonly mediaCount: number
  readonly totalDeclaredBytes: number
  readonly extractions: number
  readonly metadataMs: number
  readonly extractMs: number
}

class BoundedArchiveReader extends BlobReader {
  constructor(file: Blob, private readonly maxReadBytes: number) { super(file) }
  override readUint8Array(index: number, length: number): Promise<Uint8Array> {
    // zip.js materializes the central-directory range before yielding its entries.
    // Reject that allocation before the entry-count/metadata policy can run.
    if (length > this.maxReadBytes) return Promise.reject(new MediaError('ARCHIVE_LIMIT_EXCEEDED'))
    return super.readUint8Array(index, length)
  }
}

/** The sink checks real output before copying/retaining each decompressed chunk. */
export function boundedBlobWriter(maxBytes: number, declaredBytes: number, signal?: AbortSignal) {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0, discarded = false
  const discard = () => { chunks.length = 0; size = 0; discarded = true }
  return {
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        try {
          signal?.throwIfAborted()
          if (chunk.byteLength > maxBytes - size) throw new MediaError('ARCHIVE_ENTRY_TOO_LARGE')
          if (chunk.byteLength > declaredBytes - size) throw new MediaError('ARCHIVE_CORRUPTED')
          size += chunk.byteLength; chunks.push(chunk.slice())
        } catch (cause) { discard(); throw cause }
      },
      abort: discard,
    }),
    discard,
    blob() {
      signal?.throwIfAborted()
      if (discarded || size !== declaredBytes) throw new MediaError('ARCHIVE_CORRUPTED')
      const blob = new Blob(chunks)
      chunks.length = 0
      return blob
    },
  }
}

/** Runs entirely in the archive Worker, retaining compressed source + metadata only. */
export class ArchiveEngine {
  private closed = false
  private extractions = 0
  private extractMs = 0
  private constructor(
    private readonly reader: ZipReader<Blob>,
    private entries: Entry[],
    readonly metadata: readonly ArchiveEntryMetadata[],
    private readonly limits: ArchiveLimits,
    private readonly metadataMs: number,
  ) {}

  static async open(file: Blob, limits: ArchiveLimits, signal?: AbortSignal): Promise<ArchiveEngine> {
    assertArchiveFileSize(file.size, limits)
    signal?.throwIfAborted()
    const start = performance.now()
    // AniView already supplies a dedicated Worker. Do not create a second pool.
    const reader = new ZipReader(new BoundedArchiveReader(file, limits.maxDirectoryBytes), { useWebWorkers: false, checkCrc32: true, checkSignature: true })
    const entries: Entry[] = []
    const metadata: ArchiveEntryMetadata[] = []
    let totalBytes = 0, totalPathLength = 0
    try {
      // AniView rejects unsafe names per entry so one hostile name cannot hide safe siblings.
      // This changes filename validation only; parser structural checks stay balanced.
      for await (const entry of reader.getEntriesGenerator({ filenameValidation: 'tolerant' })) {
        signal?.throwIfAborted()
        if (entries.length >= limits.maxEntries) throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
        // Links, split volumes and PKWARE strong encryption are not normal image files.
        const unsupported = entry.symlink || entry.diskNumberStart !== 0
        const strength = entry.extraFieldAES?.strength
        const aesStrength = strength === 1 || strength === 2 || strength === 3 ? strength : undefined
        const encryption = !entry.encrypted ? 'none' : ((entry.rawBitFlag ?? 0) & 0x40) !== 0
          || (entry.extraFieldAES && !aesStrength) ? 'unsupported' : entry.extraFieldAES ? 'aes' : 'zipcrypto'
        metadata.push(createArchiveEntryMetadata({ name: entry.filename, directory: entry.directory,
          compressedSize: entry.compressedSize, uncompressedSize: entry.uncompressedSize,
          encrypted: entry.encrypted, encryption, ...(aesStrength ? { aesStrength } : {}),
          compressionMethod: unsupported ? -1 : entry.compressionMethod }, entries.length, limits))
        entries.push(entry)
        // Reject cumulative size/path limits during iteration, not after retaining everything.
        totalBytes += entry.uncompressedSize
        totalPathLength += entry.filename.length
        assertArchiveTotals({ entryCount: entries.length, totalBytes, totalPathLength }, limits)
      }
      signal?.throwIfAborted()
      return new ArchiveEngine(reader, entries, metadata, limits, performance.now() - start)
    } catch (cause) {
      await reader.close()
      if (!(cause instanceof MediaError) && cause instanceof Error && cause.name !== 'AbortError') {
        const prefix = new Uint8Array(await file.slice(0, 4).arrayBuffer())
        const zipPrefix = prefix[0] === 0x50 && prefix[1] === 0x4b
        const failure = archiveFailure(cause)
        if (!zipPrefix && failure instanceof MediaError && failure.code === 'ARCHIVE_CORRUPTED') {
          throw new MediaError('ARCHIVE_INVALID', { cause })
        }
      }
      throw archiveFailure(cause)
    }
  }

  get metrics(): ArchiveEngineMetrics {
    return { entryCount: this.metadata.length, mediaCount: this.metadata.filter(entry => entry.mediaCandidate).length,
      totalDeclaredBytes: this.metadata.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
      extractions: this.extractions, metadataMs: this.metadataMs, extractMs: this.extractMs }
  }

  async extract(entryId: number, options: { password?: string; signal?: AbortSignal } = {}): Promise<Blob> {
    if (this.closed) throw new MediaError('ARCHIVE_CLOSED')
    options.signal?.throwIfAborted()
    const entry = this.entries[entryId]
    const metadata = this.metadata[entryId]
    if (!entry || !metadata || entry.directory) throw new MediaError('ARCHIVE_UNSUPPORTED')
    if (metadata.blockedCode) throw new MediaError(metadata.blockedCode)
    if (metadata.encrypted && options.password === undefined) throw new MediaError('ARCHIVE_ENCRYPTED')
    const output = boundedBlobWriter(this.limits.maxEntryBytes, entry.uncompressedSize, options.signal)
    const start = performance.now()
    this.extractions++
    try {
      await entry.getData(output.writable, { useWebWorkers: false, checkCrc32: true, checkSignature: true,
        checkAuthenticationCode: true, ...(options.password === undefined ? {} : { password: options.password }),
        ...(options.signal ? { signal: options.signal } : {}) })
      options.signal?.throwIfAborted()
      if (this.closed) throw new MediaError('ARCHIVE_CLOSED')
      return output.blob()
    } catch (cause) { output.discard(); throw archiveFailure(cause, metadata.encryption) }
    finally { this.extractMs = performance.now() - start }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.entries = []
    await this.reader.close()
  }
}
