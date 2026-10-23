import { MediaError } from '../media/errors'
import { ArchiveEngine, archiveFailure } from './archive-engine'
import type { ArchiveRequest, ArchiveResponse } from './archive-worker-protocol'

let engine: ArchiveEngine | undefined
let closed = false
const operations = new Map<number, { controller: AbortController; promise: Promise<void> }>()
function send(response: ArchiveResponse) { globalThis.postMessage(response) }

async function perform(request: Exclude<ArchiveRequest, { type: 'cancel' }>, controller: AbortController) {
  try {
    if (request.type === 'close') {
      closed = true
      for (const operation of operations.values()) operation.controller.abort()
      await Promise.allSettled([...operations.values()].map(operation => operation.promise))
      await engine?.close()
      engine = undefined
      send({ id: request.id, type: 'closed' })
      return
    }
    if (closed) throw new MediaError('ARCHIVE_CLOSED')
    if (request.type === 'open') {
      if (engine) throw new MediaError('ARCHIVE_UNSUPPORTED')
      const opened = await ArchiveEngine.open(request.file, request.limits, controller.signal)
      if (closed || controller.signal.aborted) { await opened.close(); controller.signal.throwIfAborted(); throw new MediaError('ARCHIVE_CLOSED') }
      engine = opened
      send({ id: request.id, type: 'ready', entries: engine.metadata, metrics: engine.metrics })
      return
    }
    if (!engine) throw new MediaError('ARCHIVE_CLOSED')
    const blob = await engine.extract(request.entryId, { signal: controller.signal,
      ...(request.password === undefined ? {} : { password: request.password }) })
    controller.signal.throwIfAborted()
    if (closed) throw new MediaError('ARCHIVE_CLOSED')
    send({ id: request.id, type: 'extracted', blob, metrics: engine.metrics })
  } catch (cause) {
    const error = archiveFailure(cause)
    send({ id: request.id, type: 'error', code: error instanceof MediaError ? error.code : 'ARCHIVE_CLOSED',
      ...(error.name === 'AbortError' ? { aborted: true } : {}) })
  }
}

globalThis.addEventListener('message', (event: MessageEvent<ArchiveRequest>) => {
  const request = event.data
  if (request.type === 'cancel') { operations.get(request.target)?.controller.abort(); return }
  const controller = new AbortController()
  if (request.type === 'close') { void perform(request, controller); return }
  const promise = perform(request, controller)
  operations.set(request.id, { controller, promise })
  void promise.finally(() => operations.delete(request.id))
})
