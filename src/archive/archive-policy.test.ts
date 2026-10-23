import { describe, expect, it } from 'vitest'
import {
  assertArchiveEntries, assertArchiveFileSize, assertArchiveTotals, createArchiveEntryMetadata,
  DEFAULT_ARCHIVE_LIMITS, isArchiveMediaCandidate, normalizeArchiveLimits, normalizeArchivePath,
  type ArchiveEntryInput,
} from './archive-policy'

const input = (overrides: Partial<ArchiveEntryInput> = {}): ArchiveEntryInput => ({
  name: 'folder/animation.gif', directory: false, compressedSize: 100,
  uncompressedSize: 500, encrypted: false, compressionMethod: 8, ...overrides,
})
const metadata = (overrides: Partial<ArchiveEntryInput> = {}, id = 0) =>
  createArchiveEntryMetadata(input(overrides), id)

describe('archive resource policy', () => {
  it('accepts a large ZIP without raising decoder source limits', () => {
    expect(DEFAULT_ARCHIVE_LIMITS.maxArchiveBytes).toBe(512 * 1024 * 1024)
    expect(DEFAULT_ARCHIVE_LIMITS.maxDirectoryBytes).toBe(16 * 1024 * 1024)
    expect(DEFAULT_ARCHIVE_LIMITS.maxEntryBytes).toBe(64 * 1024 * 1024)
    expect(() => assertArchiveFileSize(DEFAULT_ARCHIVE_LIMITS.maxArchiveBytes)).not.toThrow()
    expect(() => assertArchiveFileSize(DEFAULT_ARCHIVE_LIMITS.maxArchiveBytes + 1))
      .toThrow(expect.objectContaining({ code: 'ARCHIVE_LIMIT_EXCEEDED' }))
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid ZIP byte size %s', (size) => {
    expect(() => assertArchiveFileSize(size)).toThrow(expect.objectContaining({ code: 'ARCHIVE_INVALID' }))
  })

  it('provides independent, frozen configurable limits', () => {
    const limits = normalizeArchiveLimits({ maxArchiveBytes: 42, maxCompressionRatio: 1.5 })
    expect(limits.maxEntryBytes).toBe(DEFAULT_ARCHIVE_LIMITS.maxEntryBytes)
    expect(limits.maxCompressionRatio).toBe(1.5)
    expect(Object.isFrozen(limits)).toBe(true)
    expect(() => assertArchiveFileSize(43, limits)).toThrow()
    expect(DEFAULT_ARCHIVE_LIMITS.maxArchiveBytes).not.toBe(42)
  })

  it.each([
    { maxArchiveBytes: 0 }, { maxDirectoryBytes: 0 }, { maxEntries: -1 }, { maxEntryBytes: 1.5 },
    { maxTotalBytes: Infinity }, { maxCompressionRatio: NaN },
    { maxCompressionRatio: 0 }, { maxPathLength: Number.MAX_SAFE_INTEGER + 1 },
    { maxTotalPathLength: -1 },
  ])('rejects invalid configuration %j', (overrides) => {
    expect(() => normalizeArchiveLimits(overrides)).toThrow(RangeError)
  })

  it('checks directory-wide totals including filtered and blocked entries', () => {
    const entries = [metadata({ name: 'notes.txt' }), metadata({ name: '../bad.gif' }, 1)]
    expect(() => assertArchiveEntries(entries, normalizeArchiveLimits({ maxTotalBytes: 1000 }))).not.toThrow()
    expect(() => assertArchiveEntries(entries, normalizeArchiveLimits({ maxEntries: 1 }))).toThrow()
    expect(() => assertArchiveEntries(entries, normalizeArchiveLimits({ maxTotalBytes: 999 }))).toThrow()
    expect(() => assertArchiveEntries(entries, normalizeArchiveLimits({ maxTotalPathLength: 19 }))).not.toThrow()
    expect(() => assertArchiveEntries(entries, normalizeArchiveLimits({ maxTotalPathLength: 18 }))).toThrow()
  })

  it('supports incremental totals, rejects overflow and accepts exact boundaries', () => {
    const limits = normalizeArchiveLimits({ maxEntries: 3, maxTotalBytes: 500, maxTotalPathLength: 50 })
    expect(() => assertArchiveTotals({ entryCount: 3, totalBytes: 500, totalPathLength: 50 }, limits)).not.toThrow()
    expect(() => assertArchiveTotals({ entryCount: 4, totalBytes: 500, totalPathLength: 50 }, limits)).toThrow()
    expect(() => assertArchiveTotals({ entryCount: 3, totalBytes: 501, totalPathLength: 50 }, limits)).toThrow()
    expect(() => assertArchiveTotals({ entryCount: 3, totalBytes: 500, totalPathLength: 51 }, limits)).toThrow()
    expect(() => assertArchiveTotals({ entryCount: 3, totalBytes: Number.MAX_SAFE_INTEGER + 1, totalPathLength: 0 })).toThrow()
  })

  it('blocks only an oversized entry while keeping its metadata and candidate visible', () => {
    const entry = metadata({ uncompressedSize: DEFAULT_ARCHIVE_LIMITS.maxEntryBytes + 1 })
    expect(entry).toMatchObject({ access: 'UNSUPPORTED', blockedCode: 'ARCHIVE_ENTRY_TOO_LARGE', mediaCandidate: true })
    expect(() => assertArchiveEntries([entry, metadata({}, 1)])).not.toThrow()
    expect(metadata({ uncompressedSize: DEFAULT_ARCHIVE_LIMITS.maxEntryBytes, compressedSize: 100_000 }).access)
      .toBe('AVAILABLE')
  })

  it('rejects extreme or undefined compression ratios before extraction, including hidden text', () => {
    expect(metadata({ compressedSize: 1, uncompressedSize: 1000 }).access).toBe('AVAILABLE')
    expect(metadata({ name: 'bomb.txt', compressedSize: 1, uncompressedSize: 1001 }))
      .toMatchObject({ access: 'UNSUPPORTED', blockedCode: 'ARCHIVE_LIMIT_EXCEEDED', mediaCandidate: false })
    expect(metadata({ compressedSize: 0, uncompressedSize: 1 }))
      .toMatchObject({ access: 'UNSUPPORTED', blockedCode: 'ARCHIVE_LIMIT_EXCEEDED' })
    expect(metadata({ compressedSize: 0, uncompressedSize: 0 }).access).toBe('AVAILABLE')
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects malformed declared entry size %s', (value) => {
    expect(() => metadata({ uncompressedSize: value })).toThrow(expect.objectContaining({ code: 'ARCHIVE_CORRUPTED' }))
    expect(() => metadata({ compressedSize: value })).toThrow(expect.objectContaining({ code: 'ARCHIVE_CORRUPTED' }))
  })

  it('keeps encryption separate from unsupported compression and archive validity', () => {
    expect(metadata({ encrypted: true, compressionMethod: 0 })).toMatchObject({ access: 'ENCRYPTED', encrypted: true })
    expect(metadata({ encrypted: true, compressionMethod: 8 })).toMatchObject({ access: 'ENCRYPTED', encrypted: true })
    expect(metadata({ compressionMethod: 9 })).toMatchObject({ access: 'UNSUPPORTED', blockedCode: 'ARCHIVE_UNSUPPORTED' })
    expect(metadata({ encrypted: true, compressionMethod: -1 })).toMatchObject({ access: 'UNSUPPORTED', encrypted: true })
  })
})

