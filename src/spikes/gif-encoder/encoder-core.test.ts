import { afterEach, describe, expect, it, vi } from 'vitest'
import { staticFixture } from '../../formats/static/static-fixtures.test-support'
import { readGIF } from '../../formats/gif/gif-reader'
import { decodeGIFFrame } from '../../formats/gif/gif-frame'
import { GIFCompositor } from '../../formats/gif/gif-compositor'
import apng from '../../../tests/fixtures/apng/composition.png?inline'
import gif from '../../../tests/fixtures/gif/previous.gif?inline'
import webp from '../../../tests/fixtures/validation/viewer/long.webp?inline'
import { runEncoding } from './encoder-core'
import { EncodeError, resolveEncodeOptions, type EncodeProgress } from './model'

const unpack = (uri: string) => Uint8Array.from(atob(uri.split(',')[1]!), c => c.charCodeAt(0)).buffer
const red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255], clear = [0, 0, 0, 0]
class Bitmap implements ImageBitmap {
  constructor(readonly width: number, readonly height: number, readonly color = red) {}
  close = vi.fn()
}
class Canvas {
  private values: Uint8ClampedArray
  readonly clearRect = vi.fn(() => this.values.fill(0))
  readonly drawImage = vi.fn((bitmap: Bitmap, left: number, top: number) => {
    for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) this.values.set(bitmap.color, ((top + y) * this.width + left + x) * 4)
  })
  readonly getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(this.values) }))
  constructor(public width: number, public height: number) { this.values = new Uint8ClampedArray(width * height * 4); canvases.push(this) }
  getContext() { return this }
}
let canvases: Canvas[] = []
const hooks = () => ({ progress: vi.fn<(p: EncodeProgress) => void>(), checkpoint: vi.fn(async () => {}) })
function native(bitmaps: Bitmap[]) {
  let cursor = 0
  const create = vi.fn(async () => {
    const bitmap = bitmaps[cursor++]
    if (!bitmap) throw new Error('Unexpected native decode')
    return bitmap
  })
  vi.stubGlobal('createImageBitmap', create)
  vi.stubGlobal('OffscreenCanvas', Canvas)
  return create
}
function decoded(data: ArrayBuffer, length: number) {
  const parsed = readGIF(data.slice(0, length)), compositor = new GIFCompositor(parsed.width, parsed.height)
  return { parsed, pixels: parsed.frames.map((frame, index) => Array.from(new Uint8Array(compositor.compose(frame, target => decodeGIFFrame(parsed, index, target))))) }
}
afterEach(() => { canvases = []; vi.unstubAllGlobals() })

