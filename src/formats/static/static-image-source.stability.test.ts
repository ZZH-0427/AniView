import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VirtualFile } from '../../input/virtual-file'
import { runtimeDiagnostics } from '../../media/runtime-diagnostics'
import { StaticImageSource } from './static-image-source'
import { staticFixture } from './static-fixtures.test-support'

class TrackedBitmap implements ImageBitmap {
  constructor(readonly width = 40, readonly height = 20) {}
  close = vi.fn()
}
function fixture(name = 'quadrants.jpg'): VirtualFile {
  const data = staticFixture(name)
  return { name, source: 'file', size: data.byteLength, read: vi.fn(async () => data.slice(0)) }
}

afterEach(() => vi.unstubAllGlobals())

describe('static stability and capability boundaries', () => {
  it.each(['Blob', 'createImageBitmap'])('reports missing %s before reading bytes or allocating a bitmap', async missing => {
    const create = vi.fn()
    vi.stubGlobal('createImageBitmap', create)
    vi.stubGlobal(missing, undefined)
    const file = fixture()
    await expect(StaticImageSource.open(file, 'jpeg')).rejects.toMatchObject({ code: 'STATIC_IMAGE_RUNTIME_UNAVAILABLE' })
    expect(file.read).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('does not allocate if the decoding-phase callback cancels the request', async () => {
    const controller = new AbortController(), create = vi.fn()
    vi.stubGlobal('createImageBitmap', create)
    await expect(StaticImageSource.open(fixture(), 'jpeg', {
      signal: controller.signal, onDecoding: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(create).not.toHaveBeenCalled()
  })

  it('releases every stale native result after 100 overlapping native decodes, retaining only the current image', async () => {
    const before = runtimeDiagnostics.getSnapshot()
    const bitmaps: TrackedBitmap[] = [], resolvers: ((value: ImageBitmap) => void)[] = []
    const create = vi.fn(() => new Promise<ImageBitmap>(resolve => { resolvers.push(resolve) }))
    vi.stubGlobal('createImageBitmap', create)
    const opens: Promise<StaticImageSource | DOMException>[] = []
    let previous: AbortController | undefined
    for (let index = 0; index < 100; index++) {
      previous?.abort()
      const controller = new AbortController()
      // Catch immediately: canceled operations may settle while newer ones open.
      opens.push(StaticImageSource.open(fixture(), 'jpeg', { signal: controller.signal }).catch((cause: unknown) => {
        if (cause instanceof DOMException) return cause
        throw cause
      }))
      await Promise.resolve()
      expect(create).toHaveBeenCalledTimes(index + 1)
      bitmaps.push(new TrackedBitmap())
      previous = controller
    }
    resolvers.forEach((resolve, index) => resolve(bitmaps[index]!))
    const results = await Promise.all(opens)
    for (let index = 0; index < 99; index++) {
      expect(results[index]).toMatchObject({ name: 'AbortError' })
      expect(bitmaps[index]!.close).toHaveBeenCalledTimes(1)
    }
    const current = results.at(-1)
    if (!(current instanceof StaticImageSource)) throw new Error('Current static source did not open')
    expect(current.image).toBe(bitmaps.at(-1))
    expect(bitmaps.at(-1)!.close).not.toHaveBeenCalled()
    previous?.abort(); current.dispose()
    expect(current.image).toBeNull()
    expect(bitmaps.every(bitmap => bitmap.close.mock.calls.length === 1)).toBe(true)
    const after = runtimeDiagnostics.getSnapshot()
    expect(after.bitmapsCreated - before.bitmapsCreated).toBe(100)
    expect(after.bitmapsClosed - before.bitmapsClosed).toBe(100)
    expect(after.activeBitmaps).toBe(before.activeBitmaps)
    expect(after.staleResultsDiscarded - before.staleResultsDiscarded).toBe(99)
    expect(after.staticDecodeErrors).toBe(before.staticDecodeErrors)
  })

  it('native decode failure leaves no persistent source and a valid next image opens normally', async () => {
    const before = runtimeDiagnostics.getSnapshot()
    const first = new TrackedBitmap(), last = new TrackedBitmap()
    const create = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new DOMException('bad pixels', 'InvalidStateError')).mockResolvedValueOnce(last)
    vi.stubGlobal('createImageBitmap', create)
    const initial = await StaticImageSource.open(fixture(), 'jpeg'); initial.dispose()
    await expect(StaticImageSource.open(fixture(), 'jpeg')).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    const next = await StaticImageSource.open(fixture(), 'jpeg')
    expect(next.image).toBe(last); next.dispose()
    expect(first.close).toHaveBeenCalledTimes(1); expect(last.close).toHaveBeenCalledTimes(1)
    const after = runtimeDiagnostics.getSnapshot()
    expect(after.staticDecodeErrors - before.staticDecodeErrors).toBe(1)
    expect(after.activeBitmaps).toBe(before.activeBitmaps)
  })

  it('real malformed JPEG metadata never invokes the native decoder and does not poison reopening', async () => {
    const bitmap = new TrackedBitmap(), create = vi.fn(async () => bitmap)
    vi.stubGlobal('createImageBitmap', create)
    await expect(StaticImageSource.open(fixture('corrupt.jpg'), 'jpeg')).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
    expect(create).not.toHaveBeenCalled()
    const source = await StaticImageSource.open(fixture(), 'jpeg'); source.dispose()
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('rejects a 12 MP JPEG SOF before native allocation and still accepts the original next file', async () => {
    const bitmap = new TrackedBitmap(), create = vi.fn(async () => bitmap)
    vi.stubGlobal('createImageBitmap', create)
    const bytes = new Uint8Array(staticFixture('quadrants.jpg'))
    let sof = -1
    for (let index = 2; index < bytes.length - 9; index++) {
      if (bytes[index] === 0xff && bytes[index + 1] === 0xc0) { sof = index; break }
    }
    expect(sof).toBeGreaterThan(0)
    new DataView(bytes.buffer).setUint16(sof + 5, 3000)
    new DataView(bytes.buffer).setUint16(sof + 7, 4000)
    const original = fixture()
    await expect(StaticImageSource.open({ ...original, read: async () => bytes.buffer }, 'jpeg'))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' })
    expect(create).not.toHaveBeenCalled()
    const source = await StaticImageSource.open(original, 'jpeg'); source.dispose()
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })
})