describe('archive logical path safety', () => {
  it('normalizes only relative path separators and redundant current-directory components', () => {
    expect(normalizeArchivePath('folder\\subfolder\\动画.gif')).toBe('folder/subfolder/动画.gif')
    expect(normalizeArchivePath('./folder//./subfolder/a.gif')).toBe('folder/subfolder/a.gif')
    expect(normalizeArchivePath('folder//')).toBe('folder/')
  })

  it.each([
    '../image.gif', 'folder/../../image.gif', 'folder\\..\\image.gif', '/absolute.gif',
    'C:\\folder\\image.gif', 'C:relative.gif', '\\\\server\\image.gif',
    'folder/C:relative.gif', 'image\u0000.gif', 'line\nimage.gif', 'tab\timage.gif',
    'image\u007f.gif', 'image\u0085.gif', 'image\u202e.gif', '', './',
  ])('rejects unsafe logical path %j', (path) => {
    expect(() => normalizeArchivePath(path)).toThrow(expect.objectContaining({ code: 'ARCHIVE_UNSUPPORTED' }))
  })

  it('does not resolve traversal even if its final result would remain relative', () => {
    expect(() => normalizeArchivePath('a/../safe.gif')).toThrow()
    const entry = metadata({ name: '../<img src=x onerror=alert(1)>.gif' })
    expect(entry).toMatchObject({ path: '[Unsafe ZIP entry 1]', access: 'UNSUPPORTED', mediaCandidate: false })
    expect(JSON.stringify(entry)).not.toContain('<img')
  })

  it('bounds raw names before normalization and counts their original lengths', () => {
    const limits = normalizeArchiveLimits({ maxPathLength: 6, maxTotalPathLength: 9 })
    expect(normalizeArchivePath('a.gif', limits)).toBe('a.gif')
    expect(() => normalizeArchivePath('././a.gif', limits)).toThrow(expect.objectContaining({ code: 'ARCHIVE_LIMIT_EXCEEDED' }))
    const entry = createArchiveEntryMetadata(input({ name: '././a.gif' }), 0, limits)
    expect(entry).toMatchObject({ path: '[Unsafe ZIP entry 1]', originalPathLength: 9, mediaCandidate: false })
    expect(() => assertArchiveEntries([entry], limits)).not.toThrow()
    expect(() => assertArchiveEntries([entry, metadata({ name: 'x' }, 1)], limits)).toThrow()
  })

  it('treats HTML-like names as plain metadata, with no URL or filesystem construction', () => {
    const name = '<b>image</b>.gif'
    expect(normalizeArchivePath(name)).toBe(name)
    expect(metadata({ name }).path).toBe(name)
  })
})

