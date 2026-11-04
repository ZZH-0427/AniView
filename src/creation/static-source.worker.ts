import { StaticFramePreparer, emptyStaticOwnership, staticSourceError } from './static-frame-core'
import { GIF_CREATION_LIMITS, assertSourceLimits } from './gif/gif-validation'
import { EncodeError } from './gif/model'
import { createWorkerTaskYield } from './gif/worker-task-yield'
import type { StaticSourceRequest, StaticSourceResponse } from './static-source-protocol'

type Command = Extract<StaticSourceRequest, { id: number }>
interface Job {
  readonly id: number; readonly durationMs: number; readonly sizes: readonly number[]
  readonly taskYield: ReturnType<typeof createWorkerTaskYield>
  cancelled: boolean; index: number; awaitingAck: boolean; core: StaticFramePreparer | undefined
  pending: { readId: number; index: number; resolve(data: ArrayBuffer): void; reject(error: EncodeError): void } | undefined
}
let job: Job | undefined, readId = 0, queue = Promise.resolve()
const send = (value: StaticSourceResponse, transfer: Transferable[] = []) => globalThis.postMessage(value, { transfer })
const snapshot = (current: Job) => ({ metrics: current.core!.metrics,
  resources: { ...current.core!.resources, awaitingAck: current.awaitingAck ? 1 : 0 } })
const check = (current: Job) => { if (current.cancelled) throw new EncodeError('CANCELLED') }
function cleanup(current: Job) { current.core?.close(); current.awaitingAck = false; current.pending = undefined; current.taskYield.close() }

async function handle(request: Command) {
  if (request.type === 'close') {
    if (job) cleanup(job)
    send({ type: 'closed', job: request.job, id: request.id, resources: emptyStaticOwnership() }); job = undefined; return
  }
  if (request.type === 'open') {
    if (job) throw new EncodeError('WORKER_FAILED')
    assertSourceLimits(request.sizes, GIF_CREATION_LIMITS)
    if (!Number.isInteger(request.durationMs) || request.durationMs < 20 || request.durationMs > 10000 || request.durationMs % 10
      || !Number.isInteger(request.playCount) || request.playCount < 0 || request.playCount > 100) throw new EncodeError('RESOURCE_LIMIT')
    const current: Job = { id: request.job, sizes: request.sizes, durationMs: request.durationMs, taskYield: createWorkerTaskYield(),
      cancelled: false, index: 0, awaitingAck: false, core: undefined, pending: undefined }
    job = current
    current.core = await StaticFramePreparer.open(request.sizes.length, index => new Promise((resolve, reject) => {
      check(current)
      const id = ++readId; current.pending = { readId: id, index, resolve, reject }
      send({ type: 'read', job: current.id, readId: id, index })
    }), { checkpoint: async () => { check(current); await current.taskYield.yield(); check(current) },
      scanned: (completed, total) => send({ type: 'progress', job: current.id, completed, total }) }, GIF_CREATION_LIMITS)
    check(current)
    const { width, height, frameCount } = current.core.metrics
    send({ type: 'ready', id: request.id, job: current.id, metadata: { width, height, frameCount, playCount: request.playCount }, ...snapshot(current) }); return
  }
  const current = job
  if (!current || current.id !== request.job || !current.core) throw new EncodeError('WORKER_FAILED')
  check(current)
  if (request.type === 'ack') {
    if (!current.awaitingAck) throw new EncodeError('WORKER_FAILED')
    current.awaitingAck = false
    send({ type: 'acknowledged', id: request.id, job: current.id, ...snapshot(current) }); return
  }
  if (current.awaitingAck) throw new EncodeError('WORKER_FAILED')
  if (request.type === 'reset') {
    current.core.reset(); current.index = 0
    send({ type: 'reset', id: request.id, job: current.id, ...snapshot(current) }); return
  }
  const rgba = await current.core.next(); check(current)
  if (!rgba) { send({ type: 'end', id: request.id, job: current.id, ...snapshot(current) }); return }
  current.awaitingAck = true
  const frame = { index: current.index++, durationMs: current.durationMs, rgba }
  // The source relinquishes its pixels. Its ACK token still blocks all next-frame preparation.
  current.core.releaseFrame()
  send({ type: 'frame', id: request.id, job: current.id, frame, ...snapshot(current) }, [rgba])
}

globalThis.addEventListener('message', (event: MessageEvent<StaticSourceRequest>) => {
  const request = event.data
  if (request.type === 'source' || request.type === 'source-error') {
    const pending = job?.pending
    if (!job || job.id !== request.job || !pending || pending.readId !== request.readId) return
    job.pending = undefined
    if (request.type === 'source-error' || request.data.byteLength !== job.sizes[pending.index]) pending.reject(new EncodeError('FILE_READ_FAILED'))
    else pending.resolve(request.data)
    return
  }
  if (request.type === 'close' && job) {
    job.cancelled = true; job.pending?.reject(new EncodeError('CANCELLED')); job.pending = undefined
  }
  queue = queue.then(() => handle(request)).catch((cause: unknown) => {
    if (job) cleanup(job)
    const error = staticSourceError(cause)
    send({ type: 'error', id: request.id, job: request.job, code: error.code, ...(error.detail ? { detail: error.detail } : {}) })
  })
})
