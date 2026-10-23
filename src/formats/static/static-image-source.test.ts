import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VirtualFile } from '../../input/virtual-file'
import { MediaError } from '../../media/errors'
import { StaticImageSource } from './static-image-source'
import { staticFixture } from './static-fixtures.test-support'

class Bitmap implements ImageBitmap {
  constructor(readonly width = 40, readonly height = 20) {}
  close = vi.fn()
}
function file(name = 'quadrants.jpg'): VirtualFile {
  const data = staticFixture(name)
  return { name: 'misleading.gif', mimeType: 'image/gif', source: 'file', size: data.byteLength,
    read: vi.fn(async () => data.slice(0)) }
}
afterEach(() => vi.unstubAllGlobals())

describe('static resource ownership', () => {
  it.each([['quadrants.jpg', 'jpeg', 'image/jpeg'], ['quadrants.png', 'png', 'image/png'], ['quadrants.webp', 'webp', 'image/webp']] as const)('opens %s with an oriented native bitmap; holds no encoded image resource', async (name, format, mime) => {
    const bitmap = new Bitmap(), decode = vi.fn(async () => bitmap)
    vi.stubGlobal('createImageBitmap', decode)
    const source = await StaticImageSource.open(file(name), format)
    expect(decode).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: mime }), { imageOrientation: 'from-image' })
    expect(source.image).toBe(bitmap); expect([source.width, source.height]).toEqual([40, 20])
    expect(bitmap.close).not.toHaveBeenCalled()
    source.dispose(); source.dispose()
    expect(source.image).toBeNull(); expect(bitmap.close).toHaveBeenCalledTimes(1)
  })
  it('uses oriented dimensions returned by native decoding for phone photos', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => new Bitmap(20, 40)))
    const source = await StaticImageSource.open(file('orientation-6.jpg'), 'jpeg')
    expect([source.width, source.height]).toEqual([20, 40]); source.dispose()
  })
  it('switch/close release resources and reopening obtains a new bitmap', async () => {
    const first = new Bitmap(), second = new Bitmap()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second))
    const a = await StaticImageSource.open(file(), 'jpeg'); a.dispose()
    const b = await StaticImageSource.open(file(), 'jpeg')
    expect(first.close).toHaveBeenCalledTimes(1); expect(second.close).not.toHaveBeenCalled()
    b.dispose(); expect(second.close).toHaveBeenCalledTimes(1)
  })
  it('closes a returned bitmap on abort and detaches its listener on disposal', async () => {
    const bitmap = new Bitmap(), abort = new AbortController(), remove = vi.spyOn(abort.signal, 'removeEventListener')
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const source = await StaticImageSource.open(file(), 'jpeg', { signal: abort.signal })
    abort.abort(); source.dispose()
    expect(bitmap.close).toHaveBeenCalledTimes(1); expect(source.image).toBeNull()
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
  it('closes a bitmap arriving after cancellation before exposing a source', async () => {
    const bitmap = new Bitmap(), abort = new AbortController()
    let resolve!: (bitmap: ImageBitmap) => void
    const decoding = new Promise<ImageBitmap>(done => { resolve = done })
    const started = vi.fn(() => decoding); vi.stubGlobal('createImageBitmap', started)
    const opening = StaticImageSource.open(file(), 'jpeg', { signal: abort.signal })
    await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(1))
    abort.abort(); resolve(bitmap)
    await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })
  it('does not start reading when already cancelled', async () => {
    const input = file(), abort = new AbortController(); abort.abort()
    await expect(StaticImageSource.open(input, 'jpeg', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(input.read).not.toHaveBeenCalled()
  })
  it('does not start native decoding if cancelled while reading', async () => {
    const abort = new AbortController(), decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode)
    const input = file()
    await expect(StaticImageSource.open({ ...input, read: async () => { abort.abort(); return staticFixture('quadrants.jpg') } }, 'jpeg', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(decode).not.toHaveBeenCalled()
  })
  it('rejects oversized encoded size before allocating/reading', async () => {
    const input = file()
    await expect(StaticImageSource.open({ ...input, size: 67_108_865 }, 'jpeg')).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' })
    expect(input.read).not.toHaveBeenCalled()
  })
  it('rejects malformed and oversized dimension metadata before native decode', async () => {
    const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode)
    await expect(StaticImageSource.open(file('corrupt.jpg'), 'jpeg')).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
    const data = staticFixture('quadrants.png'); new DataView(data).setUint32(16, 50_000)
    await expect(StaticImageSource.open({ ...file('quadrants.png'), read: async () => data }, 'png')).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' })
    expect(decode).not.toHaveBeenCalled()
  })
  it('validates native dimensions and releases an unexpectedly huge native result', async () => {
    const bitmap = new Bitmap(50_000, 50_000)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    await expect(StaticImageSource.open(file(), 'jpeg')).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' })
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })
  it('gives a stable capability error', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    await expect(StaticImageSource.open(file(), 'jpeg')).rejects.toMatchObject({ code: 'STATIC_IMAGE_RUNTIME_UNAVAILABLE' })
  })
  it.each([[new Error('native decoder details'), 'DECODE_FAILED'], [new RangeError('allocation'), 'OUT_OF_MEMORY']] as const)('normalizes native failures', async (cause, code) => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(cause))
    await expect(StaticImageSource.open(file(), 'jpeg')).rejects.toMatchObject({ code })
  })
  it('preserves archive-specific errors while normalizing generic read errors and short reads', async () => {
    for (const [cause, code] of [[new MediaError('ARCHIVE_ENCRYPTED'), 'ARCHIVE_ENCRYPTED'], [new Error('read'), 'FILE_READ_FAILED']] as const) {
      await expect(StaticImageSource.open({ ...file(), read: async () => { throw cause } }, 'jpeg')).rejects.toMatchObject({ code })
    }
    await expect(StaticImageSource.open({ ...file(), read: async () => new ArrayBuffer(0) }, 'jpeg')).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
  })
})
