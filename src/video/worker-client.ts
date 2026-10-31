import { trackRuntimeResource } from '../media/runtime-diagnostics'
import type { CanonicalAnimationFrame, CanonicalAnimationMetadata } from '../conversion/model'
import { VideoError } from './model'
import type { VideoRequest, VideoResponse } from './protocol'
import workerUrl from './encoder.worker.ts?worker&url'
type Command = Omit<Extract<VideoRequest, { type: 'open' }>, 'id'> | Omit<Extract<VideoRequest, { type: 'frame' }>, 'id'> | { type: 'finish' }
export class VideoWorkerClient {
  private readonly worker: Worker
  private readonly release: () => void
  private pending: { id: number; resolve(r: VideoResponse): void; reject(e: VideoError): void; timer: ReturnType<typeof setTimeout> } | undefined
  private id = 0
  private closed = false
  constructor(url = new URL(workerUrl, import.meta.url), createWorker = (u: URL) => new Worker(u, { type: 'module' })) {
    try { this.worker = createWorker(url) } catch { throw new VideoError('VIDEO_ENCODER_UNSUPPORTED') }
    this.release = trackRuntimeResource('worker')
    this.worker.onmessage = (event: MessageEvent<VideoResponse>) => {
      const p = this.pending, r = event.data
      if (!p || p.id !== r.id) return
      this.pending = undefined; clearTimeout(p.timer)
      if (r.type === 'error') p.reject(new VideoError(r.code)); else p.resolve(r)
    }
    this.worker.onerror = e => { e.preventDefault(); this.dispose() }
    this.worker.onmessageerror = () => this.dispose()
  }
  private request(command: Command, transfer: Transferable[] = []) {
    if (this.closed || this.pending) return Promise.reject(new VideoError('WORKER_FAILED'))
    const id = ++this.id
    return new Promise<VideoResponse>((resolve, reject) => {
      const timer = setTimeout(() => this.dispose(), 120_000)
      this.pending = { id, resolve, reject, timer }
      try { this.worker.postMessage({ ...command, id } satisfies VideoRequest, transfer) } catch { this.dispose() }
    })
  }
  async open(metadata: CanonicalAnimationMetadata) { const r = await this.request({ type: 'open', metadata }); if (r.type !== 'ready') throw new VideoError('WORKER_FAILED'); return r.probe }
  async addFrame(frame: CanonicalAnimationFrame) {
    const pending = this.request({ type: 'frame', frame }, [frame.rgba])
    if (frame.rgba.byteLength) { this.dispose(); await pending.catch(() => {}); throw new VideoError('WORKER_FAILED') }
    const r = await pending; if (r.type !== 'accepted') throw new VideoError('WORKER_FAILED'); return r.metrics
  }
  async finish() { const r = await this.request({ type: 'finish' }); if (r.type !== 'result') throw new VideoError('WORKER_FAILED'); return r.result }
  dispose(reason = new VideoError('WORKER_FAILED')) {
    if (this.closed) return
    this.closed = true; this.worker.terminate(); this.release()
    const p = this.pending; this.pending = undefined
    if (p) { clearTimeout(p.timer); p.reject(reason) }
  }
}
