import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { ArchiveEngine, archiveFailure, boundedBlobWriter } from './archive-engine'
import { DEFAULT_ARCHIVE_LIMITS, normalizeArchiveLimits } from './archive-policy'

const fixtures = import.meta.glob<string>('../../tests/fixtures/zip/*.zip', { eager: true, query: '?url&inline', import: 'default' })
const fixture = async (name: string) => {
  const url = fixtures[`../../tests/fixtures/zip/${name}`]!
  return new Blob([Uint8Array.from(atob(url.split(',')[1]!), character => character.charCodeAt(0))])
}
const open = async (name: string) => ArchiveEngine.open(await fixture(name), DEFAULT_ARCHIVE_LIMITS)

describe('actual zip.js metadata and lazy extraction', () => {
  it('opens valid empty and no-media ZIPs without calling them corrupted', async () => {
    for (const [name, count] of [['empty.zip', 0], ['no-media.zip', 2]] as const) {
      const engine = await open(name)
      expect(engine.metrics).toMatchObject({ entryCount: count, mediaCount: 0, extractions: 0 })
      await engine.close()
    }
  })

  it('preserves central order, directories and nested paths but filters only discoverability', async () => {
    const engine = await open('mixed.zip')
    expect(engine.metadata.map(entry => entry.path)).toEqual(['nested/', 'first.gif', 'nested/second.webp', 'nested/third.png', '__MACOSX/._first.gif', '.DS_Store', 'notes.txt'])
    expect(engine.metadata.filter(entry => entry.mediaCandidate).map(entry => entry.id)).toEqual([1, 2, 3])
    expect(engine.metrics).toMatchObject({ entryCount: 7, mediaCount: 3, totalDeclaredBytes: 481, extractions: 0 })
    const blob = await engine.extract(2)
    expect(blob.size).toBe(140)
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 4))).toBe('RIFF')
    expect(engine.metrics.extractions).toBe(1)
    await expect(engine.extract(0)).rejects.toMatchObject({ code: 'ARCHIVE_UNSUPPORTED' })
    await engine.close()
  })

  it('performs zero data extractions for ten metadata entries, then only entry four', async () => {
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false })
    for (let i = 0; i < 10; i++) await writer.add(`${i}.gif`, new Uint8ArrayReader(new Uint8Array([i])), { level: 0 })
    const engine = await ArchiveEngine.open(await writer.close(), DEFAULT_ARCHIVE_LIMITS)
    expect(engine.metrics).toMatchObject({ entryCount: 10, extractions: 0 })
    expect([...new Uint8Array(await (await engine.extract(4)).arrayBuffer())]).toEqual([4])
    expect(engine.metrics.extractions).toBe(1)
    await engine.close()
  })

  it('opens 1008 lightweight entries metadata-first and enforces the count limit before extraction', async () => {
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false })
    for (let id = 0; id < 1008; id++) await writer.add(`nested/${id}.${id < 1000 ? 'txt' : 'gif'}`,
      new Uint8ArrayReader(new Uint8Array([id % 256])), { level: 0, useWebWorkers: false })
    const blob = await writer.close()
    const engine = await ArchiveEngine.open(blob, DEFAULT_ARCHIVE_LIMITS)
    expect(engine.metrics).toMatchObject({ entryCount: 1008, mediaCount: 8, extractions: 0 })
    expect(new Uint8Array(await (await engine.extract(1007)).arrayBuffer())[0]).toBe(1007 % 256)
    expect(engine.metrics.extractions).toBe(1)
    await engine.close()
    await expect(ArchiveEngine.open(blob, normalizeArchiveLimits({ maxEntries: 1000 })))
      .rejects.toMatchObject({ code: 'ARCHIVE_LIMIT_EXCEEDED' })
  })

  it.each(['single-gif.zip', 'single-webp.zip', 'single-apng.zip', 'zip64.zip'])('extracts a real %s fixture', async name => {
    const engine = await open(name)
    expect(engine.metrics.extractions).toBe(0)
    expect((await engine.extract(0)).size).toBe(engine.metadata[0]?.uncompressedSize)
    await engine.close()
  })

  it('retains wrong extensions and lets binary detection remain authoritative', async () => {
    const engine = await open('wrong-extension.zip')
    expect(engine.metadata.map(entry => entry.mediaCandidate)).toEqual([true, true, true])
    expect(new TextDecoder().decode((await (await engine.extract(0)).arrayBuffer()).slice(0, 6))).toBe('GIF89a')
    await engine.close()
  })

  it('keeps unsafe path entries in metadata without raw names or media references', async () => {
    const engine = await open('unsafe-paths.zip')
    expect(engine.metrics).toMatchObject({ entryCount: 4, mediaCount: 0, extractions: 0 })
    expect(engine.metadata.every(entry => entry.path.startsWith('[Unsafe ZIP entry'))).toBe(true)
    await expect(engine.extract(0)).rejects.toMatchObject({ code: 'ARCHIVE_UNSUPPORTED' })
    expect(engine.metrics.extractions).toBe(0)
    await engine.close()
  })
})

