import { describe, expect, it, vi } from 'vitest'
import { BinaryFormatDetector } from '../formats/binary-detector'
import { apngFixture } from '../formats/apng/apng-fixtures.test-support'
import { staticFixture } from '../formats/static/static-fixtures.test-support'
import type { VirtualFile } from '../input/virtual-file'
import { CREATION_DETECTION_PREFIX_BYTES, detectCreationSource } from './source-detection'

function source(data: ArrayBuffer, name = 'misleading.jpg') {
  const read = vi.fn(async (start = 0, end = data.byteLength) => data.slice(start, end))
  const file: VirtualFile = { name, size: data.byteLength, mimeType: 'image/jpeg', source: 'gallery', read }
  return { file, read }
}
function pngWithLargeChunk(animated: boolean) {
  const length = CREATION_DETECTION_PREFIX_BYTES + 100
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer)
  const chunk = (offset: number, type: string, size: number) => {
    view.setUint32(offset, size); bytes.set(new TextEncoder().encode(type), offset + 4)
  }
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  chunk(8, 'IHDR', 13)
  // This metadata-only fixture isolates header traversal; the detector does not
  // validate compressed pixels or CRC, and native decoding is not under test.
  const late = length - (animated ? 32 : 12)
  chunk(33, animated ? 'tEXt' : 'IDAT', late - 45)
  if (animated) { chunk(late, 'acTL', 8); view.setUint32(late + 8, 2) }
  chunk(length - 12, 'IEND', 0)
  return bytes.buffer
}

describe('bounded creation source detection', () => {
  it('reduces four small-PNG provider reads to one without changing authoritative detection', async () => {
    const plain = source(apngFixture('static.png')), cached = source(apngFixture('static.png'))
    const expected = await new BinaryFormatDetector().detect(plain.file)
    expect(plain.read).toHaveBeenCalledTimes(4)
    await expect(detectCreationSource(cached.file)).resolves.toEqual(expected)
    expect(cached.read.mock.calls).toEqual([[0, cached.file.size]])
  })
  it.each([['quadrants.jpg', 'jpeg'], ['quadrants.png', 'png'], ['quadrants.webp', 'webp']] as const)(
    'identifies %s from bytes using one bounded prefix', async (fixture, kind) => {
      const { file, read } = source(staticFixture(fixture))
      await expect(detectCreationSource(file)).resolves.toEqual({ kind, animated: false })
      expect(read).toHaveBeenCalledOnce()
      expect(read.mock.calls[0]).toEqual([0, Math.min(file.size, CREATION_DETECTION_PREFIX_BYTES)])
    },
  )
  it('reads a large PNG prefix and late IEND header, not the entire encoded image', async () => {
    const { file, read } = source(pngWithLargeChunk(false))
    await expect(detectCreationSource(file)).resolves.toEqual({ kind: 'png', animated: false })
    expect(read.mock.calls).toEqual([[0, CREATION_DETECTION_PREFIX_BYTES], [file.size - 12, file.size - 4]])
    expect(read.mock.calls.every(([start, end]) => end! - start! <= CREATION_DETECTION_PREFIX_BYTES)).toBe(true)
  })
  it('still identifies APNG metadata beyond the cached prefix', async () => {
    const { file, read } = source(pngWithLargeChunk(true), 'still-image.png')
    await expect(detectCreationSource(file)).resolves.toEqual({ kind: 'apng', animated: true })
    expect(read.mock.calls).toEqual([[0, CREATION_DETECTION_PREFIX_BYTES], [file.size - 32, file.size - 24]])
  })
  it('identifies real APNG and GIF as animated despite static-looking names', async () => {
    await expect(detectCreationSource(source(apngFixture('full-infinite.png'), 'photo.jpg').file)).resolves.toEqual({ kind: 'apng', animated: true })
    await expect(detectCreationSource(source(new Uint8Array([71,73,70,56,57,97]).buffer, 'photo.png').file)).resolves.toEqual({ kind: 'gif', animated: true })
  })
  it('preserves WebP animation flags without trusting the MIME hint', async () => {
    const bytes = new Uint8Array(30), view = new DataView(bytes.buffer)
    bytes.set(new TextEncoder().encode('RIFF'), 0); bytes.set(new TextEncoder().encode('WEBPVP8X'), 8)
    view.setUint32(4, 22, true); view.setUint32(16, 10, true); bytes[20] = 2
    await expect(detectCreationSource(source(bytes.buffer, 'plain.png').file)).resolves.toEqual({ kind: 'webp', animated: true })
  })
  it('preserves corrupt-PNG errors rather than accepting a cached valid-looking header', async () => {
    const data = apngFixture('static.png')
    new DataView(data).setUint32(33, 0x7fffffff)
    await expect(detectCreationSource(source(data).file)).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
  })
  it('rejects short prefix reads even when a JPEG signature fits in the returned bytes', async () => {
    const { file } = source(new ArrayBuffer(64))
    await expect(detectCreationSource({ ...file, read: async () => new Uint8Array([255,216,255]).buffer })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
  })
  it('rejects short late-header reads and normalizes failed provider reads', async () => {
    const { file } = source(pngWithLargeChunk(false))
    await expect(detectCreationSource({ ...file, read: async (start, end) => start ? new ArrayBuffer(1) : file.read(start, end) })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
    await expect(detectCreationSource({ ...file, read: async () => { throw new Error('provider unavailable') } })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
  })
  it('honors cancellation before and during prefix I/O', async () => {
    const { file, read } = source(staticFixture('quadrants.png')), before = new AbortController()
    before.abort()
    await expect(detectCreationSource(file, undefined, before.signal)).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
    expect(read).not.toHaveBeenCalled()
    const during = new AbortController()
    await expect(detectCreationSource({ ...file, read: async (start, end) => { during.abort(); return file.read(start, end) } }, undefined, during.signal)).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
  })
  it('does not retain a cross-call cache or release caller-owned sources', async () => {
    const { file, read } = source(staticFixture('quadrants.png')), release = vi.fn(async () => {})
    await detectCreationSource({ ...file, release }); await detectCreationSource({ ...file, release })
    expect(read).toHaveBeenCalledTimes(2)
    expect(release).not.toHaveBeenCalled()
  })
  it('keeps injected readless detectors free of provider reads and passes the same metadata', async () => {
    const { file, read } = source(staticFixture('quadrants.png'))
    const detector = { detect: vi.fn(async (input: VirtualFile) => {
      expect(input.name).toBe(file.name); expect(input.size).toBe(file.size); expect(input.mimeType).toBe(file.mimeType)
      return { kind: 'png', animated: false } as const
    }) }
    await expect(detectCreationSource(file, detector)).resolves.toEqual({ kind: 'png', animated: false })
    expect(read).not.toHaveBeenCalled()
  })
})
