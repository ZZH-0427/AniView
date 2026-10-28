import { trackRuntimeResource } from '../media/runtime-diagnostics'
import { ConversionError } from './model'
import type { CanonicalAnimationFrame, CanonicalAnimationMetadata, ConversionFormat } from './model'
import type { EncoderRequest, EncoderResponse } from './protocol'

type Command = Omit<Extract<EncoderRequest, { type: 'open' }>, 'id'>
  | Omit<Extract<EncoderRequest, { type: 'frame' }>, 'id'> | { readonly type: 'finish' | 'close' }

export class EncoderWorkerClient {
  private readonly worker: Worker
  private readonly releaseWorker: () => void
  private pending: { id: number; resolve(value: EncoderResponse): void; reject(error: ConversionError): void; timer: ReturnType<typeof setTimeout> } | undefined
  private id = 0
  private closed = false
  readonly capabilities = { deflate: false }
  constructor() {
    try { this.worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' }) }
    catch (cause) { throw new ConversionError('WORKER_FAILED', { cause }) }
    this.releaseWorker = trackRuntimeResource('worker')
    this.worker.onmessage = (event: MessageEvent<EncoderResponse>) => {
      const value = event.data, pending = this.pending
      if (!pending || value.id !== pending.id) return
      this.pending = undefined; clearTimeout(pending.timer)
      if (value.type === 'error') pending.reject(new ConversionError(value.code))
      else pending.resolve(value)
    }
    this.worker.onerror = event => { event.preventDefault(); this.dispose() }
    this.worker.onmessageerror = () => this.dispose()
  }
  async open(target: ConversionFormat, metadata: CanonicalAnimationMetadata) {
    const value = await this.request({ type: 'open', target, metadata })
    if (value.type !== 'ready') throw new ConversionError('WORKER_FAILED')
    this.capabilities.deflate = value.capabilities.deflate
  }
  async addFrame(frame: CanonicalAnimationFrame) {
    const response = this.request({ type: 'frame', frame }, [frame.rgba])
    if (frame.rgba.byteLength !== 0) {
      this.dispose(); await response.catch(() => {})
      throw new ConversionError('WORKER_FAILED')
    }
    const value = await response
    if (value.type !== 'accepted') throw new ConversionError('WORKER_FAILED')
    return value.metrics
  }
  async finish() {
    const value = await this.request({ type: 'finish' })
    if (value.type !== 'result') throw new ConversionError('WORKER_FAILED')
    return value.result
  }
  private request(command: Command, transfer: Transferable[] = []): Promise<EncoderResponse> {
    if (this.closed || this.pending) return Promise.reject(new ConversionError('WORKER_FAILED'))
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.dispose(), 120_000)
      this.pending = { id, resolve, reject, timer }
      try { this.worker.postMessage({ ...command, id } satisfies EncoderRequest, transfer) }
      catch { this.dispose() }
    })
  }
  dispose() {
    if (this.closed) return
    this.closed = true; this.worker.terminate(); this.releaseWorker()
    const pending = this.pending; this.pending = undefined
    if (pending) { clearTimeout(pending.timer); pending.reject(new ConversionError('WORKER_FAILED')) }
  }
}