describe('ZIP encryption and integrity classification', () => {
  it.each(['encrypted-zipcrypto.zip', 'encrypted-aes.zip'])('keeps %s encrypted, supports a transient API password and verifies content', async name => {
    const engine = await open(name)
    expect(engine.metadata[0]).toMatchObject({ encrypted: true, access: 'ENCRYPTED', mediaCandidate: true })
    await expect(engine.extract(0)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    expect(engine.metrics.extractions).toBe(0)
    await expect(engine.extract(0, { password: 'wrong' })).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    const blob = await engine.extract(0, { password: 'AniView-test' })
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 6))).toBe('GIF89a')
    await engine.close()
  })

  it('does not let encrypted entries block public siblings', async () => {
    const engine = await open('encrypted-mixed.zip')
    expect(engine.metadata.map(entry => entry.access)).toEqual(['AVAILABLE', 'ENCRYPTED', 'ENCRYPTED', 'AVAILABLE'])
    expect((await engine.extract(0)).size).toBe(114)
    await expect(engine.extract(1)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    expect((await engine.extract(3)).size).toBe(114)
    await engine.close()
  })

  it('rejects a changed stored payload via CRC rather than reporting unsupported', async () => {
    const engine = await open('bad-crc.zip')
    await expect(engine.extract(0)).rejects.toMatchObject({ code: 'ARCHIVE_CORRUPTED' })
    await engine.close()
  })

  it.each(['corrupt.zip', 'truncated.zip'])('rejects damaged structure in %s', async name => {
    await expect(open(name)).rejects.toMatchObject({ code: 'ARCHIVE_CORRUPTED' })
  })

  it('rejects a renamed non-ZIP using parser validation', async () => {
    await expect(ArchiveEngine.open(new Blob(['not a ZIP']), DEFAULT_ARCHIVE_LIMITS)).rejects.toMatchObject({ code: 'ARCHIVE_INVALID' })
  })

  it('classifies unsupported methods separately and rejects before getData', async () => {
    const engine = await open('unsupported-compression.zip')
    expect(engine.metadata[0]?.access).toBe('UNSUPPORTED')
    await expect(engine.extract(0)).rejects.toMatchObject({ code: 'ARCHIVE_UNSUPPORTED' })
    expect(engine.metrics.extractions).toBe(0)
    await engine.close()
  })
})

describe('archive limits, bounded output and lifetime', () => {
  it.each([['oversize-declared.zip', 'ARCHIVE_ENTRY_TOO_LARGE'], ['ratio-limit.zip', 'ARCHIVE_LIMIT_EXCEEDED']] as const)('blocks %s using metadata before extraction', async (name, code) => {
    const engine = await open(name)
    await expect(engine.extract(0)).rejects.toMatchObject({ code })
    expect(engine.metrics.extractions).toBe(0)
    await engine.close()
  })

  it('checks file size, entry count and total declared size without extracting', async () => {
    const blob = await fixture('mixed.zip')
    for (const limits of [{ maxArchiveBytes: blob.size - 1 }, { maxEntries: 2 }, { maxTotalBytes: 254 }, { maxTotalPathLength: 8 }]) {
      await expect(ArchiveEngine.open(blob, normalizeArchiveLimits(limits))).rejects.toMatchObject({ code: 'ARCHIVE_LIMIT_EXCEEDED' })
    }
  })

  it('rejects an oversized central-directory read before vendor metadata allocation', async () => {
    await expect(ArchiveEngine.open(await fixture('mixed.zip'), normalizeArchiveLimits({ maxDirectoryBytes: 32 })))
      .rejects.toMatchObject({ code: 'ARCHIVE_LIMIT_EXCEEDED' })
  })

  it('checks actual output before retaining an oversize chunk or forged declared size', async () => {
    const big = boundedBlobWriter(4, 10).writable.getWriter()
    await big.write(new Uint8Array(3))
    await expect(big.write(new Uint8Array(2))).rejects.toMatchObject({ code: 'ARCHIVE_ENTRY_TOO_LARGE' })
    const forged = boundedBlobWriter(10, 4).writable.getWriter()
    await expect(forged.write(new Uint8Array(5))).rejects.toMatchObject({ code: 'ARCHIVE_CORRUPTED' })
    const short = boundedBlobWriter(10, 4)
    await short.writable.getWriter().write(new Uint8Array(3))
    expect(() => short.blob()).toThrow(expect.objectContaining({ code: 'ARCHIVE_CORRUPTED' }))
  })

  it('aborts before extraction and drops the reader entries on idempotent close', async () => {
    const engine = await open('single-gif.zip')
    const controller = new AbortController(); controller.abort()
    await expect(engine.extract(0, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(engine.metrics.extractions).toBe(0)
    await engine.close(); await engine.close()
    await expect(engine.extract(0)).rejects.toMatchObject({ code: 'ARCHIVE_CLOSED' })
  })

  it('checks abort inside the bounded writer and discards incomplete chunks', async () => {
    const controller = new AbortController()
    const output = boundedBlobWriter(10, 4, controller.signal)
    const writer = output.writable.getWriter()
    await writer.write(new Uint8Array(2))
    controller.abort()
    await expect(writer.write(new Uint8Array(2))).rejects.toMatchObject({ name: 'AbortError' })
    expect(() => output.blob()).toThrow(expect.objectContaining({ name: 'AbortError' }))
  })

  it('maps vendor failures to stable categories without leaking raw messages', () => {
    expect(archiveFailure(new Error('Invalid password'))).toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    expect(archiveFailure(new Error('unexpected bytes'))).toMatchObject({ code: 'ARCHIVE_CORRUPTED' })
    expect(archiveFailure(new RangeError())).toMatchObject({ code: 'OUT_OF_MEMORY' })
  })
})

