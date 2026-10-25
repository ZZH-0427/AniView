import { runEncoding } from './encoder-core'
import { EncodeError } from './model'
import type { EncoderRequest, EncoderResponse } from './protocol'

interface Job {
  readonly id: number
  readonly sizes: readonly number[]
  cancelled: boolean
  pending: { readonly index: number; readonly resolve: (data: ArrayBuffer) => void; readonly reject: (cause: EncodeError) => void } | undefined
}
let job: Job | undefined
const send = (response: EncoderResponse, transfer: Transferable[] = []) => globalThis.postMessage(response, { transfer })

async function start(request: Extract<EncoderRequest, { type: 'start' }>) {
  if (job) { send({ type: 'error', id: request.id, code: 'WORKER_FAILED' }); return }
  const current: Job = { id: request.id, sizes: request.sizes, cancelled: false, pending: undefined }
  job = current
  try {
    if (current.sizes.some(size => !Number.isSafeInteger(size) || size < 0 || size > 64 * 1024 * 1024)) throw new EncodeError('RESOURCE_LIMIT')
    const result = await runEncoding(current.sizes.length, index => new Promise((resolve, reject) => {
      if (current.cancelled) { reject(new EncodeError('CANCELLED')); return }
      current.pending = { index, resolve, reject }
      send({ type: 'read', id: current.id, index })
    }), request.options, {
      progress: progress => send({ type: 'progress', id: current.id, progress }),
      checkpoint: async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        if (current.cancelled) throw new EncodeError('CANCELLED')
      },
    })
    if (current.cancelled) throw new EncodeError('CANCELLED')
    send({ type: 'result', id: current.id, result }, [result.data])
  } catch (cause) {
    send({ type: 'error', id: current.id, code: cause instanceof EncodeError ? cause.code : 'WORKER_FAILED' })
  } finally {
    current.pending = undefined
    job = undefined
  }
}

globalThis.addEventListener('message', (event: MessageEvent<EncoderRequest>) => {
  const request = event.data
  if (request.type === 'start') { void start(request); return }
  const current = job
  if (!current || current.id !== request.id) return
  if (request.type === 'cancel') {
    current.cancelled = true
    current.pending?.reject(new EncodeError('CANCELLED'))
    current.pending = undefined
  } else if (request.type === 'source-error') {
    current.pending?.reject(new EncodeError('FILE_READ_FAILED'))
    current.pending = undefined
  } else if (request.type === 'source') {
    const pending = current.pending
    if (!pending || pending.index !== request.index) return
    current.pending = undefined
    if (request.data.byteLength !== current.sizes[request.index]) pending.reject(new EncodeError('FILE_READ_FAILED'))
    else pending.resolve(request.data)
  }
})
