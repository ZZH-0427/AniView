import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseAPNGFile } from '../formats/apng/apng-parser'
import { APNGAnimationEncoder, apngDelay } from './apng-encoder'
import { crc32 } from './crc32'
import { GrowingByteWriter } from './byte-writer'
import type { CanonicalAnimationMetadata } from './model'

interface Chunk { readonly type: string; readonly data: Uint8Array; readonly crc: number }
const metadata = (frameCount = 2, playCount = 0, width = 3, height = 2): CanonicalAnimationMetadata => ({ width, height, frameCount, playCount })
function pixels(width: number, height: number, seed = 1) {
  const value = new Uint8Array(width * height * 4)
  let state = seed
  for (let i = 0; i < value.length; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; value[i] = state >>> 24 }
  return value
}
/** Test-side bitwise implementation independently checks every emitted chunk CRC. */
function referenceCRC(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunks(data: ArrayBuffer, length: number) {
  const bytes = new Uint8Array(data, 0, length), view = new DataView(data, 0, length), result: Chunk[] = []
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  let offset = 8
  while (offset < length) {
    const size = view.getUint32(offset), start = offset + 8, end = start + size
    const type = String.fromCharCode(...bytes.subarray(offset + 4, start))
    expect(end + 4).toBeLessThanOrEqual(length)
    const crc = view.getUint32(end)
    expect(crc).toBe(referenceCRC(bytes.subarray(offset + 4, end)))
    result.push({ type, data: bytes.slice(start, end), crc })
    offset = end + 4
  }
  expect(offset).toBe(length)
  return result
}
async function inflateFrames(records: readonly Chunk[], width: number, height: number) {
  const compressed: Uint8Array[][] = []
  for (const chunk of records) {
    if (chunk.type === 'fcTL') compressed.push([])
    if (chunk.type === 'IDAT' || chunk.type === 'fdAT') compressed.at(-1)!.push(chunk.data.subarray(chunk.type === 'fdAT' ? 4 : 0))
  }
  return Promise.all(compressed.map(async parts => {
    const packed = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
    let offset = 0
    for (const part of parts) { packed.set(part, offset); offset += part.byteLength }
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate'))
    const data = new Uint8Array(await new Response(stream).arrayBuffer()), rgba = new Uint8Array(width * height * 4)
    expect(data.byteLength).toBe((width * 4 + 1) * height)
    for (let row = 0; row < height; row++) {
      const start = row * (width * 4 + 1)
      expect(data[start]).toBe(0)
      rgba.set(data.subarray(start + 1, start + 1 + width * 4), row * width * 4)
    }
    return rgba
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('PNG CRC and bounded encoded byte writer', () => {
  it('matches independent published CRC32 and PNG IEND vectors', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
  it('grows only within its encoded-byte ceiling and returns the same backing allocation', () => {
    const writer = new GrowingByteWriter(20, 4)
    writer.uint8(1); writer.uint16(0x0203); writer.uint32(0x04050607); writer.append(Uint8Array.of(8, 9))
    expect([...writer.view().subarray(0, writer.byteLength)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const buffer = writer.view().buffer, result = writer.take()
    expect(result.data).toBe(buffer); expect(result.byteLength).toBe(9)
    expect(writer.capacity).toBe(0)
    const limited = new GrowingByteWriter(3)
    expect(() => limited.uint32(1)).toThrowError(expect.objectContaining({ code: 'RESOURCE_LIMIT' }))
  })
})

describe('incremental full-canvas APNG encoder', () => {
  it('writes PNG3 chunk order, full-frame SOURCE/NONE controls, monotonic sequence numbers and exact independent zlib streams', async () => {
    const meta = metadata(3, 2), encoder = await APNGAnimationEncoder.create(meta), inputs = [pixels(3, 2, 3), pixels(3, 2, 7), pixels(3, 2, 9)]
    for (const [index, rgba] of inputs.entries()) await encoder.addFrame({ index, durationMs: [20, 27, 100][index]!, rgba: rgba.buffer })
    const result = await encoder.finish(), records = chunks(result.data, result.byteLength)
    const order = records.map(c => c.type).filter((type, index, all) => index === 0 || type !== all[index - 1])
    expect(order).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'IEND'])
    expect([...records[0]!.data]).toEqual([0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0])
    expect([...records[1]!.data]).toEqual([0, 0, 0, 3, 0, 0, 0, 2])
    const sequence = records.filter(c => c.type === 'fcTL' || c.type === 'fdAT').map(c => new DataView(c.data.buffer).getUint32(0))
    expect(sequence).toEqual(Array.from({ length: sequence.length }, (_, index) => index))
    for (const c of records.filter(c => c.type === 'fcTL')) {
      const view = new DataView(c.data.buffer)
      expect([view.getUint32(4), view.getUint32(8), view.getUint32(12), view.getUint32(16), c.data[24], c.data[25]]).toEqual([3, 2, 0, 0, 0, 0])
    }
    expect(await inflateFrames(records, 3, 2)).toEqual(inputs)
    expect(result.metrics).toMatchObject({ outputBytes: result.byteLength, peakScanlineBytes: 1 })
    expect(result.data.byteLength).toBe(result.metrics.outputCapacity)
  })
  it.each([0, 1, 2])('round-trips total playCount %i through the existing AniView APNG parser', async playCount => {
    const encoder = await APNGAnimationEncoder.create(metadata(2, playCount))
    for (let index = 0; index < 2; index++) await encoder.addFrame({ index, durationMs: 250, rgba: pixels(3, 2, index + 1).buffer })
    const result = await encoder.finish(), parsed = parseAPNGFile(result.data.slice(0, result.byteLength))
    expect(parsed).toMatchObject({ width: 3, height: 2, frameCount: 2, loopCount: playCount })
    expect(parsed.frames.map(f => f.durationMs)).toEqual([250, 250])
  })
  it('preserves opaque, transparent hidden RGB, semi-alpha and soft-alpha samples byte for byte', async () => {
    const encoder = await APNGAnimationEncoder.create(metadata(1, 1, 4, 1))
    const rgba = Uint8Array.of(200, 100, 50, 255, 17, 33, 65, 0, 123, 45, 67, 128, 9, 230, 88, 17)
    await encoder.addFrame({ index: 0, durationMs: 1, rgba: rgba.buffer })
    const result = await encoder.finish()
    expect((await inflateFrames(chunks(result.data, result.byteLength), 4, 1))[0]).toEqual(rgba)
  })
  it('keeps one small scanline and drains multiple compressed fdAT chunks without accumulating a compressed-frame array', async () => {
    const encoder = await APNGAnimationEncoder.create(metadata(2, 0, 128, 128)), first = pixels(128, 128, 17), second = pixels(128, 128, 23)
    await encoder.addFrame({ index: 0, durationMs: 20, rgba: first.buffer })
    await encoder.addFrame({ index: 1, durationMs: 27, rgba: second.buffer })
    const result = await encoder.finish(), records = chunks(result.data, result.byteLength)
    expect(records.filter(c => c.type === 'fdAT').length).toBeGreaterThan(1)
    const decoded = await inflateFrames(records, 128, 128)
    expect(decoded.map((rgba, index) => rgba.every((value, offset) => value === [first, second][index]![offset]))).toEqual([true, true])
    expect(result.metrics.peakScanlineBytes).toBe(1)
    expect(result.metrics.peakCompressedChunkBytes).toBeLessThanOrEqual(65536)
    expect(result.metrics.peakCompressedFrameBytes).toBeGreaterThan(65536)
  })
  it('encodes required integer delays exactly and reports a nearest bounded fraction when needed', async () => {
    const durations = [0, 1, 10, 20, 27, 100, 250, 500, 1000], encoder = await APNGAnimationEncoder.create(metadata(durations.length))
    for (const [index, durationMs] of durations.entries()) await encoder.addFrame({ index, durationMs, rgba: pixels(3, 2, index + 1).buffer })
    const result = await encoder.finish(), parsed = parseAPNGFile(result.data.slice(0, result.byteLength))
    expect(parsed.frames.map(f => f.durationMs)).toEqual(durations)
    const [num, den] = apngDelay(655349)
    expect(num).toBeLessThanOrEqual(65535); expect(den).toBeLessThanOrEqual(65535)
    expect(Math.abs(num / den * 1000 - 655349)).toBeLessThanOrEqual(5)
    expect(apngDelay(1000 / 60)).toEqual([1, 60])
  })
  it('rejects unavailable or unconstructable CompressionStream explicitly without a fallback', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    await expect(APNGAnimationEncoder.create(metadata())).rejects.toMatchObject({ code: 'TARGET_ENCODER_UNSUPPORTED' })
    vi.stubGlobal('CompressionStream', class { constructor() { throw new TypeError('format unsupported') } })
    await expect(APNGAnimationEncoder.create(metadata())).rejects.toMatchObject({ code: 'TARGET_ENCODER_UNSUPPORTED' })
  })
  it('rejects invalid metadata/frames, premature finish, reordered frames and concurrent submission', async () => {
    await expect(APNGAnimationEncoder.create(metadata(201))).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    const encoder = await APNGAnimationEncoder.create(metadata())
    await expect(encoder.finish()).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
    await expect(encoder.addFrame({ index: 1, durationMs: 20, rgba: pixels(3, 2).buffer })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(encoder.addFrame({ index: 0, durationMs: 20, rgba: new ArrayBuffer(3) })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    const pending = encoder.addFrame({ index: 0, durationMs: 20, rgba: pixels(3, 2).buffer })
    await expect(encoder.addFrame({ index: 1, durationMs: 20, rgba: pixels(3, 2).buffer })).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
    await pending; encoder.dispose()
    await expect(encoder.finish()).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
  })
  it('discards partial output on disposal and permits a new independent encoder to succeed', async () => {
    const first = await APNGAnimationEncoder.create(metadata(1, 0, 128, 128))
    const pending = first.addFrame({ index: 0, durationMs: 20, rgba: pixels(128, 128).buffer })
    first.dispose()
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(first.finish()).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
    const next = await APNGAnimationEncoder.create(metadata(1))
    await next.addFrame({ index: 0, durationMs: 20, rgba: pixels(3, 2).buffer })
    const output = await next.finish()
    expect(output.byteLength).toBeGreaterThan(0)
    next.dispose()
    await expect(next.addFrame({ index: 1, durationMs: 20, rgba: pixels(3, 2).buffer })).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
  })
})
