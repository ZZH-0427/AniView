import { MediaError } from '../media/errors'
import { assertArchiveFileSize, normalizeArchiveLimits } from './archive-policy'
import type { ArchiveEntryMetadata, ArchiveLimits } from './archive-policy'
import type { ArchiveEngineMetrics } from './archive-engine'
import { ArchiveEntryVirtualFile } from './archive-entry-virtual-file'
import type { ArchiveCommand, ArchiveRequest, ArchiveResponse } from './archive-worker-protocol'
import { countRuntimeEvent, trackRuntimeResource } from '../media/runtime-diagnostics'

interface Pending {
  resolve(value: ArchiveResponse): void
  reject(reason: unknown): void
  timer: ReturnType<typeof setTimeout>
  unlisten(): void
}
export interface ArchiveMetrics extends ArchiveEngineMetrics {
  readonly currentEntryId: number | null
  readonly currentExtractedBytes: number
  readonly peakExtractedBytes: number
}
let archiveIdentity = 0

/** One archive Worker and at most one current extracted Blob, never a visited-entry cache. */
export class ArchiveSession {
  readonly id = `archive-${++archiveIdentity}`
  readonly name: string
  private entryList: readonly ArchiveEntryMetadata[] = []
  private fileList: readonly ArchiveEntryVirtualFile[] = []
  private readonly worker: Worker
  private readonly releaseWorker: () => void
  private releaseArchive: (() => void) | undefined
  private readonly pending = new Map<number, Pending>()
  private requestId = 0
  private generation = 0
  private closed = false
  private terminated = false
  private closing: Promise<void> | undefined
  private cached: { entryId: number; blob: Blob } | undefined
  private active: { entryId: number; controller: AbortController; promise: Promise<Blob> } | undefined
  private counters: ArchiveMetrics = { entryCount: 0, mediaCount: 0, totalDeclaredBytes: 0,
    extractions: 0, metadataMs: 0, extractMs: 0, currentEntryId: null,
    currentExtractedBytes: 0, peakExtractedBytes: 0 }

  private constructor(file: File) {
    this.name = file.name
    if (typeof Worker === 'undefined') throw new MediaError('WORKER_FAILED')
    try { this.worker = new Worker(new URL('./archive.worker.ts', import.meta.url), { type: 'module' }) }
    catch (cause) { throw new MediaError('WORKER_FAILED', { cause }) }
    this.releaseWorker = trackRuntimeResource('worker')
    this.worker.onmessage = (event: MessageEvent<ArchiveResponse>) => {
      const response = event.data
      if (!response || typeof response !== 'object' || !Number.isSafeInteger(response.id)
        || !['ready', 'extracted', 'closed', 'error'].includes(response.type)) {
        this.terminate(new MediaError('WORKER_FAILED'))
        return
      }
      const pending = this.pending.get(response.id)
      if (!pending) {
        if (response.type === 'extracted') {
          countRuntimeEvent('entryExtractionsDiscarded')
          countRuntimeEvent('staleResultsDiscarded')
        }
        return
      }
      this.pending.delete(response.id)
      clearTimeout(pending.timer)
      pending.unlisten()
      if (response.type === 'error') {
        if (!response.aborted) countRuntimeEvent('archiveErrors')
        pending.reject(response.aborted ? new DOMException('Cancelled', 'AbortError') : new MediaError(response.code))
      }
      else pending.resolve(response)
    }
    this.worker.onerror = event => { event.preventDefault(); this.terminate(new MediaError('WORKER_FAILED')) }
    this.worker.onmessageerror = () => this.terminate(new MediaError('WORKER_FAILED'))
  }

  static async open(file: File, options: { limits?: Partial<ArchiveLimits>; signal?: AbortSignal } = {}): Promise<ArchiveSession> {
    const limits = normalizeArchiveLimits(options.limits)
    assertArchiveFileSize(file.size, limits)
    options.signal?.throwIfAborted()
    const session = new ArchiveSession(file)
    try {
      const response = await session.request({ type: 'open', file, limits }, options.signal)
      options.signal?.throwIfAborted()
      // A ready message can be followed by a transport failure before this
      // continuation runs. Never publish metadata or revive that dead session.
      if (session.closed) throw new MediaError('WORKER_FAILED')
      if (response.type !== 'ready') throw new MediaError('ARCHIVE_CORRUPTED')
      session.entryList = Object.freeze(response.entries.map(entry => Object.freeze(entry)))
      session.fileList = Object.freeze(session.entries.filter(entry => entry.mediaCandidate).map(entry => new ArchiveEntryVirtualFile(session, entry)))
      session.counters = { ...session.counters, ...response.metrics }
      session.releaseArchive = trackRuntimeResource('archive')
      return session
    } catch (cause) { await session.close(); throw cause }
  }

  get metrics(): ArchiveMetrics { return { ...this.counters } }
  get entries(): readonly ArchiveEntryMetadata[] { return this.entryList }
  get files(): readonly ArchiveEntryVirtualFile[] { return this.fileList }

