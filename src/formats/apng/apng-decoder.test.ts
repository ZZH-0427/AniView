import { afterEach, expect, it, vi } from 'vitest'
import { APNGDecoder } from './apng-decoder'
import type { APNGResponse, APNGRequest } from './apng-worker-protocol'

class FakeWorker {
  static latest: FakeWorker
  onmessage: ((event: { data: APNGResponse }) => void) | undefined
  onerror: ((event: { preventDefault(): void }) => void) | undefined
  onmessageerror: (() => void) | undefined
  postMessage = vi.fn<(request: APNGRequest, transfer: Transferable[]) => void>()
  terminate = vi.fn()
  constructor() { FakeWorker.latest = this }
}
afterEach(() => vi.unstubAllGlobals())
it('opts in to canonical RGBA only for an explicitly requested conversion transport', async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const transport = new APNGDecoder({ canonicalRGBA: true }), buffer = new ArrayBuffer(4)
  const pending = transport.open({ name: 'test-only', size: 4, source: 'file', read: async () => buffer })
  await Promise.resolve()
  expect(FakeWorker.latest.postMessage).toHaveBeenCalledWith({ id: 1, type: 'open', data: buffer, canonicalRGBA: true }, [buffer])
  FakeWorker.latest.onmessage?.({ data: { id: 1, type: 'ready', metadata: { width: 1, height: 1, frameCount: 1, loopCount: 1 }, readyMs: 0 } })
  await pending; transport.dispose()
})
it('transfers input, rejects pending on termination and ignores late responses', async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const transport = new APNGDecoder()
  const buffer = new ArrayBuffer(4)
  const pending = transport.open({ name: 'x.png', size: 4, source: 'file', read: async () => buffer })
  await Promise.resolve()
  expect(FakeWorker.latest.postMessage).toHaveBeenCalledWith({ id: 1, type: 'open', data: buffer }, [buffer])
  transport.dispose()
  await expect(pending).rejects.toMatchObject({ code: 'WORKER_FAILED' })
  FakeWorker.latest.onmessage?.({ data: { id: 1, type: 'closed' } })
  await expect(transport.next()).rejects.toMatchObject({ code: 'WORKER_FAILED' })
  expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce()
})
it('normalizes Worker errors without exposing raw parser diagnostics', async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const transport = new APNGDecoder()
  const pending = transport.next()
  FakeWorker.latest.onmessage?.({ data: { id: 1, type: 'error', code: 'APNG_RUNTIME_UNAVAILABLE' } })
  await expect(pending).rejects.toMatchObject({ code: 'APNG_RUNTIME_UNAVAILABLE' })
  transport.dispose()
})
