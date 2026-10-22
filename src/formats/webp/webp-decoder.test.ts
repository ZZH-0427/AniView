import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebPDecoder } from './webp-decoder'
import type { WorkerRequest, WorkerResponse } from './webp-worker-protocol'

class WorkerStub {
  static current: WorkerStub
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn<(request: WorkerRequest, transfer: Transferable[]) => void>()
  terminate = vi.fn()
  constructor() { WorkerStub.current = this }
  respond(response: WorkerResponse) { this.onmessage?.(new MessageEvent('message', { data: response })) }
}

afterEach(() => vi.unstubAllGlobals())

describe('worker transport lifecycle (no WASM emulation)', () => {
  it('normalizes failures to construct a Worker', () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('Worker unavailable') } })
    expect(() => new WebPDecoder()).toThrow(expect.objectContaining({ code: 'WORKER_FAILED' }))
  })
  it('marks the newly read input as transferable and normalizes worker errors', async () => {
    vi.stubGlobal('Worker', WorkerStub)
    const decoder = new WebPDecoder()
    const data = new ArrayBuffer(4)
    const result = decoder.open({ name: 'test.webp', size: 4, source: 'file', read: async () => data })
    await vi.waitFor(() => expect(WorkerStub.current.postMessage).toHaveBeenCalledOnce())
    expect(WorkerStub.current.postMessage).toHaveBeenCalledWith({ id: 1, type: 'open', data }, [data])
    const rejected = expect(result).rejects.toMatchObject({ code: 'CORRUPTED_FILE' })
    WorkerStub.current.respond({ id: 1, type: 'error', code: 'CORRUPTED_FILE' })
    await rejected
    decoder.dispose()
  })

  it('prevents concurrent requests and rejects a pending request on termination', async () => {
    vi.stubGlobal('Worker', WorkerStub)
    const decoder = new WebPDecoder()
    const result = decoder.next()
    const rejected = expect(result).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    await expect(decoder.next()).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    decoder.dispose()
    decoder.dispose()
    await rejected
    expect(WorkerStub.current.terminate).toHaveBeenCalledOnce()
    await expect(decoder.reset()).rejects.toMatchObject({ code: 'WORKER_FAILED' })
  })

  it('ignores stale responses and can acknowledge reset/close', async () => {
    vi.stubGlobal('Worker', WorkerStub)
    const decoder = new WebPDecoder()
    const reset = decoder.reset()
    WorkerStub.current.respond({ id: 0, type: 'closed' })
    WorkerStub.current.respond({ id: 1, type: 'reset' })
    await expect(reset).resolves.toEqual({ id: 1, type: 'reset' })
    const close = decoder.close()
    WorkerStub.current.respond({ id: 2, type: 'closed' })
    await expect(close).resolves.toEqual({ id: 2, type: 'closed' })
    decoder.dispose()
  })
})
