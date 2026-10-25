import type { VirtualFile } from '../../input/virtual-file'
import { countRuntimeEvent, trackRuntimeResource } from '../../media/runtime-diagnostics'
import { assertSourceLimits, resolveEncodeLimits } from './gif-validation'
import { EncodeError, resolveEncodeOptions, type EncodedGif, type EncodeLimits, type EncodeOptions, type EncodeProgress } from './model'
import type { EncoderResponse, EncoderWorkerPort } from './protocol'

interface Job {
  readonly id: number
  readonly worker: EncoderWorkerPort
  readonly done: Promise<void>
  readonly settled: () => void
  readonly release: () => void
  readonly resolve: (value: EncodedGif) => void
  readonly reject: (error: EncodeError) => void
  readonly files: readonly VirtualFile[]
  readonly progress: ((value: EncodeProgress) => void) | undefined
  readonly signal: AbortSignal | undefined
  readonly abort: () => void
  timer: ReturnType<typeof setTimeout> | undefined
  cancelling: boolean
  reading: boolean
}
export interface EncodeConfiguration {
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: EncodeProgress) => void
  readonly limits?: EncodeLimits
}

/** A creation-only service. Source handles stay caller-owned; only one read is in flight. */
export class StaticGifEncoder {
  private active: Job | undefined
  private generation = 0
  // VirtualFile.read has no abort contract. Across cancelled/replaced jobs, drain
  // its one outstanding read before allowing another allocation to start.
  private readGate: Promise<void> = Promise.resolve()
  constructor(private readonly createWorker: () => EncoderWorkerPort = () =>
    new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' })) {}

  async encode(files: readonly VirtualFile[], options?: Partial<EncodeOptions>, config?: EncodeConfiguration): Promise<EncodedGif> {
    const id = ++this.generation
    await this.cancelActive()
    if (id !== this.generation || config?.signal?.aborted) throw new EncodeError('CANCELLED')
    const resolved = resolveEncodeOptions(options)
    const limits = resolveEncodeLimits(config?.limits)
    assertSourceLimits(files.map(file => file.size), limits)
    let worker: EncoderWorkerPort
    try { worker = this.createWorker() }
    catch (cause) { throw new EncodeError('WORKER_FAILED', { cause }) }
    let settled = () => {}
    const done = new Promise<void>(resolve => { settled = resolve })
    return new Promise<EncodedGif>((resolve, reject) => {
      const job: Job = {
        id, worker, done, settled, resolve, reject, files: [...files],
        release: trackRuntimeResource('worker'), progress: config?.onProgress,
        signal: config?.signal, abort: () => { void this.cancelJob(job) },
        timer: undefined, cancelling: false, reading: false,
      }
      this.active = job
      worker.onmessage = event => { void this.receive(job, event.data) }
      worker.onerror = event => { event.preventDefault(); this.finish(job, new EncodeError('WORKER_FAILED')) }
      worker.onmessageerror = () => this.finish(job, new EncodeError('WORKER_FAILED'))
      job.signal?.addEventListener('abort', job.abort, { once: true })
      this.arm(job)
      try { worker.postMessage({ type: 'start', id, sizes: files.map(file => file.size), options: resolved, limits }) }
      catch (cause) { this.finish(job, new EncodeError('WORKER_FAILED', { cause })) }
    })
  }

  async cancel() { ++this.generation; await this.cancelActive() }
  private async cancelActive() { if (this.active) await this.cancelJob(this.active) }
  private async cancelJob(job: Job) {
    if (this.active !== job) return
    if (!job.cancelling) {
      job.cancelling = true
      if (job.timer) clearTimeout(job.timer)
      // Cooperative checkpoints can close the bitmap/canvas. A synchronous vendor
      // quantizer cannot process messages mid-call; termination bounds cancellation.
      job.timer = setTimeout(() => this.finish(job, new EncodeError('CANCELLED')), 100)
      try { job.worker.postMessage({ type: 'cancel', id: job.id }) }
      catch { this.finish(job, new EncodeError('CANCELLED')) }
    }
    await job.done
  }
  private arm(job: Job) {
    if (job.timer) clearTimeout(job.timer)
    job.timer = setTimeout(() => this.finish(job, new EncodeError('WORKER_FAILED')), 30_000)
  }
  private async receive(job: Job, message: EncoderResponse) {
    if (this.active !== job || message.id !== job.id) { countRuntimeEvent('staleResultsDiscarded'); return }
    if (job.cancelling) {
      if (message.type === 'error' || message.type === 'result') this.finish(job, new EncodeError('CANCELLED'))
      return
    }
    this.arm(job)
    if (message.type === 'error') { this.finish(job, new EncodeError(message.code, message.detail ? { detail: message.detail } : undefined)); return }
    if (message.type === 'result') {
      if (!(message.result.data instanceof ArrayBuffer) || !Number.isSafeInteger(message.result.byteLength)
        || message.result.byteLength <= 0 || message.result.byteLength > message.result.data.byteLength
        || message.result.byteLength > 64 * 1024 * 1024) this.finish(job, new EncodeError('ENCODING_FAILED'))
      else this.finish(job, undefined, message.result)
      return
    }
    if (message.type === 'progress') {
      try { job.progress?.(message.progress) }
      catch (cause) { this.finish(job, new EncodeError('ENCODING_FAILED', { cause })) }
      return
    }
    const file = job.files[message.index]
    if (job.reading || !Number.isInteger(message.index) || !file) { this.finish(job, new EncodeError('WORKER_FAILED')); return }
    job.reading = true
    const previousRead = this.readGate
    let releaseRead = () => {}
    this.readGate = new Promise<void>(resolve => { releaseRead = resolve })
    try {
      await previousRead
      if (this.active !== job || job.cancelling) return
      const data = await file.read()
      if (this.active !== job || job.cancelling) return
      if (data.byteLength !== file.size) throw new EncodeError('FILE_READ_FAILED')
      job.worker.postMessage({ type: 'source', id: job.id, index: message.index, data }, [data])
    } catch {
      if (this.active === job && !job.cancelling) {
        try { job.worker.postMessage({ type: 'source-error', id: job.id }) }
        catch { this.finish(job, new EncodeError('FILE_READ_FAILED')) }
      }
    } finally { job.reading = false; releaseRead() }
  }
  private finish(job: Job, error?: EncodeError, value?: EncodedGif) {
    if (this.active !== job) return
    this.active = undefined
    if (job.timer) clearTimeout(job.timer)
    job.signal?.removeEventListener('abort', job.abort)
    job.worker.onmessage = null
    job.worker.onerror = null
    job.worker.onmessageerror = null
    try { job.worker.terminate() } finally { job.release(); job.settled() }
    if (error) job.reject(error)
    else if (value) job.resolve(value)
    else job.reject(new EncodeError('ENCODING_FAILED'))
  }
}
