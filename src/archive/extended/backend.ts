import { MediaError } from '../../media/errors'
import type { MediaErrorCode } from '../../media/errors'
import { countRuntimeEvent, trackRuntimeResource } from '../../media/runtime-diagnostics'
import { assertActualOutput, assertExtendedEntries, assertExtendedInput, assertNativeMetrics, extendedDeadline } from './policy'
import { EMPTY_NATIVE_METRICS } from './protocol'
import type { ExtendedCommand, ExtendedEntry, ExtendedExtractResult, ExtendedNativeMetrics,
  ExtendedOpenResult, ExtendedRequest, ExtendedResponse } from './protocol'

export interface ExtendedBackendMetrics {
  readonly workersCreated: number
  readonly workersTerminated: number
  readonly activeWorkers: number
  readonly wasmInstances: number
  readonly pendingRequests: number
  readonly generation: number
  readonly timeouts: number
  readonly staleMessages: number
  readonly cleanupErrors: number
  readonly peakWasmBytes: number
}
interface Pending {
  resolve(value: ExtendedResponse): void
  reject(reason: unknown): void
  timer: ReturnType<typeof setTimeout>
  unlisten(): void
}
const errorCodes: readonly MediaErrorCode[] = ['ARCHIVE_CORRUPTED', 'ARCHIVE_ENCRYPTED', 'ARCHIVE_WRONG_PASSWORD',
  'ARCHIVE_PASSWORD_OR_CORRUPTED', 'ARCHIVE_LIMIT_EXCEEDED', 'ARCHIVE_UNSUPPORTED_METHOD', 'ARCHIVE_BACKEND_ERROR',
  'ARCHIVE_UNSUPPORTED_FORMAT', 'ARCHIVE_UNSUPPORTED', 'ARCHIVE_CLOSED', 'ARCHIVE_BACKEND_ASSET_FAILED',
  'ARCHIVE_WASM_INITIALIZATION_FAILED', 'ARCHIVE_MULTIVOLUME_UNSUPPORTED']
const credentialError = (code: MediaErrorCode) => ['ARCHIVE_ENCRYPTED', 'ARCHIVE_WRONG_PASSWORD', 'ARCHIVE_PASSWORD_OR_CORRUPTED'].includes(code)
const cancelled = () => new DOMException('Cancelled', 'AbortError')
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'
function isMetrics(value: unknown): value is ExtendedNativeMetrics {
  return record(value) && ['wasmBytes', 'wasmMaximum', 'ranges', 'bytesRead', 'maxRead', 'outputBytes', 'mountedArchives', 'instances']
    .every(key => typeof value[key] === 'number')
}
function isEntry(value: unknown): value is ExtendedEntry {
  return record(value) && typeof value.id === 'number' && typeof value.path === 'string'
    && typeof value.normalizedPath === 'string' && typeof value.method === 'string'
    && ['isDirectory', 'isFile', 'special'].every(key => typeof value[key] === 'boolean')
    && ['encrypted', 'solid'].every(key => value[key] === null || typeof value[key] === 'boolean')
    && ['size', 'packedSize', 'attributes', 'dictionaryBytes', 'block'].every(key => value[key] === null || typeof value[key] === 'number')
}
/** Worker boundary validation. Never turn raw exceptions/unknown messages into UI text. */
function checkedResponse(value: unknown): ExtendedResponse {
  if (!record(value) || !Number.isSafeInteger(value.id) || !Number.isSafeInteger(value.generation)) throw new MediaError('ARCHIVE_BACKEND_ERROR')
  const base = { id: value.id as number, generation: value.generation as number }
  if (value.type === 'error' && typeof value.code === 'string' && errorCodes.includes(value.code as MediaErrorCode)) {
    return { ...base, type: 'error', code: value.code as MediaErrorCode }
  }
  if (value.type === 'progress' && typeof value.phase === 'string' && ['loading', 'opening', 'listing', 'extracting'].includes(value.phase)) {
    return { ...base, type: 'progress', phase: value.phase as 'loading' | 'opening' | 'listing' | 'extracting' }
  }
  const list = (entries: unknown): readonly ExtendedEntry[] => {
    if (!Array.isArray(entries) || entries.length > 1000 || !entries.every(isEntry)) throw new MediaError('ARCHIVE_BACKEND_ERROR')
    assertExtendedEntries(entries)
    return Object.freeze(entries.map(entry => Object.freeze({ ...entry })))
  }
  if (value.type === 'ready' && record(value.result) && isMetrics(value.result.metrics)) {
    assertNativeMetrics(value.result.metrics)
    return { ...base, type: 'ready', result: { entries: list(value.result.entries), metrics: value.result.metrics } }
  }
  if (value.type === 'extracted' && record(value.result) && value.result.data instanceof ArrayBuffer && isMetrics(value.result.metrics)) {
    assertActualOutput(value.result.data.byteLength); assertNativeMetrics(value.result.metrics)
    return { ...base, type: 'extracted', result: { data: value.result.data, metrics: value.result.metrics } }
  }
  if (value.type === 'listed') return { ...base, type: 'listed', entries: list(value.entries) }
  if (value.type === 'metrics' && isMetrics(value.metrics)) {
    assertNativeMetrics(value.metrics)
    return { ...base, type: 'metrics', metrics: value.metrics }
  }
  throw new MediaError('ARCHIVE_BACKEND_ERROR')
}