describe('archive media discoverability', () => {
  it.each(['a.gif', 'a.WEBP', 'a.png', 'a.apng', 'a.jpg', 'a.jpeg', 'a.avif', 'a.heic', 'a.heif', 'a.bmp', 'a.tif', 'a.tiff', 'a.svg', 'folder/extensionless'])(
    'includes %s without claiming its actual binary format', (name) => {
      expect(isArchiveMediaCandidate(name)).toBe(true)
    })

  it.each(['notes.txt', 'nested.zip', 'movie.mp4', '__MACOSX/a.gif', 'folder/__MACOSX/a.png', '.DS_Store', 'folder/.ds_store', 'folder/._animation.gif', 'folder/', ''])(
    'hides non-media or metadata %s without discarding archive metadata', (name) => {
      expect(isArchiveMediaCandidate(name)).toBe(false)
      if (name !== '') expect(metadata({ name }).path).toBe(name)
    })

  it('never treats a directory with an image-like name as a media item', () => {
    expect(isArchiveMediaCandidate('folder.gif', true)).toBe(false)
    expect(metadata({ name: 'folder.gif', directory: true })).toMatchObject({ directory: true, mediaCandidate: false })
  })

  it('preserves central-directory identity and path order, including duplicates', () => {
    const entries = ['z.gif', 'folder/a.png', 'z.gif'].map((name, id) => metadata({ name }, id))
    expect(entries.map(({ id, path }) => [id, path])).toEqual([[0, 'z.gif'], [1, 'folder/a.png'], [2, 'z.gif']])
  })
})
