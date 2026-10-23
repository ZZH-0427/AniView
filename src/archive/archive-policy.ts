import { MediaError } from '../media/errors'

/** Encoded/archive limits are separate from the decoded animation-frame budget. */
export interface ArchiveLimits {
  readonly maxArchiveBytes: number
  readonly maxDirectoryBytes: number
  readonly maxEntries: number
  readonly maxEntryBytes: number
  readonly maxTotalBytes: number
  readonly maxCompressionRatio: number
  readonly maxPathLength: number
  readonly maxTotalPathLength: number
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  maxArchiveBytes: 512 * 1024 * 1024,
  // Bound the vendor reader's central-directory allocation before entry iteration.
  maxDirectoryBytes: 16 * 1024 * 1024,
  maxEntries: 10_000,
  // Matches the encoded-source limit of the existing WebP/APNG/GIF decoders.
  maxEntryBytes: 64 * 1024 * 1024,
  // A metadata-only total, not a reservation or an extract-all allowance.
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxCompressionRatio: 1000,
  maxPathLength: 1024,
  maxTotalPathLength: 2 * 1024 * 1024,
})

export function normalizeArchiveLimits(overrides: Partial<ArchiveLimits> = {}): ArchiveLimits {
  const limits = { ...DEFAULT_ARCHIVE_LIMITS, ...overrides }
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0
      || (key !== 'maxCompressionRatio' && !Number.isSafeInteger(value))) {
      throw new RangeError(`Invalid archive limit: ${key}`)
    }
  }
  return Object.freeze(limits)
}

const isSize = (value: number) => Number.isSafeInteger(value) && value >= 0

export function assertArchiveFileSize(size: number, limits = DEFAULT_ARCHIVE_LIMITS): void {
  if (!isSize(size)) throw new MediaError('ARCHIVE_INVALID')
  if (size > limits.maxArchiveBytes) throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
}

/** Returns a logical relative name, never a filesystem path or a resource URL. */
export function normalizeArchivePath(name: string, limits = DEFAULT_ARCHIVE_LIMITS): string {
  if (name.length > limits.maxPathLength) throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
  const path = name.replaceAll('\\', '/')
  const parts = path.split('/')
  const unsafeCharacter = [...path].some((character) => {
    const code = character.codePointAt(0)!
    return code < 32 || (code >= 127 && code <= 159)
      || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)
  })
  if (path.startsWith('/') || unsafeCharacter
    || parts.some((part) => part === '..' || /^[a-z]:/i.test(part))) {
    throw new MediaError('ARCHIVE_UNSUPPORTED')
  }
  const normalized = parts.filter((part) => part !== '' && part !== '.').join('/')
  if (normalized === '') throw new MediaError('ARCHIVE_UNSUPPORTED')
  return normalized + (path.endsWith('/') ? '/' : '')
}

const imageExtensions = new Set([
  'gif', 'webp', 'png', 'apng', 'jpg', 'jpeg', 'avif', 'heic', 'heif',
  'bmp', 'tif', 'tiff', 'svg',
])

/** Extensions control discoverability only; opened entries still use binary detection. */
export function isArchiveMediaCandidate(path: string, directory = false): boolean {
  if (directory || path.endsWith('/')) return false
  const parts = path.split('/')
  const name = parts.at(-1) ?? ''
  if (!name || parts.some((part) => part.toLowerCase() === '__macosx')
    || name.toLowerCase() === '.ds_store' || name.startsWith('._')) return false
  const dot = name.lastIndexOf('.')
  return dot === -1 || imageExtensions.has(name.slice(dot + 1).toLowerCase())
}

export interface ArchiveEntryInput {
  readonly name: string
  readonly directory: boolean
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly encrypted: boolean
  /** The underlying method, including for AES wrappers (STORE=0, DEFLATE=8). */
  readonly compressionMethod: number
}

export type ArchiveEntryBlockedCode =
  | 'ARCHIVE_UNSUPPORTED'
  | 'ARCHIVE_ENTRY_TOO_LARGE'
  | 'ARCHIVE_LIMIT_EXCEEDED'