describe('sequential static GIF Worker engine', () => {
  it('scans and then encodes in exact source order without concurrent native bitmaps', async () => {
    const colors = [red, green, blue, red, green, blue, red, green, blue, red]
    const bitmaps = [...colors, ...colors].map(color => new Bitmap(2, 1, color))
    native(bitmaps)
    const read = vi.fn<(index: number) => Promise<ArrayBuffer>>(async () => staticFixture('quadrants.png'))
    const result = await runEncoding(10, read, resolveEncodeOptions(), hooks())
    expect(read.mock.calls.map(call => call[0])).toEqual([...Array.from({ length: 10 }, (_, i) => i), ...Array.from({ length: 10 }, (_, i) => i)])
    expect(decoded(result.data, result.byteLength).pixels).toEqual(colors.map(color => [...color, ...color]))
    expect(result.metrics).toMatchObject({ peakBitmaps: 1, peakRgbaFrames: 1, peakFrameBytes: 8, width: 2, height: 1, frameCount: 10 })
    expect(bitmaps.every(bitmap => bitmap.close.mock.calls.length === 1)).toBe(true)
    expect(canvases).toHaveLength(1)
    expect(canvases[0]!.clearRect).toHaveBeenCalledTimes(10)
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([1, 1])
  })
  it('centers unequal native dimensions on maximum width/height with transparent padding and no scaling', async () => {
    const dimensions = [[1, 3], [4, 1]] as const
    const bitmaps = [...dimensions, ...dimensions].map(([w, h], i) => new Bitmap(w, h, i % 2 ? green : red))
    native(bitmaps)
    const result = await runEncoding(2, async () => staticFixture('quadrants.png'), resolveEncodeOptions(), hooks())
    const { parsed, pixels } = decoded(result.data, result.byteLength)
    expect([parsed.width, parsed.height]).toEqual([4, 3])
    expect(pixels[0]).toEqual([...clear, ...red, ...clear, ...clear, ...clear, ...red, ...clear, ...clear, ...clear, ...red, ...clear, ...clear])
    expect(pixels[1]).toEqual([...clear, ...clear, ...clear, ...clear, ...green, ...green, ...green, ...green, ...clear, ...clear, ...clear, ...clear])
    expect(canvases[0]!.drawImage.mock.calls.map(call => call.slice(1))).toEqual([[1, 0], [0, 1]])
  })
  it('uses EXIF-oriented native dimensions rather than encoded JPEG dimensions', async () => {
    native([new Bitmap(20, 40), new Bitmap(20, 40)])
    const result = await runEncoding(1, async () => staticFixture('orientation-6.jpg'), resolveEncodeOptions(), hooks())
    expect([result.metrics.width, result.metrics.height]).toEqual([20, 40])
  })
  it.each(['quadrants.jpg', 'quadrants.png', 'quadrants.webp'])('accepts binary static format %s', async name => {
    const create = native([new Bitmap(2, 1), new Bitmap(2, 1)])
    const result = await runEncoding(1, async () => staticFixture(name), resolveEncodeOptions(), hooks())
    expect(result.metrics.frameCount).toBe(1)
    expect(create).toHaveBeenCalledTimes(2)
  })
  it('mixes PNG+JPEG+WebP without extension or MIME authority', async () => {
    native(Array.from({ length: 6 }, () => new Bitmap(2, 1)))
    const files = ['quadrants.png', 'quadrants.jpg', 'quadrants.webp']
    expect((await runEncoding(3, async i => staticFixture(files[i]!), resolveEncodeOptions(), hooks())).metrics.frameCount).toBe(3)
  })
  it.each([['GIF', gif], ['APNG', apng], ['animated WebP', webp]])('rejects %s rather than taking its first frame', async (_kind, encoded) => {
    const create = native([])
    await expect(runEncoding(1, async () => unpack(encoded), resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'ANIMATED_INPUT' })
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects corrupt native input and unsupported signatures distinctly', async () => {
    const create = native([])
    await expect(runEncoding(1, async () => staticFixture('corrupt.jpg'), resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    await expect(runEncoding(1, async () => new ArrayBuffer(4), resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'UNSUPPORTED_INPUT' })
    expect(create).not.toHaveBeenCalled()
  })
  it('normalizes native decode rejection and read failure separately', async () => {
    native([])
    await expect(runEncoding(1, async () => staticFixture('quadrants.png'), resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    await expect(runEncoding(1, async () => { throw new Error('read'); }, resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
  })
  it('rejects hostile dimensions before native decoding', async () => {
    const create = native([]), bytes = staticFixture('quadrants.png')
    new DataView(bytes).setUint32(16, 50_000)
    await expect(runEncoding(1, async () => bytes, resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects a maximum-width/height canvas whose combination exceeds source pixel limit', async () => {
    const bitmaps = [new Bitmap(4096, 512), new Bitmap(512, 4096)]
    native(bitmaps)
    await expect(runEncoding(2, async () => staticFixture('quadrants.png'), resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(bitmaps.every(bitmap => bitmap.close.mock.calls.length === 1)).toBe(true)
    expect(canvases).toHaveLength(0)
  })
  it('closes a bitmap returned after cancellation during native decode', async () => {
    const bitmap = new Bitmap(2, 1), jobHooks = hooks()
    let cancelled = false
    let resolveDecode!: (bitmap: ImageBitmap) => void
    const create = vi.fn(() => new Promise<ImageBitmap>(resolve => { resolveDecode = resolve }))
    vi.stubGlobal('createImageBitmap', create)
    vi.stubGlobal('OffscreenCanvas', Canvas)
    jobHooks.checkpoint.mockImplementation(async () => { if (cancelled) throw new EncodeError('CANCELLED') })
    const job = runEncoding(1, async () => staticFixture('quadrants.png'), resolveEncodeOptions(), jobHooks)
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    cancelled = true
    resolveDecode(bitmap)
    await expect(job).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })
  it('cancels between quantization and encoding and releases canvas backing', async () => {
    const bitmaps = [new Bitmap(2, 1), new Bitmap(2, 1)], jobHooks = hooks()
    native(bitmaps)
    let quantizing = false
    jobHooks.progress.mockImplementation(progress => { quantizing ||= progress.phase === 'quantizing' })
    jobHooks.checkpoint.mockImplementation(async () => { if (quantizing) throw new EncodeError('CANCELLED') })
    await expect(runEncoding(1, async () => staticFixture('quadrants.png'), resolveEncodeOptions(), jobHooks)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(bitmaps.every(bitmap => bitmap.close.mock.calls.length === 1)).toBe(true)
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([1, 1])
  })
  it('reports in-range progress monotonically per phase, ending at total frames', async () => {
    native(Array.from({ length: 4 }, () => new Bitmap(2, 1)))
    const jobHooks = hooks()
    await runEncoding(2, async () => staticFixture('quadrants.png'), resolveEncodeOptions(), jobHooks)
    const latest = new Map<string, number>()
    for (const [progress] of jobHooks.progress.mock.calls) {
      expect(progress.currentFrame).toBeGreaterThanOrEqual(latest.get(progress.phase) ?? 0)
      expect(progress.currentFrame).toBeLessThanOrEqual(progress.totalFrames)
      latest.set(progress.phase, progress.currentFrame)
    }
    const globalWork = jobHooks.progress.mock.calls.map(([progress]) => progress.completedWork!)
    expect(globalWork.every((value, index) => index === 0 || value >= globalWork[index - 1]!)).toBe(true)
    expect(jobHooks.progress).toHaveBeenLastCalledWith({ phase: 'finalizing', currentFrame: 2, totalFrames: 2, completedWork: 4, totalWork: 4 })
  })
  it('fails gracefully when Worker image or canvas capabilities are absent', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    await expect(runEncoding(1, async () => staticFixture('quadrants.png'), resolveEncodeOptions(), hooks())).rejects.toMatchObject({ code: 'WORKER_FAILED' })
  })
})
