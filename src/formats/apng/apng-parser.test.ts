import { describe, expect, it } from 'vitest'
import { APNG_LIMITS, parseAPNGFile } from './apng-parser'
import { apngFixture as fixture } from './apng-fixtures.test-support'

function chunks(data: ArrayBuffer) {
  const view = new DataView(data), result: { type: string; offset: number; length: number }[] = []
  for (let offset = 8; offset < data.byteLength;) {
    const length = view.getUint32(offset)
    result.push({ type: String.fromCharCode(...new Uint8Array(data, offset + 4, 4)), offset, length })
    offset += length + 12
  }
  return result
}

function mutate(data: ArrayBuffer, type: string, change: (view: DataView) => void, index = 0) {
  const bytes = new Uint8Array(data), chunk = chunks(data).filter((item) => item.type === type)[index]!
  change(new DataView(data, chunk.offset + 8, chunk.length))
  let crc = 0xffffffff
  for (const byte of bytes.subarray(chunk.offset + 4, chunk.offset + 8 + chunk.length)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  new DataView(data).setUint32(chunk.offset + 8 + chunk.length, (crc ^ 0xffffffff) >>> 0)
  return data
}

function withAncillary(data: ArrayBuffer, payloadBytes: number) {
  const chunk = new Uint8Array(payloadBytes + 12), view = new DataView(chunk.buffer)
  view.setUint32(0, payloadBytes)
  chunk.set([118, 112, 65, 103], 4) // Private ancillary vpAg; copied by the vendor parser.
  let crc = 0xffffffff
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0)
  const result = new Uint8Array(data.byteLength + chunk.length)
  result.set(new Uint8Array(data, 0, 33)); result.set(chunk, 33); result.set(new Uint8Array(data, 33), 33 + chunk.length)
  return result.buffer
}

