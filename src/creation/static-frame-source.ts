import type { VirtualFile } from '../input/virtual-file'
import { countRuntimeEvent, trackRuntimeResource } from '../media/runtime-diagnostics'
import type { AnimationFrameSource, CanonicalAnimationMetadata, SourceMetrics } from '../conversion/model'
import { validateCanonicalFrame, validateCanonicalMetadata } from '../conversion/model'
import { GIF_CREATION_LIMITS, assertSourceLimits } from './gif/gif-validation'
import { EncodeError } from './gif/model'
import { emptyStaticOwnership } from './static-frame-core'
import type { StaticOwnership, StaticPreparationMetrics } from './static-frame-core'
import type { StaticSourcePort, StaticSourceRequest, StaticSourceResponse } from './static-source-protocol'

/** A borrowed read cannot be aborted. Drain it before a replacement job allocates another. */
export class StaticSourceReadGate {
  private tail: Promise<void> = Promise.resolve()
  async read(file: VirtualFile, current: () => boolean) {
    const previous = this.tail
    let release = () => {}
    this.tail = new Promise<void>(resolve => { release = resolve })
    try {
      await previous
      if (!current()) throw new EncodeError('CANCELLED')
      const bytes = await file.read()
      if (!current()) throw new EncodeError('CANCELLED')
      if (bytes.byteLength !== file.size) throw new EncodeError('FILE_READ_FAILED')
      return bytes
    } finally { release() }
  }
}
export interface StaticSourceConfiguration {
  readonly durationMs: number; readonly playCount: number; readonly signal?: AbortSignal
  readonly scanned?: (completed: number, total: number) => void
  readonly observe?: (resources: StaticOwnership) => void
  readonly reads?: StaticSourceReadGate
  readonly createWorker?: () => StaticSourcePort
}
let nextJob = 0
type Command = { type: 'next' | 'ack' | 'reset' | 'close' } |
  { type: 'open'; sizes: readonly number[]; durationMs: number; playCount: number }

