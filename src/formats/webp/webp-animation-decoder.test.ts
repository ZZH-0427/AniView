import { afterEach, expect, it, vi } from 'vitest'
import type { WorkerResponse } from './webp-worker-protocol'
import { WebPAnimationDecoder } from './webp-animation-decoder'

const transport = vi.hoisted(() => ({ open: vi.fn(), next: vi.fn(), reset: vi.fn(), close: vi.fn(), dispose: vi.fn() }))
vi.mock('./webp-decoder', () => ({ WebPDecoder: class { open = transport.open; next = transport.next; reset = transport.reset; close = transport.close; dispose = transport.dispose } }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })
it('normalizes metadata, resets fresh streams, releases frame bytes and closes transport', async () => {
  vi.stubGlobal('ImageData', class { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} })
  const ready: WorkerResponse = { id: 1, type: 'ready', metadata: { width: 1, height: 1, frameCount: 1, loopCount: 2 }, wasmReadyMs: 1, heapBytes: 16 }
  transport.open.mockResolvedValue(ready)
  transport.next.mockResolvedValueOnce({ id: 2, type: 'frame', frameIndex: 0, durationMs: 31, width: 1, height: 1, rgba: new ArrayBuffer(4), decodeMs: 1, heapBytes: 16 })
  const sequence = await new WebPAnimationDecoder().decode({ name: 'x', size: 4, source: 'file', read: async () => new ArrayBuffer(4) })
  expect(sequence.loopCount).toBe(2)
  const iterator = sequence.frames()[Symbol.asyncIterator]()
  const item = await iterator.next()
  expect(item.value?.durationMs).toBe(31)
  expect(item.value?.image).not.toBeNull()
  item.value?.dispose()
  expect(item.value?.image).toBeNull()
  await iterator.return?.()
  expect(transport.reset).toHaveBeenCalledOnce()
  await sequence.dispose(); await sequence.dispose()
  expect(transport.close).toHaveBeenCalledOnce()
  expect(transport.dispose).toHaveBeenCalledOnce()
})
it('cleans up if opening fails', async () => {
  transport.open.mockRejectedValue(new Error('decode'))
  await expect(new WebPAnimationDecoder().decode({ name: 'x', size: 1, source: 'file', read: async () => new ArrayBuffer(1) })).rejects.toThrow('decode')
  expect(transport.dispose).toHaveBeenCalledOnce()
})