  extractEntry(entryId: number, options: { password?: string; signal?: AbortSignal } = {}): Promise<Blob> {
    if (this.closed) return Promise.reject(new MediaError('ARCHIVE_CLOSED'))
    if (options.signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
    const entry = this.entries[entryId]
    if (!entry || entry.directory) return Promise.reject(new MediaError('ARCHIVE_UNSUPPORTED'))
    if (entry.blockedCode) return Promise.reject(new MediaError(entry.blockedCode))
    if (entry.encrypted && options.password === undefined) return Promise.reject(new MediaError('ARCHIVE_ENCRYPTED'))
    if (this.cached?.entryId === entryId) return Promise.resolve(this.cached.blob)
    if (this.active?.entryId === entryId && !this.active.controller.signal.aborted) return this.active.promise
    const previous = this.active
    previous?.controller.abort()
    this.cached = undefined
    const generation = ++this.generation
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    this.counters = { ...this.counters, currentEntryId: entryId, currentExtractedBytes: 0 }
    const promise = (async () => {
      try {
        await previous?.promise.catch(() => undefined)
        controller.signal.throwIfAborted()
        if (this.closed || this.generation !== generation) throw new DOMException('Cancelled', 'AbortError')
        countRuntimeEvent('entryExtractionsStarted')
        const response = await this.request({ type: 'extract', entryId,
          ...(options.password === undefined ? {} : { password: options.password }) }, controller.signal)
        if (controller.signal.aborted || this.closed || this.generation !== generation) {
          if (response.type === 'extracted') {
            countRuntimeEvent('entryExtractionsDiscarded')
            countRuntimeEvent('staleResultsDiscarded')
          }
          throw new DOMException('Cancelled', 'AbortError')
        }
        if (response.type !== 'extracted') throw new MediaError('ARCHIVE_CORRUPTED')
        countRuntimeEvent('entryExtractionsCompleted')
        this.cached = { entryId, blob: response.blob }
        this.counters = { ...this.counters, ...response.metrics, currentEntryId: entryId,
          currentExtractedBytes: response.blob.size,
          peakExtractedBytes: Math.max(this.counters.peakExtractedBytes, response.blob.size) }
        return response.blob
      } finally {
        options.signal?.removeEventListener('abort', abort)
        if (this.active?.controller === controller) this.active = undefined
      }
    })()
    this.active = { entryId, controller, promise }
    return promise
  }

  async releaseEntry(entryId: number): Promise<void> {
    if (this.cached?.entryId === entryId) this.cached = undefined
    const active = this.active?.entryId === entryId ? this.active : undefined
    if (active) { ++this.generation; active.controller.abort() }
    if (this.counters.currentEntryId === entryId) this.counters = { ...this.counters, currentEntryId: null, currentExtractedBytes: 0 }
    await active?.promise.catch(() => undefined)
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    ++this.generation
    this.cached = undefined
    this.active?.controller.abort()
    this.counters = { ...this.counters, currentEntryId: null, currentExtractedBytes: 0 }
    this.closing = (async () => {
      try { if (!this.terminated) await this.request({ type: 'close' }, undefined, 2000) }
      catch { /* A stuck/malformed input still has a bounded Worker lifetime. */ }
      finally { this.terminate(new MediaError('ARCHIVE_CLOSED')); this.fileList = []; this.entryList = [] }
    })()
    return this.closing
  }

  private request(command: ArchiveCommand, signal?: AbortSignal, timeout = 30000): Promise<ArchiveResponse> {
    if (this.terminated) return Promise.reject(new MediaError('ARCHIVE_CLOSED'))
    if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
    const id = ++this.requestId
    const request: ArchiveRequest = { ...command, id }
    return new Promise((resolve, reject) => {
      const cancel = () => {
        // Abort listeners run outside the request promise's executor. A failed
        // cancellation send must reject/terminate here, not escape as a global
        // exception and leave the caller waiting for the operation timeout.
        try { this.worker.postMessage({ type: 'cancel', target: id } satisfies ArchiveRequest) }
        catch { this.terminate(new MediaError('WORKER_FAILED')) }
      }
      const timer = setTimeout(() => this.terminate(new MediaError('WORKER_FAILED')), timeout)
      this.pending.set(id, { resolve, reject, timer, unlisten: () => signal?.removeEventListener('abort', cancel) })
      signal?.addEventListener('abort', cancel, { once: true })
      try { this.worker.postMessage(request) } catch { this.terminate(new MediaError('WORKER_FAILED')) }
    })
  }

  private terminate(error: MediaError) {
    if (this.terminated) return
    if (error.code === 'WORKER_FAILED') countRuntimeEvent('archiveErrors')
    this.terminated = this.closed = true
    this.cached = undefined
    this.fileList = []
    this.entryList = []
    this.counters = { ...this.counters, currentEntryId: null, currentExtractedBytes: 0 }
    this.worker.terminate()
    this.releaseWorker()
    this.releaseArchive?.()
    this.releaseArchive = undefined
    this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.unlisten(); pending.reject(error) }
    this.pending.clear()
  }
}