/** Static handles remain Session-owned. Main only forwards encoded bytes and transferable pixels. */
export class StaticImageSequenceSource implements AnimationFrameSource {
  private readonly worker: StaticSourcePort
  private readonly releaseWorker: () => void
  private readonly job = ++nextJob
  private requestId = 0
  private pending: { id: number; resolve(value: StaticSourceResponse): void; reject(cause: EncodeError): void; timer: ReturnType<typeof setTimeout> } | undefined
  private meta: CanonicalAnimationMetadata | undefined
  private preparation: StaticPreparationMetrics | undefined
  private ownership = emptyStaticOwnership()
  private held: ArrayBuffer | undefined
  private index = 0
  private busy = false
  private reading = false
  private closed = false
  private terminated = false
  private closing: Promise<void> | undefined
  private acknowledgement: Promise<void> = Promise.resolve()
  private readonly reads: StaticSourceReadGate
  softClosed = false
  private readonly abort = () => { void this.close() }
  private constructor(private readonly files: readonly VirtualFile[], private readonly config: StaticSourceConfiguration) {
    this.reads = config.reads ?? new StaticSourceReadGate()
    try { this.worker = (config.createWorker ?? (() => new Worker(new URL('./static-source.worker.ts', import.meta.url), { type: 'module' })))() }
    catch (cause) { throw new EncodeError('WORKER_FAILED', { cause }) }
    this.releaseWorker = trackRuntimeResource('worker')
    this.worker.onmessage = event => { this.receive(event.data) }
    this.worker.onerror = event => { event.preventDefault(); this.fail() }
    this.worker.onmessageerror = () => this.fail()
    config.signal?.addEventListener('abort', this.abort, { once: true })
  }
  static async open(files: readonly VirtualFile[], config: StaticSourceConfiguration) {
    assertSourceLimits(files.map(f => f.size), GIF_CREATION_LIMITS)
    if (config.signal?.aborted) throw new EncodeError('CANCELLED')
    const source = new StaticImageSequenceSource([...files], config)
    try {
      const response = await source.request({ type: 'open', sizes: files.map(f => f.size), durationMs: config.durationMs, playCount: config.playCount })
      if (response.type !== 'ready') throw new EncodeError('WORKER_FAILED')
      validateCanonicalMetadata(response.metadata)
      if (response.metadata.frameCount !== files.length || response.metadata.playCount !== config.playCount) throw new EncodeError('WORKER_FAILED')
      source.meta = response.metadata
      return source
    } catch (cause) { await source.close(); throw cause }
  }
  get metadata() { if (!this.meta) throw new EncodeError('WORKER_FAILED'); return this.meta }
  get preparationMetrics() { if (!this.preparation) throw new EncodeError('WORKER_FAILED'); return this.preparation }
  get resources() { return this.ownership }
  get metrics(): SourceMetrics { return { decodeMs: this.preparationMetrics.decodeMs, decoderHeapBytes: 0, decoderBackupBytes: 0,
    canvasReadbackFrames: this.index, directRgbaFrames: 0 } }
  private owned(value: StaticOwnership) { this.ownership = value; this.config.observe?.(value) }
  private receive(value: StaticSourceResponse) {
    if (value.job !== this.job) { countRuntimeEvent('staleResultsDiscarded'); return }
    if (value.type === 'read') { if (!this.closed) void this.read(value.readId, value.index); return }
    if (value.type === 'progress') { if (!this.closed) this.config.scanned?.(value.completed, value.total); return }
    const pending = this.pending
    if (!pending || value.id !== pending.id) { countRuntimeEvent('staleResultsDiscarded'); return }
    if (value.type === 'closed') this.owned(value.resources)
    else if ('metrics' in value) { this.preparation = value.metrics; this.owned(value.resources) }
    this.pending = undefined; clearTimeout(pending.timer)
    if (value.type === 'error') pending.reject(new EncodeError(value.code, value.detail ? { detail: value.detail } : undefined))
    else pending.resolve(value)
  }
  private async read(readId: number, index: number) {
    const file = this.files[index]
    if (this.reading || !Number.isInteger(index) || !file) { this.fail(); return }
    this.reading = true
    try {
      const data = await this.reads.read(file, () => !this.closed && !this.config.signal?.aborted)
      if (!this.closed) this.worker.postMessage({ type: 'source', job: this.job, readId, data }, [data])
    } catch {
      if (!this.closed) try { this.worker.postMessage({ type: 'source-error', job: this.job, readId }) } catch { this.fail() }
    } finally { this.reading = false }
  }
  private request(command: Command, timeout = 30_000): Promise<StaticSourceResponse> {
    if (this.terminated || this.pending || (this.closed && command.type !== 'close')) return Promise.reject(new EncodeError('WORKER_FAILED'))
    const id = ++this.requestId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), timeout)
      this.pending = { id, resolve, reject, timer }
      try { this.worker.postMessage({ ...command, id, job: this.job } satisfies StaticSourceRequest) } catch { this.fail() }
    })
  }
  private rejectPending(code: 'CANCELLED' | 'WORKER_FAILED') {
    const pending = this.pending; this.pending = undefined
    if (pending) { clearTimeout(pending.timer); pending.reject(new EncodeError(code)) }
  }
  private terminate() {
    if (this.terminated) return
    this.terminated = true; this.worker.onmessage = null; this.worker.onerror = null; this.worker.onmessageerror = null
    try { this.worker.terminate() } finally { this.releaseWorker(); this.owned(emptyStaticOwnership()) }
  }
  private fail() { this.rejectPending(this.config.signal?.aborted ? 'CANCELLED' : 'WORKER_FAILED'); this.terminate() }
  async next() {
    if (this.closed || this.busy || this.held) throw new EncodeError('WORKER_FAILED')
    this.busy = true
    try {
      await this.acknowledgement
      const response = await this.request({ type: 'next' })
      if (response.type === 'end') { if (this.index !== this.metadata.frameCount) throw new EncodeError('WORKER_FAILED'); return null }
      if (response.type !== 'frame') throw new EncodeError('WORKER_FAILED')
      validateCanonicalFrame(response.frame, this.metadata, this.index)
      this.index++; this.held = response.frame.rgba
      return response.frame
    } finally { this.busy = false }
  }
  acknowledgeFrame() {
    if (this.closed || this.busy || !this.held || this.held.byteLength !== 0) throw new EncodeError('WORKER_FAILED')
    this.held = undefined
    this.acknowledgement = this.request({ type: 'ack' }).then(response => { if (response.type !== 'acknowledged') throw new EncodeError('WORKER_FAILED') })
    void this.acknowledgement.catch(() => {})
  }
  async reset() {
    if (this.closed || this.busy || this.held) throw new EncodeError('WORKER_FAILED')
    this.busy = true
    try { await this.acknowledgement; const response = await this.request({ type: 'reset' }); if (response.type !== 'reset') throw new EncodeError('WORKER_FAILED'); this.index = 0 }
    finally { this.busy = false }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; this.held = undefined; this.config.signal?.removeEventListener('abort', this.abort)
    this.rejectPending('CANCELLED')
    this.closing = (async () => {
      try {
        if (!this.terminated) { const response = await this.request({ type: 'close' }, 100); this.softClosed = response.type === 'closed' }
      } catch { /* A stuck native decode is bounded by the same 100ms fallback as the legacy source. */ }
      finally { this.terminate() }
    })()
    return this.closing
  }
}
