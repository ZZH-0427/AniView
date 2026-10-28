import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EncoderWorkerClient } from './encoder-client'
import type { EncoderRequest, EncoderResponse } from './protocol'

class WorkerDouble {
  static latest: WorkerDouble
  onmessage: ((event: MessageEvent<EncoderResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  requests: EncoderRequest[] = []
  terminate = vi.fn()
  constructor() { WorkerDouble.latest = this }
  postMessage(request: EncoderRequest, transfer: Transferable[] = []) {
    this.requests.push(structuredClone(request, { transfer }))
  }
  reply(value: EncoderResponse) { this.onmessage?.(new MessageEvent('message', { data: value })) }
}
const metadata = { width: 1, height: 1, frameCount: 1, playCount: 0 }
beforeEach(() => { vi.stubGlobal('Worker', WorkerDouble) })
afterEach(() => { vi.unstubAllGlobals() })

describe('target Worker transport', () => {
  it('consumes the original canonical buffer and awaits an explicit accepted response', async () => {
    const client = new EncoderWorkerClient(), worker = WorkerDouble.latest
    const open = client.open('apng', metadata)
    worker.reply({ id: 1, type: 'ready', capabilities: { deflate: true } }); await open
    const rgba = new Uint8Array([1,2,3,255]).buffer
    const pending = client.addFrame({ index: 0, durationMs: 27, rgba })
    expect(rgba.byteLength).toBe(0)
    expect(worker.requests.at(-1)).toMatchObject({ type: 'frame', frame: { durationMs: 27 } })
    worker.reply({ id: 2, type: 'accepted', metrics: { encodeMs: 1, outputBytes: 8, outputCapacity: 16 } })
    await expect(pending).resolves.toMatchObject({ outputBytes: 8 })
    client.dispose(); client.dispose(); expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('ignores a stale response instead of completing another request', async () => {
    const client = new EncoderWorkerClient(), worker = WorkerDouble.latest
    const pending = client.open('webp', metadata)
    worker.reply({ id: 77, type: 'ready', capabilities: { deflate: false } })
    expect(client.capabilities.deflate).toBe(false)
    worker.reply({ id: 1, type: 'ready', capabilities: { deflate: true } }); await pending
    expect(client.capabilities.deflate).toBe(true); client.dispose()
  })
  it('reports capability failure without a generic source decode error', async () => {
    const client = new EncoderWorkerClient(), worker = WorkerDouble.latest
    const pending = client.open('apng', metadata)
    worker.reply({ id: 1, type: 'error', code: 'TARGET_ENCODER_UNSUPPORTED' })
    await expect(pending).rejects.toMatchObject({ code: 'TARGET_ENCODER_UNSUPPORTED' }); client.dispose()
  })
  it('rejects pending work on Worker message failure and allows another fresh client', async () => {
    const client = new EncoderWorkerClient(), worker = WorkerDouble.latest
    const pending = client.open('gif', metadata)
    worker.onmessageerror?.()
    await expect(pending).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    const next = new EncoderWorkerClient(), ready = next.open('gif', metadata)
    WorkerDouble.latest.reply({ id: 1, type: 'ready', capabilities: { deflate: true } }); await ready; next.dispose()
  })
  it('returns the exact valid encoded output range and releases its Worker', async () => {
    const client = new EncoderWorkerClient(), worker = WorkerDouble.latest
    const pending = client.finish(), data = new ArrayBuffer(16)
    worker.reply({ id: 1, type: 'result', result: { data, byteLength: 5, metrics: { encodeMs: 1, outputBytes: 5, outputCapacity: 16 } } })
    expect((await pending).data).toBe(data); client.dispose(); expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