describe('APNG parser adapter and generated container fixtures', () => {
  it('maps parser output to compressed AniView descriptors without mutating input', async () => {
    const data = fixture('composition.png'), before = data.slice(0)
    const animation = parseAPNGFile(data)
    expect(data).toEqual(before)
    expect(animation).toMatchObject({ width: 3, height: 2, frameCount: 8, loopCount: 0 })
    expect(animation.frames[1]).toMatchObject({ width: 1, height: 1, left: 1, top: 0, disposeOp: 0, blendOp: 0 })
    expect(animation.frames[2]?.blendOp).toBe(1)
    expect(animation.frames[3]?.disposeOp).toBe(1)
    expect(animation.frames[4]?.disposeOp).toBe(2)
    for (const frame of animation.frames) {
      expect(Object.keys(frame).sort()).toEqual(['blendOp', 'disposeOp', 'durationMs', 'height', 'imageData', 'left', 'top', 'width'])
      const image = await frame.imageData.arrayBuffer()
      expect(new Uint8Array(image, 0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(chunks(image).map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
      expect(new DataView(image).getUint32(16)).toBe(frame.width)
      expect(new DataView(image).getUint32(20)).toBe(frame.height)
    }
  })

  it('includes the default image only when fcTL precedes IDAT', () => {
    expect(parseAPNGFile(fixture('full-infinite.png'))).toMatchObject({ frameCount: 2, loopCount: 0 })
    const hidden = parseAPNGFile(fixture('hidden-default.png'))
    expect(hidden.frameCount).toBe(2)
    expect(hidden.frames[0]).toMatchObject({ width: 1, height: 1, left: 0, top: 0 })
    expect(hidden.frames[1]).toMatchObject({ width: 1, height: 1, left: 2, top: 1 })
  })

  it('preserves raw delay semantics instead of the vendor player delay clamp', () => {
    expect(parseAPNGFile(fixture('delays.png')).frames.map((frame) => frame.durationMs)).toEqual([0, 30, 1])
    expect(parseAPNGFile(fixture('full-infinite.png')).frames.map((frame) => frame.durationMs)).toEqual([20, 40])
  })

  it('preserves first PREVIOUS for the compositor and finite total plays', () => {
    expect(parseAPNGFile(fixture('first-previous.png')).frames[0]?.disposeOp).toBe(2)
    expect(parseAPNGFile(fixture('full-finite.png')).loopCount).toBe(2)
  })

  it('keeps a longer animation as compressed frame metadata', () => {
    const parsed = parseAPNGFile(fixture('long-bounded.png'))
    expect(parsed).toMatchObject({ width: 64, height: 64, frameCount: 100, loopCount: 0 })
    expect(parsed.frames.reduce((bytes, frame) => bytes + frame.imageData.size, 0)).toBeLessThan(12_000)
    expect(parsed.frames.every((frame) => frame.durationMs === 100)).toBe(true)
  })

  it('recognizes static PNG and invalid signatures as unsupported animation input', () => {
    expect(() => parseAPNGFile(fixture('static.png'))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT' }))
    const data = fixture('full-infinite.png')
    new Uint8Array(data)[0] = 0
    expect(() => parseAPNGFile(data)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT' }))
  })

  it('rejects broken CRCs, truncated chunks, impossible lengths and missing IEND', () => {
    const badCRC = fixture('full-infinite.png')
    new Uint8Array(badCRC)[45] = new Uint8Array(badCRC)[45]! ^ 1
    expect(() => parseAPNGFile(badCRC)).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
    const data = fixture('full-infinite.png')
    expect(() => parseAPNGFile(data.slice(0, -1))).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
    expect(() => parseAPNGFile(data.slice(0, -12))).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
    new DataView(data).setUint32(8, 0x7fffffff)
    expect(() => parseAPNGFile(data)).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })

  it.each([
    ['frame count', 'acTL', (view: DataView) => view.setUint32(0, 3), 0],
    ['zero frames', 'acTL', (view: DataView) => view.setUint32(0, 0), 0],
    ['frame sequence', 'fcTL', (view: DataView) => view.setUint32(0, 9), 1],
    ['data sequence', 'fdAT', (view: DataView) => view.setUint32(0, 9), 0],
    ['out-of-bounds offset', 'fcTL', (view: DataView) => view.setUint32(12, 3), 1],
    ['empty frame rectangle', 'fcTL', (view: DataView) => view.setUint32(4, 0), 1],
    ['invalid disposal', 'fcTL', (view: DataView) => view.setUint8(24, 3), 0],
    ['invalid blend', 'fcTL', (view: DataView) => view.setUint8(25, 2), 0],
    ['invalid bit depth', 'IHDR', (view: DataView) => view.setUint8(8, 3), 0],
    ['unsupported compression method', 'IHDR', (view: DataView) => view.setUint8(10, 1), 0],
  ] as const)('rejects malformed %s before vendor parsing', (_name, type, change, index) => {
    expect(() => parseAPNGFile(mutate(fixture('full-infinite.png'), type, change, index))).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })

  it('rejects a default animation frame that does not cover the whole canvas', () => {
    const data = mutate(fixture('full-infinite.png'), 'fcTL', (view) => view.setUint32(4, 1))
    expect(() => parseAPNGFile(data)).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })

  it('rejects excessive canvas dimensions and frame count before any bitmap allocation', () => {
    const dimensions = mutate(fixture('full-infinite.png'), 'IHDR', (view) => {
      view.setUint32(0, 100_000); view.setUint32(4, 100_000)
    })
    expect(() => parseAPNGFile(dimensions)).toThrow(expect.objectContaining({ code: 'OUT_OF_MEMORY' }))
    const frameCount = mutate(fixture('full-infinite.png'), 'acTL', (view) => view.setUint32(0, APNG_LIMITS.maxFrames + 1))
    expect(() => parseAPNGFile(frameCount)).toThrow(expect.objectContaining({ code: 'OUT_OF_MEMORY' }))
  })

  it('bounds aggregate advertised scanline expansion even when each frame fits', () => {
    const data = mutate(fixture('long-bounded.png'), 'IHDR', (view) => {
      view.setUint32(0, 2048); view.setUint32(4, 1024); view.setUint8(8, 16)
    })
    for (let index = 0; index < 100; index++) mutate(data, 'fcTL', (view) => {
      view.setUint32(4, 2048); view.setUint32(8, 1024); view.setUint32(12, 0); view.setUint32(16, 0)
    }, index)
    expect(() => parseAPNGFile(data)).toThrow(expect.objectContaining({ code: 'OUT_OF_MEMORY' }))
  })

  it('rejects excessive logical metadata multiplication before vendor PNG reconstruction', () => {
    // 1.5 MiB metadata is below the shared limit, but repeating it across 100
    // frames exceeds the 128 MiB logical PNG work limit despite a small input.
    const data = withAncillary(fixture('long-bounded.png'), 1536 * 1024)
    expect(data.byteLength).toBeLessThan(APNG_LIMITS.maxEncodedBytes)
    expect(() => parseAPNGFile(data)).toThrow(expect.objectContaining({ code: 'OUT_OF_MEMORY' }))
  })

  it('allows ordinary shared ancillary metadata without changing frame semantics', async () => {
    const parsed = parseAPNGFile(withAncillary(fixture('full-infinite.png'), 32))
    expect(parsed).toMatchObject({ frameCount: 2, loopCount: 0 })
    expect(parsed.frames.map((frame) => frame.durationMs)).toEqual([20, 40])
    const firstPNG = await parsed.frames[0]!.imageData.arrayBuffer()
    expect(chunks(firstPNG).map((chunk) => chunk.type)).toEqual(['IHDR', 'vpAg', 'IDAT', 'IEND'])
  })

  it('caps shared metadata even when only two animation frames are advertised', () => {
    const data = withAncillary(fixture('full-infinite.png'), APNG_LIMITS.maxSharedMetadataBytes)
    expect(() => parseAPNGFile(data)).toThrow(expect.objectContaining({ code: 'OUT_OF_MEMORY' }))
  })
})
