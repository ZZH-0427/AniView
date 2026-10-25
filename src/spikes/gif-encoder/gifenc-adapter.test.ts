import { describe, expect, it } from 'vitest'
import { readGIF } from '../../formats/gif/gif-reader'
import { decodeGIFFrame } from '../../formats/gif/gif-frame'
import { GIFCompositor } from '../../formats/gif/gif-compositor'
import { normalizeGifFrameDuration } from '../../formats/gif/gif-timing'
import { GifencWriter, quantizeGifFrame } from './gifenc-adapter'
import { resolveEncodeOptions, type EncodeOptions } from './model'

const red = [255, 0, 0, 255], green = [0, 255, 0, 255], clear = [0, 0, 0, 0]
function encode(frames: readonly number[][], options: Partial<EncodeOptions> = {}) {
  const resolved = resolveEncodeOptions(options), writer = new GifencWriter(resolved)
  for (const values of frames) writer.write(quantizeGifFrame(new Uint8ClampedArray(values), resolved.colors, resolved.alphaThreshold), values.length / 4, 1)
  const result = writer.finish()
  const parsed = readGIF(result.data.slice(0, result.byteLength)), compositor = new GIFCompositor(parsed.width, parsed.height)
  return { result, parsed, pixels: parsed.frames.map((frame, i) => Array.from(new Uint8Array(compositor.compose(frame, target => decodeGIFFrame(parsed, i, target))))) }
}

describe('isolated gifenc adapter round-trip through the unchanged AniView decoder', () => {
  it('encodes two ordered solid frames with GIF89a header and correct geometry', () => {
    const { result, parsed, pixels } = encode([[...red, ...red], [...green, ...green]])
    expect(new TextDecoder().decode(new Uint8Array(result.data, 0, 6))).toBe('GIF89a')
    expect([parsed.width, parsed.height, parsed.frames.length]).toEqual([2, 1, 2])
    expect(pixels).toEqual([[...red, ...red], [...green, ...green]])
  })
  it.each([20, 100, 250, 500, 1000, 25, 24, 655350])('rounds requested %sms to centiseconds', delay => {
    const { parsed } = encode([red], { frameDurationMs: delay })
    expect(parsed.frames[0]!.delay).toBe(Math.round(delay / 10))
    expect(normalizeGifFrameDuration(parsed.frames[0]!.delay)).toBe(Math.round(delay / 10) * 10)
  })
  it.each([
    [{ kind: 'forever' }, 0, 0], [{ kind: 'once' }, null, 1],
    [{ kind: 'repeat', repeats: 1 }, 1, 2], [{ kind: 'repeat', repeats: 3 }, 3, 4],
  ] as const)('normalizes loop policy %o into repeat metadata and total plays', (loop, repeat, plays) => {
    const { parsed } = encode([red, green], { loop })
    expect(parsed.reader.loopCount()).toBe(repeat)
    expect(parsed.loopCount).toBe(plays)
  })
  it('uses a local palette after the first frame and clears transparent areas between frames', () => {
    const { parsed, pixels } = encode([[...red, ...clear], [...clear, ...green]])
    expect(parsed.reader.frameInfo(0).has_local_palette).toBe(false)
    expect(parsed.reader.frameInfo(1).has_local_palette).toBe(true)
    expect(parsed.frames.every(frame => frame.disposal === 2 && frame.transparent === 0)).toBe(true)
    expect(pixels).toEqual([[...red, ...clear], [...clear, ...green]])
  })
  it('uses the exact alpha threshold and never maps an opaque black to transparency', () => {
    const { pixels } = encode([[0, 0, 0, 255, 255, 0, 0, 127, 0, 255, 0, 128]])
    expect(pixels[0]).toEqual([0, 0, 0, 255, ...clear, ...green])
  })
  it('supports an entirely transparent frame without invoking a malformed empty quantizer', () => {
    expect(encode([[...clear, ...clear], [...red, ...clear]]).pixels).toEqual([[...clear, ...clear], [...red, ...clear]])
  })
  it.each([64, 128, 256] as const)('reserves one of %s colors and produces bounded palette indices', colors => {
    const rgba = new Uint8ClampedArray(512 * 4)
    for (let i = 0; i < 512; i++) rgba.set([i % 256, (i * 7) % 256, (i * 11) % 256, i % 3 ? 255 : 0], i * 4)
    const { palette, indexed } = quantizeGifFrame(rgba, colors, 127)
    expect(palette.length).toBeLessThanOrEqual(colors)
    expect(Math.max(...indexed)).toBeLessThan(palette.length)
    expect(indexed.every((value, i) => (value === 0) === (rgba[i * 4 + 3]! <= 127))).toBe(true)
  })
  it('returns the internal capacity allocation plus exact encoded range without bytes() copies', () => {
    const { result } = encode([red, green])
    expect(result.capacity).toBe(result.data.byteLength)
    expect(result.byteLength).toBeLessThan(result.capacity)
    const moved = structuredClone(result, { transfer: [result.data] })
    expect(result.data.byteLength).toBe(0)
    expect(readGIF(moved.data.slice(0, moved.byteLength)).frames.length).toBe(2)
  })
  it('rejects an RGBA subview that upstream would incorrectly read beyond', () => {
    expect(() => quantizeGifFrame(new Uint8ClampedArray(12).subarray(4, 8), 256, 127)).toThrow(expect.objectContaining({ code: 'QUANTIZATION_FAILED' }))
  })
  it('drops encoder references on disposal and forbids writes after finishing', () => {
    const writer = new GifencWriter(resolveEncodeOptions())
    writer.dispose()
    expect(() => writer.write(quantizeGifFrame(new Uint8ClampedArray(red), 256, 127), 1, 1)).toThrow(expect.objectContaining({ code: 'ENCODING_FAILED' }))
    expect(() => writer.finish()).toThrow(expect.objectContaining({ code: 'ENCODING_FAILED' }))
  })
})