/** One dedicated instance. Cancellation is hard termination, never a queued interrupt. */
export class ExtendedBackend {
  private worker: Worker | undefined
  private releaseWorker: (() => void) | undefined
  private readonly pending = new Map<number, Pending>()
  private requestId = 0
  private counters: ExtendedBackendMetrics = { workersCreated: 0, workersTerminated: 0, activeWorkers: 0,
    wasmInstances: 0, pendingRequests: 0, generation: 0, timeouts: 0, staleMessages: 0, cleanupErrors: 0, peakWasmBytes: 0 }
  private native: ExtendedNativeMetrics = EMPTY_NATIVE_METRICS
  private readonly deadlineMs: number
  private readonly workerFactory: () => Worker
  constructor(options: { deadlineMs?: number; workerFactory?: () => Worker } = {}) {
    this.deadlineMs = extendedDeadline(options.deadlineMs)
    this.workerFactory = options.workerFactory ?? (() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }))
  }
  get metrics(): ExtendedBackendMetrics { return { ...this.counters, pendingRequests: this.pending.size } }
  get nativeMetrics(): ExtendedNativeMetrics { return { ...this.native } }

  async open(source: Blob, password?: string, signal?: AbortSignal): Promise<ExtendedOpenResult> {
    assertExtendedInput(source.size); signal?.throwIfAborted()
    this.start()
    const generation = this.counters.generation
    try {
      const response = await this.request({ type: 'open', source, ...(password === undefined ? {} : { password }) }, signal)
      signal?.throwIfAborted()
      if (!this.worker || generation !== this.counters.generation) throw new MediaError('ARCHIVE_BACKEND_ERROR')
      if (response.type !== 'ready') throw new MediaError('ARCHIVE_BACKEND_ERROR')
      return response.result
    } catch (cause) { if (generation === this.counters.generation) this.stop(cancelled()); throw cause }
  }
  async extractEntry(entryId: number, password?: string, signal?: AbortSignal): Promise<ExtendedExtractResult> {
    if (!Number.isSafeInteger(entryId) || entryId < 0) throw new MediaError('ARCHIVE_UNSUPPORTED')
    const generation = this.counters.generation
    const response = await this.request({ type: 'extract', entryId, ...(password === undefined ? {} : { password }) }, signal)
    signal?.throwIfAborted()
    if (!this.worker || generation !== this.counters.generation) throw cancelled()
    if (response.type !== 'extracted') { this.stop(new MediaError('ARCHIVE_BACKEND_ERROR')); throw new MediaError('ARCHIVE_BACKEND_ERROR') }
    return response.result
  }
  async listEntries(signal?: AbortSignal): Promise<readonly ExtendedEntry[]> {
    const response = await this.request({ type: 'list' }, signal)
    if (response.type !== 'listed') throw new MediaError('ARCHIVE_BACKEND_ERROR')
    return response.entries
  }
  cancel(): void { this.stop(cancelled()) }
  close(): void { this.stop(new MediaError('ARCHIVE_CLOSED')) }

  private start() {
    this.stop(cancelled())
    if (typeof Worker === 'undefined') throw new MediaError('WORKER_FAILED')
    let worker: Worker
    try { worker = this.workerFactory() } catch { throw new MediaError('ARCHIVE_BACKEND_ERROR') }
    const generation = this.counters.generation
    this.worker = worker
    this.releaseWorker = trackRuntimeResource('worker')
    this.counters = { ...this.counters, workersCreated: this.counters.workersCreated + 1, activeWorkers: 1 }
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (this.worker !== worker || this.counters.generation !== generation) {
        this.counters = { ...this.counters, staleMessages: this.counters.staleMessages + 1 }
        countRuntimeEvent('staleResultsDiscarded'); return
      }
      let response: ExtendedResponse
      try { response = checkedResponse(event.data) }
      catch { this.stop(new MediaError('ARCHIVE_BACKEND_ERROR')); return }
      if (response.generation !== generation) {
        this.counters = { ...this.counters, staleMessages: this.counters.staleMessages + 1 }; return
      }
      const pending = this.pending.get(response.id)
      if (!pending) {
        this.counters = { ...this.counters, staleMessages: this.counters.staleMessages + 1 }
        countRuntimeEvent('staleResultsDiscarded'); return
      }
      if (response.type === 'progress') return
      this.pending.delete(response.id); clearTimeout(pending.timer); pending.unlisten()
      if (response.type === 'error') {
        const error = new MediaError(response.code)
        pending.reject(error)
        if (!credentialError(response.code)) this.stop(error)
        return
      }
      if (response.type === 'ready' || response.type === 'extracted' || response.type === 'metrics') {
        this.native = response.type === 'metrics' ? response.metrics : response.result.metrics
        this.counters = { ...this.counters, wasmInstances: this.native.instances,
          peakWasmBytes: Math.max(this.counters.peakWasmBytes, this.native.wasmBytes) }
      }
      pending.resolve(response)
    }
    worker.onerror = event => { event.preventDefault(); this.stop(new MediaError('ARCHIVE_BACKEND_ERROR')) }
    worker.onmessageerror = () => this.stop(new MediaError('ARCHIVE_BACKEND_ERROR'))
  }
  private request(command: ExtendedCommand, signal?: AbortSignal): Promise<ExtendedResponse> {
    if (!this.worker) return Promise.reject(new MediaError('ARCHIVE_CLOSED'))
    if (signal?.aborted) return Promise.reject(cancelled())
    const id = ++this.requestId
    const request: ExtendedRequest = { ...command, id, generation: this.counters.generation }
    return new Promise((resolve, reject) => {
      const abort = () => this.stop(cancelled())
      const timer = setTimeout(() => {
        this.counters = { ...this.counters, timeouts: this.counters.timeouts + 1 }
        this.stop(new MediaError('ARCHIVE_TIMEOUT'))
      }, this.deadlineMs)
      this.pending.set(id, { resolve, reject, timer, unlisten: () => signal?.removeEventListener('abort', abort) })
      signal?.addEventListener('abort', abort, { once: true })
      try { this.worker!.postMessage(request) } catch { this.stop(new MediaError('ARCHIVE_BACKEND_ERROR')) }
    })
  }
  private stop(reason: Error) {
    this.counters = { ...this.counters, generation: this.counters.generation + 1, wasmInstances: 0 }
    const worker = this.worker
    this.worker = undefined
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      try { worker.terminate() } catch { this.counters = { ...this.counters, cleanupErrors: this.counters.cleanupErrors + 1 }; countRuntimeEvent('cleanupErrors') }
      this.releaseWorker?.(); this.releaseWorker = undefined
      this.counters = { ...this.counters, workersTerminated: this.counters.workersTerminated + 1, activeWorkers: 0 }
    }
    this.native = { ...this.native, wasmBytes: 0, instances: 0, mountedArchives: 0, outputBytes: 0 }
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.unlisten(); pending.reject(reason) }
    this.pending.clear()
  }
}
