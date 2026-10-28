import { describe, expect, it, vi } from 'vitest'
import { openAnimationFrameSource } from './frame-source'
import type { DecoderTransport } from './frame-source'
import type { ConversionFormat } from './model'
import type { GIFResponse } from '../formats/gif/gif-worker-protocol'
import type { WorkerResponse } from '../formats/webp/webp-worker-protocol'
import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'
import { normalizeGifLoop } from '../formats/gif/gif-timing'

const file: VirtualFile = { name: 'misleading.png', size: 8, source: 'file', read: async () => new ArrayBuffer(8) }
const ready = (loopCount = 0, frameCount = 2): GIFResponse => ({ id: 1, type: 'ready', readyMs: 0,
  metadata: { width: 2, height: 1, frameCount, loopCount } })
const frame = (index: number, durationMs = 27): GIFResponse => ({ id: index + 2, type: 'frame', frameIndex: index,
  width: 2, height: 1, durationMs, rgba: new Uint8Array([255, 0, 0, 255, 30, 40, 50, 127]).buffer,
  decodeMs: 3, liveBitmaps: 0, backupBytes: 8 })
function fixture(response: GIFResponse | WorkerResponse = ready()) {
  const transport = {
    open: vi.fn(async () => response), next: vi.fn<DecoderTransport['next']>(),
    reset: vi.fn(async (): Promise<GIFResponse> => ({ id: 8, type: 'reset' })),
    close: vi.fn(async (): Promise<GIFResponse> => ({ id: 9, type: 'closed' })), dispose: vi.fn(),
  }
  const factory = vi.fn(() => transport)
  return { transport, factory }
}
const transfer = (buffer: ArrayBuffer) => structuredClone(buffer, { transfer: [buffer] })

