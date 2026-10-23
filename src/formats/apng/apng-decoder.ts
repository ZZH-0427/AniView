import type { VirtualFile } from '../../input/virtual-file'
import { MediaError } from '../../media/errors'
import type { APNGRequest, APNGResponse } from './apng-worker-protocol'

type Command = { type: 'open'; data: ArrayBuffer } | { type: 'next' | 'reset' | 'close' }
interface Pending {
  readonly id: number
  readonly resolve: (value: APNGResponse) => void
  readonly reject: (reason: MediaError) => void
  readonly timer: ReturnType<typeof setTimeout>
}

/** Per-sequence Worker transport; one operation in flight, no decoded-frame queue. */
export class APNGDecoder {
  private readonly worker: Worker
  private pending: Pending | undefined
  private disposed = false
  private id = 0
  constructor() {
    if (typeof Worker === 'undefined') throw new MediaError('APNG_RUNTIME_UNAVAILABLE')
    try { this.worker = new Worker(new URL('./apng-decoder.worker.ts', import.meta.url), { type: 'module' }) }
    catch (cause) { throw new MediaError('WORKER_FAILED', { cause }) }
    this.worker.onmessage = (event: MessageEvent<APNGResponse>) => {
      const response = event.data
      const pending = this.pending
      if (!pending || response.id !== pending.id) return
      this.pending = undefined
      clearTimeout(pending.timer)
      if (response.type === 'error') pending.reject(new MediaError(response.code))
      else pending.resolve(response)
    }
    this.worker.onerror = event => { event.preventDefault(); this.dispose() }
    this.worker.onmessageerror = () => this.dispose()
  }
  async open(file: VirtualFile) {
    if (file.size > 64 * 1024 * 1024) throw new MediaError('OUT_OF_MEMORY')
    let data: ArrayBuffer
    try { data = await file.read() } catch (cause) { throw new MediaError('FILE_READ_FAILED', { cause }) }
    return this.request({ type: 'open', data }, [data])
  }
  next() { return this.request({ type: 'next' }) }
  reset() { return this.request({ type: 'reset' }) }
  close() { return this.request({ type: 'close' }) }
  private request(command: Command, transfer: Transferable[] = []): Promise<APNGResponse> {
    if (this.disposed) return Promise.reject(new MediaError('WORKER_FAILED'))
    if (this.pending) return Promise.reject(new MediaError('DECODE_FAILED'))
    const request: APNGRequest = { ...command, id: ++this.id }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.dispose(), 15000)
      this.pending = { id: request.id, resolve, reject, timer }
      try { this.worker.postMessage(request, transfer) } catch { this.dispose() }
    })
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.worker.terminate()
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(new MediaError('WORKER_FAILED'))
      this.pending = undefined
    }
  }
}
