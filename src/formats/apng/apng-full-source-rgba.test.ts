import { afterEach, describe, expect, it, vi } from 'vitest'
import { APNGAnimationEncoder } from '../../conversion/apng-encoder'
import { crc32 } from '../../conversion/crc32'
import { parseAPNGFile } from './apng-parser'
import type { APNGFrameDescriptor } from './apng-parser'
import { readFullSourceRGBA } from './apng-full-source-rgba'

function frame(blob: Blob, width = 3, height = 2): APNGFrameDescriptor {
  return { imageData: blob, width, height, left: 0, top: 0, blendOp: 0, disposeOp: 0, durationMs: 27 }
}
function chunk(type: string, data = new Uint8Array(0)) {
  const value = new Uint8Array(data.length + 12), view = new DataView(value.buffer)
  view.setUint32(0, data.length)
  value.set(new TextEncoder().encode(type), 4); value.set(data, 8)
  view.setUint32(value.length - 4, crc32(value, 4, value.length - 4))
  return value
}
async function png(raw: Uint8Array<ArrayBuffer>, width = 3, height = 2,
  options: { depth?: number; color?: number; interlace?: number; ancillary?: boolean } = {}) {
  const header = new Uint8Array(13), view = new DataView(header.buffer)
  view.setUint32(0, width); view.setUint32(4, height)
  header[8] = options.depth ?? 8; header[9] = options.color ?? 6; header[12] = options.interlace ?? 0
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer())
  return new Blob([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', header),
    ...(options.ancillary ? [chunk('gAMA', Uint8Array.of(0, 1, 0x86, 0xa0))] : []), chunk('IDAT', compressed), chunk('IEND')])
}
function filtered(rgba: Uint8Array<ArrayBuffer>, width: number, height: number) {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let row = 0; row < height; row++) raw.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), row * (width * 4 + 1) + 1)
  return raw
}
function pixels(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4)
  let seed = 1234567
  for (let i = 0; i < rgba.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; rgba[i] = seed >>> 24 }
  return rgba
}
afterEach(() => vi.unstubAllGlobals())

describe('opt-in full SOURCE/NONE APNG RGBA extraction', () => {
  it('reads writer → existing parser frame blobs with arbitrary straight alpha and hidden RGB exactly', async () => {
    const width = 6, height = 2, rgba = pixels(width, height)
    rgba.set([200, 100, 50, 255, 17, 33, 65, 0, 123, 45, 67, 128, 9, 230, 88, 17])
    const encoder = await APNGAnimationEncoder.create({ width, height, frameCount: 2, playCount: 2 })
    for (let index = 0; index < 2; index++) await encoder.addFrame({ index, durationMs: 27, rgba: rgba.buffer })
    const encoded = await encoder.finish(), parsed = parseAPNGFile(encoded.data.slice(0, encoded.byteLength))
    for (const source of parsed.frames) {
      const result = await readFullSourceRGBA(source, width, height)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect([...new Uint8Array(result!)]).toEqual([...rgba])
    }
  })

  it('streams across compressed chunks and scanline boundaries without accumulating a decoded scanline image', async () => {
    const width = 307, height = 97, rgba = pixels(width, height)
    const source = frame(await png(filtered(rgba, width, height), width, height), width, height)
    // A full Response.arrayBuffer decode/readback shortcut is deliberately unavailable.
    vi.stubGlobal('Response', class { constructor() { throw new Error('No full decoded response buffer') } })
    const result = await readFullSourceRGBA(source, width, height)
    expect(result?.byteLength).toBe(width * height * 4)
    expect(new Uint8Array(result!).every((value, index) => value === rgba[index])).toBe(true)
  })

  it.each([
    { left: 1 }, { top: 1 }, { width: 2 }, { height: 1 },
    { blendOp: 1 as const }, { disposeOp: 1 as const }, { disposeOp: 2 as const },
  ])('returns undefined for composition-dependent descriptors: %j', async difference => {
    const source = frame(await png(new Uint8Array(26)))
    await expect(readFullSourceRGBA({ ...source, ...difference }, 3, 2)).resolves.toBeUndefined()
  })

  it.each([{ depth: 16 }, { color: 2 }, { interlace: 1 }, { ancillary: true }])(
    'leaves other PNG or color-management features to Canvas: %j', async options => {
      await expect(readFullSourceRGBA(frame(await png(new Uint8Array(26), 3, 2, options)), 3, 2)).resolves.toBeUndefined()
    },
  )

  it.each([0, 13])('declines any nonzero row filter without implementing PNG unfiltering (offset %i)', async offset => {
    const raw = new Uint8Array(26); raw[offset] = 1
    const source = frame(await png(raw))
    await expect(readFullSourceRGBA(source, 3, 2)).resolves.toBeUndefined()
  })

  it.each([25, 27])('rejects a valid zlib stream with incorrect decoded scanline length %i', async length => {
    const source = frame(await png(new Uint8Array(length)))
    await expect(readFullSourceRGBA(source, 3, 2)).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
  })

  it('rejects truncated chunks, trailing content and mismatched IHDR dimensions', async () => {
    const original = await png(new Uint8Array(26)), data = new Uint8Array(await original.arrayBuffer())
    const badLength = data.slice(); new DataView(badLength.buffer).setUint32(33, 0x7fffffff)
    for (const invalid of [new Blob([data.subarray(0, data.length - 1)]), new Blob([badLength]), new Blob([data, Uint8Array.of(0)])]) {
      await expect(readFullSourceRGBA(frame(invalid), 3, 2)).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
    }
    await expect(readFullSourceRGBA(frame(await png(new Uint8Array(26), 2, 3)), 3, 2)).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
  })

  it('rechecks IDAT CRC while feeding compressed data and rejects a valid stream with a wrong CRC', async () => {
    const data = new Uint8Array(await (await png(new Uint8Array(26))).arrayBuffer())
    const length = new DataView(data.buffer).getUint32(33)
    data[33 + 8 + length] = data[33 + 8 + length]! ^ 1
    await expect(readFullSourceRGBA(frame(new Blob([data])), 3, 2)).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
  })

  it('returns undefined when native deflate decompression is unavailable and preserves the Canvas fallback', async () => {
    const source = frame(await png(new Uint8Array(26)))
    vi.stubGlobal('DecompressionStream', undefined)
    await expect(readFullSourceRGBA(source, 3, 2)).resolves.toBeUndefined()
    vi.stubGlobal('DecompressionStream', class { constructor() { throw new TypeError('Unsupported format') } })
    await expect(readFullSourceRGBA(source, 3, 2)).resolves.toBeUndefined()
  })
})
