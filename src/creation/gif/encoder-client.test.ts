import { describe, expect, it, vi } from 'vitest'
import type { VirtualFile } from '../../input/virtual-file'
import { StaticGifEncoder } from './encoder-client'
import { resolveEncodeOptions, type EncodedGif } from './model'
import type { EncoderRequest, EncoderResponse, EncoderWorkerPort } from './protocol'
import { GIF_CREATION_LIMITS } from './gif-validation'

class TestWorker implements EncoderWorkerPort {
  onmessage: EncoderWorkerPort['onmessage'] = null
  onerror: EncoderWorkerPort['onerror'] = null
  onmessageerror: EncoderWorkerPort['onmessageerror'] = null
  messages: EncoderRequest[] = []
  terminated = 0
  postMessage(message: EncoderRequest, transfer: Transferable[] = []) {
    this.messages.push(structuredClone(message, { transfer }))
  }
  terminate() { this.terminated++ }
  emit(message: EncoderResponse) { this.onmessage?.({ data: message } as MessageEvent<EncoderResponse>) }
  get id() { return this.messages[0]!.id }
}
const source = (read = async () => new ArrayBuffer(4)): VirtualFile => ({ name: 'wrong.txt', size: 4, source: 'file', read })
const result = (): EncodedGif => ({ data: new ArrayBuffer(4096), byteLength: 100,
  metrics: { decodeMs: 1, quantizeMs: 1, writeMs: 1, totalMs: 5, peakBitmaps: 1, peakRgbaFrames: 1,
    peakFrameBytes: 4, outputBytes: 100, outputCapacity: 4096, frameCount: 2, width: 1, height: 1, sourceBytes: 8 } })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
function setup() {
  const workers: TestWorker[] = []
  const encoder = new StaticGifEncoder(() => { const worker = new TestWorker(); workers.push(worker); return worker })
  return { workers, encoder }
}