describe('canonical decoder source adapter', () => {
  it.each(['gif', 'apng', 'webp'] as const)('%s exposes normalized visual metadata without source container flags', async format => {
    for (const playCount of [0, 1, 2]) {
      const f = fixture(ready(format === 'gif' ? normalizeGifLoop(playCount === 1 ? null : playCount === 0 ? 0 : playCount - 1) : playCount))
      const source = await openAnimationFrameSource(file, format, undefined, f.factory)
      expect(source.metadata).toEqual({ width: 2, height: 1, frameCount: 2, playCount })
      expect(f.factory).toHaveBeenCalledWith(format)
      await source.close()
      expect(f.transport.close).toHaveBeenCalledOnce(); expect(f.transport.dispose).toHaveBeenCalledOnce()
    }
  })

  it('hands out the exact full-canvas ArrayBuffer and preserves frame order and milliseconds', async () => {
    const f = fixture(), first = frame(0), second = frame(1, 250)
    f.transport.next.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValue({ id: 7, type: 'end' })
    const source = await openAnimationFrameSource(file, 'gif', undefined, f.factory)
    const a = await source.next()
    expect(a).toEqual({ index: 0, durationMs: 27, rgba: first.type === 'frame' ? first.rgba : undefined })
    expect(a?.rgba).toBe(first.type === 'frame' ? first.rgba : undefined)
    expect(a && new Uint8Array(a.rgba)).toEqual(new Uint8Array([255, 0, 0, 255, 30, 40, 50, 127]))
    transfer(a!.rgba); source.acknowledgeFrame()
    const b = await source.next(); expect(b?.index).toBe(1); expect(b?.durationMs).toBe(250)
    transfer(b!.rgba); source.acknowledgeFrame()
    expect(await source.next()).toBeNull(); expect(await source.next()).toBeNull()
    expect(f.transport.next).toHaveBeenCalledTimes(3)
    expect(source.metrics).toEqual({ decodeMs: 6, decoderHeapBytes: 0, decoderBackupBytes: 8, directRgbaFrames: 0, canvasReadbackFrames: 0 })
    await source.close()
  })

  it('requires both transfer detachment and explicit encoder acceptance before the next pull', async () => {
    const f = fixture(); f.transport.next.mockResolvedValueOnce(frame(0)).mockResolvedValueOnce(frame(1))
    const source = await openAnimationFrameSource(file, 'apng', undefined, f.factory), a = await source.next()
    expect(() => source.acknowledgeFrame()).toThrow('SOURCE_DECODE_FAILED')
    await expect(source.next()).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED' })
    await expect(source.reset()).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED' })
    transfer(a!.rgba)
    await expect(source.next()).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED' })
    expect(f.transport.next).toHaveBeenCalledOnce()
    source.acknowledgeFrame(); await expect(source.next()).resolves.toMatchObject({ index: 1 })
    await source.close()
  })

  it('does not prefetch or allow overlapping decoder requests', async () => {
    const f = fixture(); let resolve: (response: GIFResponse) => void = () => {}
    f.transport.next.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const source = await openAnimationFrameSource(file, 'gif', undefined, f.factory)
    expect(f.transport.next).not.toHaveBeenCalled()
    const pending = source.next()
    await expect(source.next()).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED' })
    expect(f.transport.next).toHaveBeenCalledOnce(); resolve(frame(0)); await pending; await source.close()
  })

  it('reset reuses the codec reset and restarts frame order only after acceptance', async () => {
    const f = fixture(); f.transport.next.mockImplementation(async () => frame(0))
    const source = await openAnimationFrameSource(file, 'webp', undefined, f.factory), first = await source.next()
    transfer(first!.rgba); source.acknowledgeFrame(); await source.reset()
    expect(f.transport.reset).toHaveBeenCalledOnce(); expect((await source.next())?.index).toBe(0)
    await source.close()
  })

  it('records decoder WASM capacity separately from the canonical transferable', async () => {
    const f = fixture({ id: 1, type: 'ready', metadata: { width: 2, height: 1, frameCount: 1, loopCount: 1 }, wasmReadyMs: 1, heapBytes: 16_777_216 })
    f.transport.next.mockResolvedValue({ id: 2, type: 'frame', frameIndex: 0, width: 2, height: 1, durationMs: 27,
      rgba: new ArrayBuffer(8), decodeMs: 2, heapBytes: 33_554_432 })
    const source = await openAnimationFrameSource(file, 'webp', undefined, f.factory)
    await source.next(); expect(source.metrics.decoderHeapBytes).toBe(33_554_432); await source.close()
  })

  it.each(['premature-end', 'order', 'dimensions', 'rgba-length', 'duration'] as const)('rejects %s and disposes the codec', async fault => {
    const f = fixture(), value = frame(fault === 'order' ? 1 : 0)
    if (value.type !== 'frame') throw new Error('Expected frame fixture')
    const response = fault === 'premature-end' ? { id: 2, type: 'end' as const } : {
      ...value, ...(fault === 'dimensions' ? { width: 3 } : {}),
      ...(fault === 'rgba-length' ? { rgba: new ArrayBuffer(4) } : {}),
      ...(fault === 'duration' ? { durationMs: Number.NaN } : {}),
    }
    f.transport.next.mockResolvedValue(response)
    const source = await openAnimationFrameSource(file, 'gif', undefined, f.factory)
    await expect(source.next()).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED' })
    expect(f.transport.dispose).toHaveBeenCalledOnce()
  })

  it('rejects excessive source size without creating a Worker', async () => {
    const f = fixture()
    await expect(openAnimationFrameSource({ ...file, size: 64 * 1024 * 1024 + 1 }, 'gif', undefined, f.factory)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(f.factory).not.toHaveBeenCalled()
  })

  it('rejects excessive metadata before pulling any frame', async () => {
    const f = fixture(ready(0, 201))
    await expect(openAnimationFrameSource(file, 'gif', undefined, f.factory)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(f.transport.next).not.toHaveBeenCalled(); expect(f.transport.dispose).toHaveBeenCalledOnce()
  })

  it('normalizes source errors without leaking raw exceptions or selected names', async () => {
    const f = fixture(); f.transport.next.mockRejectedValue(new MediaError('CORRUPTED_FILE'))
    const source = await openAnimationFrameSource(file, 'gif', undefined, f.factory)
    await expect(source.next()).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED', message: 'SOURCE_DECODE_FAILED' })
    expect(f.transport.dispose).toHaveBeenCalledOnce()
    const worker = fixture(); worker.transport.next.mockRejectedValue(new MediaError('WORKER_FAILED'))
    const replacement = await openAnimationFrameSource(file, 'gif', undefined, worker.factory)
    await expect(replacement.next()).rejects.toMatchObject({ code: 'WORKER_FAILED' })
  })

  it('cancels an unresolved open immediately and never yields a later result', async () => {
    const f = fixture(), controller = new AbortController(); let complete: (response: GIFResponse) => void = () => {}
    f.transport.open.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const pending = openAnimationFrameSource(file, 'gif', controller.signal, f.factory)
    controller.abort(); await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(f.transport.dispose).toHaveBeenCalled(); complete(ready()); await Promise.resolve()
  })

  it('cancels an active decode and discards a resolved-but-stale frame', async () => {
    const f = fixture(), controller = new AbortController(); let complete: (response: GIFResponse) => void = () => {}
    f.transport.next.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const source = await openAnimationFrameSource(file, 'apng', controller.signal, f.factory), pending = source.next()
    complete(frame(0)); controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    await source.close(); expect(f.transport.dispose).toHaveBeenCalledOnce()
  })

  it('never creates a decoder for an already aborted job', async () => {
    const f = fixture(), controller = new AbortController(); controller.abort()
    await expect(openAnimationFrameSource(file, 'gif', controller.signal, f.factory)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(f.factory).not.toHaveBeenCalled()
  })

  it('close is idempotent and does not release a borrowed VirtualFile', async () => {
    const f = fixture(), release = vi.fn(), source = await openAnimationFrameSource({ ...file, release }, 'gif', undefined, f.factory)
    await source.close(); await source.close()
    expect(f.transport.close).toHaveBeenCalledOnce(); expect(f.transport.dispose).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled()
    await expect(source.next()).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED' })
  })

  it('unsupported transport capabilities fail as a source category', async () => {
    await expect(openAnimationFrameSource(file, 'gif' as ConversionFormat, undefined, () => { throw new MediaError('GIF_RUNTIME_UNAVAILABLE') })).rejects.toMatchObject({ code: 'SOURCE_UNSUPPORTED' })
  })
})
