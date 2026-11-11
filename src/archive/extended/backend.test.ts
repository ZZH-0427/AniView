import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtendedBackend } from './backend'
import type { ExtendedEntry, ExtendedNativeMetrics, ExtendedRequest, ExtendedResponse } from './protocol'

const entries: readonly ExtendedEntry[] = [{ id: 0, path: 'a.gif', normalizedPath: 'a.gif', isDirectory: false, isFile: true,
  size: 4, packedSize: null, encrypted: false, solid: null, method: 'COPY', attributes: null, dictionaryBytes: null, block: null, special: false }]
const metrics: ExtendedNativeMetrics = { wasmBytes: 16777216, wasmMaximum: 67108864, ranges: 1, bytesRead: 8,
  maxRead: 8, outputBytes: 0, instances: 1, mountedArchives: 1 }
class TestWorker {
  static instances: TestWorker[] = []
  static auto = true
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  requests: ExtendedRequest[] = []
  terminate = vi.fn()
  constructor() { TestWorker.instances.push(this) }
  send(response: ExtendedResponse | null) { this.onmessage?.({ data: response } as MessageEvent<unknown>) }
  postMessage(request: ExtendedRequest) {
    this.requests.push(request)
    if (!TestWorker.auto) return
    queueMicrotask(() => {
      const base = { id: request.id, generation: request.generation }
      if (request.type === 'open') this.send({ ...base, type: 'ready', result: { entries, metrics } })
      if (request.type === 'extract') this.send({ ...base, type: 'extracted', result: { data: new Uint8Array([1, 2, 3, 4]).buffer, metrics: { ...metrics, outputBytes: 4 } } })
      if (request.type === 'list') this.send({ ...base, type: 'listed', entries })
    })
  }
}
const worker = () => TestWorker.instances.at(-1)!
const file = () => new Blob(['data'])
beforeEach(() => { TestWorker.instances = []; TestWorker.auto = true; vi.stubGlobal('Worker', TestWorker) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('dedicated bounded archive backend lifecycle', () => {
  it('returns validated structured metadata/bytes and owns one worker/instance', async () => {
    const backend = new ExtendedBackend()
    expect(await backend.open(file())).toEqual({ entries, metrics })
    expect(await backend.listEntries()).toEqual(entries)
    expect(new Uint8Array((await backend.extractEntry(0)).data)).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(backend.metrics).toMatchObject({ activeWorkers: 1, wasmInstances: 1, pendingRequests: 0, peakWasmBytes: 16777216 })
    backend.close(); backend.close()
    expect(worker().terminate).toHaveBeenCalledOnce()
    expect(backend.metrics).toMatchObject({ workersCreated: 1, workersTerminated: 1, activeWorkers: 0, wasmInstances: 0, pendingRequests: 0 })
    expect(backend.nativeMetrics).toMatchObject({ wasmBytes: 0, instances: 0, mountedArchives: 0, outputBytes: 0 })
  })
  it('rejects oversized input, raised deadlines and pre-aborted open before allocating a Worker', async () => {
    const backend = new ExtendedBackend()
    await expect(backend.open(new Blob([new Uint8Array(15 * 1024 ** 2 + 1)]))).rejects.toMatchObject({ code: 'ARCHIVE_LIMIT_EXCEEDED' })
    const abort = new AbortController(); abort.abort()
    await expect(backend.open(file(), undefined, abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(() => new ExtendedBackend({ deadlineMs: 15001 })).toThrow()
    expect(TestWorker.instances).toHaveLength(0)
  })
  it('terminates extraction immediately on AbortSignal and cleanly reopens', async () => {
    const backend = new ExtendedBackend()
    await backend.open(file())
    TestWorker.auto = false
    const abort = new AbortController(), task = backend.extractEntry(0, undefined, abort.signal)
    const failure = expect(task).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort(); await failure
    expect(worker().terminate).toHaveBeenCalledOnce()
    expect(backend.metrics).toMatchObject({ activeWorkers: 0, pendingRequests: 0, wasmInstances: 0 })
    TestWorker.auto = true
    await backend.open(file()); await backend.extractEntry(0); backend.close()
    expect(backend.metrics).toMatchObject({ workersCreated: 2, workersTerminated: 2, activeWorkers: 0 })
  })
  it('enforces external deadline with hard termination and permits retry', async () => {
    const backend = new ExtendedBackend({ deadlineMs: 1 })
    await backend.open(file()); TestWorker.auto = false
    vi.useFakeTimers()
    const task = backend.extractEntry(0), failure = expect(task).rejects.toMatchObject({ code: 'ARCHIVE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(1); await failure
    expect(worker().terminate).toHaveBeenCalledOnce()
    expect(backend.metrics.timeouts).toBe(1)
    TestWorker.auto = true
    await backend.open(file()); backend.close()
  })
  it('ignores late old-generation output after cancel then a new open', async () => {
    const backend = new ExtendedBackend()
    await backend.open(file()); TestWorker.auto = false
    const oldWorker = worker(), oldHandler = oldWorker.onmessage!
    const task = backend.extractEntry(0), failure = expect(task).rejects.toMatchObject({ name: 'AbortError' })
    const oldRequest = oldWorker.requests.at(-1)!
    backend.cancel(); await failure
    TestWorker.auto = true; await backend.open(file())
    oldHandler({ data: { id: oldRequest.id, generation: oldRequest.generation, type: 'extracted', result: { data: new ArrayBuffer(4), metrics } } } as MessageEvent<unknown>)
    expect(backend.metrics).toMatchObject({ activeWorkers: 1, wasmInstances: 1, staleMessages: 1 })
    await backend.extractEntry(0); backend.close()
  })
  it('does not let rejected old open terminate a newer opening Worker', async () => {
    TestWorker.auto = false
    const backend = new ExtendedBackend()
    const old = backend.open(file()), failure = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    TestWorker.auto = true
    const current = backend.open(file())
    await failure; await current
    expect(backend.metrics.activeWorkers).toBe(1)
    expect(worker().terminate).not.toHaveBeenCalled()
    backend.close()
  })
  it('rejects ready followed immediately by a transport failure before metadata publication', async () => {
    TestWorker.auto = false
    const backend = new ExtendedBackend(), task = backend.open(file())
    const failure = expect(task).rejects.toMatchObject({ code: 'ARCHIVE_BACKEND_ERROR' })
    const request = worker().requests[0]!
    worker().send({ id: request.id, generation: request.generation, type: 'ready', result: { entries, metrics } })
    worker().onmessageerror?.(); await failure
    expect(backend.metrics.activeWorkers).toBe(0)
  })
  it.each(['ARCHIVE_ENCRYPTED', 'ARCHIVE_WRONG_PASSWORD', 'ARCHIVE_PASSWORD_OR_CORRUPTED'] as const)('retains the instance for credential retry after %s', async code => {
    const backend = new ExtendedBackend(); await backend.open(file()); TestWorker.auto = false
    const task = backend.extractEntry(0, 'public-test-fixture'), failure = expect(task).rejects.toMatchObject({ code })
    const request = worker().requests.at(-1)!
    worker().send({ id: request.id, generation: request.generation, type: 'error', code }); await failure
    expect(backend.metrics.activeWorkers).toBe(1)
    TestWorker.auto = true; await backend.extractEntry(0, 'public-correct-fixture'); backend.close()
    expect(JSON.stringify(backend.metrics)).not.toContain('fixture')
  })
  it('fails malformed response safely and retains no pending resources', async () => {
    const backend = new ExtendedBackend(); await backend.open(file()); TestWorker.auto = false
    const task = backend.extractEntry(0), failure = expect(task).rejects.toMatchObject({ code: 'ARCHIVE_BACKEND_ERROR' })
    worker().send(null); await failure
    expect(backend.metrics).toMatchObject({ activeWorkers: 0, wasmInstances: 0, pendingRequests: 0 })
  })
  it('does not publish output exceeding the cap or invalid heap metrics', async () => {
    const backend = new ExtendedBackend(); await backend.open(file()); TestWorker.auto = false
    const task = backend.extractEntry(0), failure = expect(task).rejects.toMatchObject({ code: 'ARCHIVE_BACKEND_ERROR' })
    const request = worker().requests.at(-1)!
    worker().send({ id: request.id, generation: request.generation, type: 'extracted', result: {
      data: new ArrayBuffer(4 * 1024 ** 2 + 1), metrics: { ...metrics, wasmMaximum: 2147483648 } } })
    await failure; expect(backend.metrics.activeWorkers).toBe(0)
  })
  it('contains failed postMessage and terminates immediately', async () => {
    vi.spyOn(TestWorker.prototype, 'postMessage').mockImplementationOnce(() => { throw new DOMException('bad transport') })
    const backend = new ExtendedBackend()
    await expect(backend.open(file())).rejects.toMatchObject({ code: 'ARCHIVE_BACKEND_ERROR' })
    expect(backend.metrics).toMatchObject({ activeWorkers: 0, pendingRequests: 0, workersCreated: 1, workersTerminated: 1 })
  })
  it('balances ten opens and five cancel/reopen cycles', async () => {
    const backend = new ExtendedBackend()
    for (let i = 0; i < 10; i++) { await backend.open(file()); await backend.extractEntry(0); backend.close() }
    for (let i = 0; i < 5; i++) { await backend.open(file()); backend.cancel(); await backend.open(file()); await backend.extractEntry(0); backend.close() }
    expect(backend.metrics).toMatchObject({ workersCreated: 20, workersTerminated: 20, activeWorkers: 0, wasmInstances: 0, cleanupErrors: 0 })
  })
})