describe('experimental GIF encoder transport', () => {
  it('uses one worker, forwards progress, transfers current bytes and returns exact output range', async () => {
    const { encoder, workers } = setup(), progress = vi.fn(), data = new ArrayBuffer(4)
    const pending = encoder.encode([source(async () => data), source()], {}, { onProgress: progress })
    await tick()
    const worker = workers[0]!
    expect(worker.messages[0]).toMatchObject({ type: 'start', sizes: [4, 4] })
    worker.emit({ type: 'read', id: worker.id, index: 0 })
    await tick()
    expect(data.byteLength).toBe(0)
    expect(worker.messages.at(-1)).toMatchObject({ type: 'source', index: 0 })
    worker.emit({ type: 'progress', id: worker.id, progress: { phase: 'scanning', currentFrame: 1, totalFrames: 2 } })
    worker.emit({ type: 'result', id: worker.id, result: result() })
    const output = await pending
    expect(output.byteLength).toBe(100)
    expect(output.data.byteLength).toBe(4096)
    expect(progress).toHaveBeenCalledOnce()
    expect(worker.terminated).toBe(1)
    await encoder.cancel()
    expect(worker.terminated).toBe(1)
  })
  it('rejects cancellation before creating a worker', async () => {
    const { encoder, workers } = setup(), abort = new AbortController()
    abort.abort()
    await expect(encoder.encode([source()], {}, { signal: abort.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(workers).toHaveLength(0)
  })
  it('cooperatively cancels and terminates after worker acknowledgement', async () => {
    const { encoder, workers } = setup()
    const outcome = encoder.encode([source()]).catch(error => error)
    await tick()
    const worker = workers[0]!, cancelled = encoder.cancel()
    expect(worker.messages.at(-1)).toMatchObject({ type: 'cancel' })
    worker.emit({ type: 'error', id: worker.id, code: 'CANCELLED' })
    await cancelled
    expect(await outcome).toMatchObject({ code: 'CANCELLED' })
    expect(worker.terminated).toBe(1)
  })
  it('bounds cancellation when the worker cannot respond', async () => {
    const { encoder, workers } = setup()
    const outcome = encoder.encode([source()]).catch(error => error)
    await tick()
    await encoder.cancel()
    expect(await outcome).toMatchObject({ code: 'CANCELLED' })
    expect(workers[0]!.terminated).toBe(1)
  })
  it('prevents late A output from resolving a replacement B', async () => {
    const { encoder, workers } = setup()
    const first = encoder.encode([source()]).catch(error => error)
    await tick()
    const old = workers[0]!, late = old.onmessage!
    const second = encoder.encode([source(), source()])
    old.emit({ type: 'error', id: old.id, code: 'CANCELLED' })
    await tick()
    const current = workers[1]!
    late({ data: { type: 'result', id: old.id, result: result() } } as MessageEvent<EncoderResponse>)
    current.emit({ type: 'result', id: current.id, result: result() })
    expect(await first).toMatchObject({ code: 'CANCELLED' })
    expect((await second).byteLength).toBe(100)
    expect(old.terminated).toBe(1)
    expect(current.terminated).toBe(1)
  })
  it('drops a source read completing after cancellation without taking caller ownership', async () => {
    const { encoder, workers } = setup()
    let complete: (data: ArrayBuffer) => void = () => {}
    const bytes = new ArrayBuffer(4), release = vi.fn()
    const file = { ...source(() => new Promise<ArrayBuffer>(resolve => { complete = resolve })), release }
    const outcome = encoder.encode([file]).catch(error => error)
    await tick()
    const worker = workers[0]!
    worker.emit({ type: 'read', id: worker.id, index: 0 })
    await tick()
    const cancelling = encoder.cancel()
    worker.emit({ type: 'error', id: worker.id, code: 'CANCELLED' })
    await cancelling
    complete(bytes)
    await tick()
    expect(await outcome).toMatchObject({ code: 'CANCELLED' })
    expect(bytes.byteLength).toBe(4)
    expect(release).not.toHaveBeenCalled()
    expect(worker.messages.some(message => message.type === 'source')).toBe(false)
  })
  it('maps source read failure into the worker protocol and recovers next job', async () => {
    const { encoder, workers } = setup()
    const outcome = encoder.encode([source(async () => { throw new Error('bad read') })]).catch(error => error)
    await tick()
    const worker = workers[0]!
    worker.emit({ type: 'read', id: worker.id, index: 0 })
    await tick()
    expect(worker.messages.at(-1)).toMatchObject({ type: 'source-error' })
    worker.emit({ type: 'error', id: worker.id, code: 'FILE_READ_FAILED' })
    expect(await outcome).toMatchObject({ code: 'FILE_READ_FAILED' })
    const again = encoder.encode([source()])
    await tick()
    workers[1]!.emit({ type: 'result', id: workers[1]!.id, result: result() })
    await again
  })
  it('drains an uncancellable old source read before reading replacement bytes', async () => {
    const { encoder, workers } = setup()
    let complete: (data: ArrayBuffer) => void = () => {}
    const first = encoder.encode([source(() => new Promise<ArrayBuffer>(resolve => { complete = resolve }))]).catch(error => error)
    await tick()
    const old = workers[0]!
    old.emit({ type: 'read', id: old.id, index: 0 })
    await tick()
    const nextRead = vi.fn(async () => new ArrayBuffer(4))
    const second = encoder.encode([source(nextRead)])
    old.emit({ type: 'error', id: old.id, code: 'CANCELLED' })
    await tick()
    const current = workers[1]!
    current.emit({ type: 'read', id: current.id, index: 0 })
    await tick()
    expect(nextRead).not.toHaveBeenCalled()
    complete(new ArrayBuffer(4))
    await tick()
    expect(nextRead).toHaveBeenCalledOnce()
    current.emit({ type: 'result', id: current.id, result: result() })
    expect(await first).toMatchObject({ code: 'CANCELLED' })
    await second
  })
  it('rejects concurrent source requests', async () => {
    const { encoder, workers } = setup()
    const outcome = encoder.encode([source(() => new Promise(() => {}))]).catch(error => error)
    await tick()
    const worker = workers[0]!
    worker.emit({ type: 'read', id: worker.id, index: 0 })
    worker.emit({ type: 'read', id: worker.id, index: 0 })
    expect(await outcome).toMatchObject({ code: 'WORKER_FAILED' })
  })
  it.each(['worker-error', 'message-error', 'invalid-result'] as const)('cleans up on %s', async scenario => {
    const { encoder, workers } = setup(), outcome = encoder.encode([source()]).catch(error => error)
    await tick()
    const worker = workers[0]!
    if (scenario === 'worker-error') worker.onerror?.({ preventDefault() {} } as ErrorEvent)
    else if (scenario === 'message-error') worker.onmessageerror?.({} as MessageEvent)
    else worker.emit({ type: 'result', id: worker.id, result: { ...result(), byteLength: 5000 } })
    expect(await outcome).toMatchObject({ code: scenario === 'invalid-result' ? 'ENCODING_FAILED' : 'WORKER_FAILED' })
    expect(worker.terminated).toBe(1)
  })
  it('does not create a worker for empty or oversized input', async () => {
    const { encoder, workers } = setup()
    await expect(encoder.encode([])).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    await expect(encoder.encode([{ ...source(), size: 64 * 1024 * 1024 + 1 }])).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(workers).toHaveLength(0)
  })
  it('handles constructor failure without retaining a worker', async () => {
    const encoder = new StaticGifEncoder(() => { throw new Error('denied') })
    await expect(encoder.encode([source()])).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    await encoder.cancel()
  })
  it('rejects excessive product count/bytes before Worker creation or source reads', async () => {
    const { encoder, workers } = setup(), read = vi.fn(async () => new ArrayBuffer(4))
    const config = { limits: GIF_CREATION_LIMITS }
    await expect(encoder.encode(Array.from({ length: 201 }, () => source(read)), {}, config)).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT', detail: { kind: 'source-count', actual: 201, limit: 200 },
    })
    await expect(encoder.encode([{ ...source(read), size: 8 * 1024 * 1024 }, { ...source(read), size: 8 * 1024 * 1024 + 1 }], {}, config)).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT', detail: { kind: 'source-bytes', actual: 16 * 1024 * 1024 + 1, limit: 16 * 1024 * 1024 },
    })
    expect(workers).toHaveLength(0)
    expect(read).not.toHaveBeenCalled()
  })
  it('passes the exact product byte boundary to the Worker and preserves error detail', async () => {
    const { encoder, workers } = setup()
    const outcome = encoder.encode([{ ...source(), size: 8 * 1024 * 1024 }, { ...source(), size: 8 * 1024 * 1024 }], {}, { limits: GIF_CREATION_LIMITS }).catch(error => error)
    await tick()
    const worker = workers[0]!, detail = { kind: 'output-side' as const, width: 3000, height: 1000, frameCount: 2, actual: 3000, limit: 2048 }
    expect(worker.messages[0]).toMatchObject({ type: 'start', limits: GIF_CREATION_LIMITS })
    worker.emit({ type: 'error', id: worker.id, code: 'RESOURCE_LIMIT', detail })
    expect(await outcome).toMatchObject({ code: 'RESOURCE_LIMIT', detail })
    expect(worker.terminated).toBe(1)
  })
  it.each([{ frameDurationMs: 19 }, { frameDurationMs: Infinity }, { alphaThreshold: 256 }, { loop: { kind: 'repeat' as const, repeats: 0 } }])(
    'rejects invalid options %j', options => { expect(() => resolveEncodeOptions(options)).toThrow() },
  )
})
