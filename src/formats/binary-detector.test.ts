import { describe, expect, it, vi } from 'vitest'
import type { VirtualFile } from '../input/virtual-file'
import { BinaryFormatDetector } from './binary-detector'
import { apngFixture } from './apng/apng-fixtures.test-support'

function file(data: Uint8Array, name = 'misleading.webp'): VirtualFile {
  return { name, size: data.length, mimeType: 'image/webp', source: 'file',
    read: async (start = 0, end = data.length) => data.slice(start, end).buffer }
}

function fixture(name: string) {
  return new Uint8Array(apngFixture(name))
}

describe('binary format detection', () => {
  const detector = new BinaryFormatDetector()
  it('distinguishes APNG from static PNG with contradictory names and MIME hints', async () => {
    await expect(detector.detect(file(fixture('hidden-default.png'), 'plain.png'))).resolves.toEqual({ kind: 'apng', animated: true })
    await expect(detector.detect(file(fixture('static.png'), 'animated.apng'))).resolves.toEqual({ kind: 'png', animated: false })
  })

  it('scans chunk headers without reading PNG image payloads', async () => {
    const data = fixture('static.png'), input = file(data)
    const read = vi.fn(input.read)
    await detector.detect({ ...input, read })
    expect(read.mock.calls).toEqual([[0, 32], [8, 16], [33, 41], [62, 70]])
  })

  it('uses VP8X animation flags and RIFF/WebP evidence', async () => {
    const bytes = new Uint8Array(30)
    const text = new TextEncoder()
    bytes.set(text.encode('RIFF'), 0); bytes.set(text.encode('WEBPVP8X'), 8)
    new DataView(bytes.buffer).setUint32(4, 22, true)
    new DataView(bytes.buffer).setUint32(16, 10, true)
    bytes[20] = 2
    await expect(detector.detect(file(bytes, 'picture.png'))).resolves.toEqual({ kind: 'webp', animated: true })
    bytes[20] = 0
    await expect(detector.detect(file(bytes))).resolves.toEqual({ kind: 'webp', animated: false })
  })

  it.each([
    [[71, 73, 70, 56, 57, 97], { kind: 'gif', animated: true }],
    [[255, 216, 255, 224], { kind: 'jpeg', animated: false }],
    [[80, 75, 3, 4], { kind: 'zip' }],
    [[], { kind: 'unknown' }],
    [[1, 2, 3], { kind: 'unknown' }],
  ] as const)('identifies signature %j without implementing another decoder', async (signature, expected) => {
    await expect(detector.detect(file(new Uint8Array(signature)))).resolves.toEqual(expected)
  })

  it('rejects truncated PNG chunk boundaries rather than misclassifying as static', async () => {
    const bytes = fixture('full-infinite.png')
    new DataView(bytes.buffer).setUint32(33, 0x7fffffff)
    await expect(detector.detect(file(bytes))).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
    await expect(detector.detect(file(fixture('static.png').slice(0, -2)))).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
  })

  it('normalizes failed and short file reads and honors cancellation', async () => {
    const input = file(fixture('static.png'))
    await expect(detector.detect({ ...input, read: async () => { throw new Error('disk unavailable') } })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
    await expect(detector.detect({ ...input, read: async () => new ArrayBuffer(0) })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
    const controller = new AbortController()
    controller.abort()
    await expect(detector.detect(input, controller.signal)).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
  })
})