export interface ArchiveEntryMetadata {
  readonly id: number
  readonly path: string
  readonly originalPathLength: number
  readonly directory: boolean
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly encrypted: boolean
  readonly compressionMethod: number
  readonly access: 'AVAILABLE' | 'ENCRYPTED' | 'UNSUPPORTED'
  readonly mediaCandidate: boolean
  readonly blockedCode?: ArchiveEntryBlockedCode
}

export interface ArchiveTotals {
  readonly entryCount: number
  readonly totalBytes: number
  readonly totalPathLength: number
}

/** May be called during metadata iteration so oversized directories stop early. */
export function assertArchiveTotals(totals: ArchiveTotals, limits = DEFAULT_ARCHIVE_LIMITS): void {
  if (!isSize(totals.entryCount) || !isSize(totals.totalBytes) || !isSize(totals.totalPathLength)
    || totals.entryCount > limits.maxEntries || totals.totalBytes > limits.maxTotalBytes
    || totals.totalPathLength > limits.maxTotalPathLength) {
    throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
  }
}

export function createArchiveEntryMetadata(
  entry: ArchiveEntryInput,
  id: number,
  limits = DEFAULT_ARCHIVE_LIMITS,
): ArchiveEntryMetadata {
  if (!Number.isSafeInteger(id) || id < 0
    || !isSize(entry.compressedSize) || !isSize(entry.uncompressedSize)) {
    throw new MediaError('ARCHIVE_CORRUPTED')
  }
  let path: string
  let blockedCode: ArchiveEntryBlockedCode | undefined
  try { path = normalizeArchivePath(entry.name, limits) }
  catch (error) {
    if (!(error instanceof MediaError)) throw error
    // Do not retain or display hostile raw names. Keep the entry's position/count.
    path = `[Unsafe ZIP entry ${id + 1}]`
    blockedCode = error.code === 'ARCHIVE_LIMIT_EXCEEDED'
      ? 'ARCHIVE_LIMIT_EXCEEDED' : 'ARCHIVE_UNSUPPORTED'
  }
  const safePath = blockedCode === undefined
  if (!blockedCode && entry.uncompressedSize > limits.maxEntryBytes) {
    blockedCode = 'ARCHIVE_ENTRY_TOO_LARGE'
  }
  if (!blockedCode && (entry.compressedSize === 0
    ? entry.uncompressedSize > 0
    : entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio)) {
    blockedCode = 'ARCHIVE_LIMIT_EXCEEDED'
  }
  if (!blockedCode && entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    blockedCode = 'ARCHIVE_UNSUPPORTED'
  }
  return {
    id, path, originalPathLength: entry.name.length,
    directory: entry.directory,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    encrypted: entry.encrypted,
    compressionMethod: entry.compressionMethod,
    access: blockedCode ? 'UNSUPPORTED' : entry.encrypted ? 'ENCRYPTED' : 'AVAILABLE',
    // Unsafe names stay in metadata but never enter the media list.
    mediaCandidate: safePath && isArchiveMediaCandidate(path, entry.directory),
    ...(blockedCode ? { blockedCode } : {}),
  }
}

/** Validate all entries, including directories and entries hidden by the media heuristic. */
export function assertArchiveEntries(
  entries: readonly ArchiveEntryMetadata[],
  limits = DEFAULT_ARCHIVE_LIMITS,
): void {
  if (entries.length > limits.maxEntries) throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
  let totalBytes = 0, totalPathLength = 0
  for (const entry of entries) {
    if (!isSize(entry.uncompressedSize) || !isSize(entry.originalPathLength)) {
      throw new MediaError('ARCHIVE_CORRUPTED')
    }
    // Subtraction guards both configured budgets and integer addition overflow.
    if (entry.uncompressedSize > limits.maxTotalBytes - totalBytes
      || entry.originalPathLength > limits.maxTotalPathLength - totalPathLength) {
      throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
    }
    totalBytes += entry.uncompressedSize
    totalPathLength += entry.originalPathLength
  }
}
