import createModule from './wasm/aniview-webp.mjs'
import type { WebPModule } from './wasm/aniview-webp.mjs'
import wasmUrl from './wasm/aniview-webp.wasm?url'
import { MediaError } from '../../media/errors'
import { frameDuration } from './webp-worker-protocol'
import type { WorkerRequest, WorkerResponse, WebPMetadata } from './webp-worker-protocol'

let module: WebPModule | undefined
let context = 0
let metadata: WebPMetadata | undefined
let frameIndex = 0
let previousTimestamp = 0
let wasmReadyMs = 0

function close() {
  if (context && module) module._aniview_webp_destroy(context)
  context = 0
  metadata = undefined
  frameIndex = 0
  previousTimestamp = 0
}

function send(response: WorkerResponse, transfer: Transferable[] = []) {
  // The same options shape works in a Dedicated Worker; no Window is accessed.
  globalThis.postMessage(response, { transfer })
}

async function handle(request: WorkerRequest) {
  if (request.type === 'close') { close(); send({ id: request.id, type: 'closed' }); return }
  if (request.type === 'open') {
    close()
    if (!(request.data instanceof ArrayBuffer) || request.data.byteLength === 0) throw new MediaError('CORRUPTED_FILE')
    if (request.data.byteLength > 64 * 1024 * 1024) throw new MediaError('OUT_OF_MEMORY')
    if (!module) {
      const start = performance.now()
      try {
        module = await createModule({ locateFile: () => wasmUrl, printErr: () => { /* Report normalized errors only. */ } })
      } catch (cause) { throw new MediaError('WASM_UNAVAILABLE', { cause }) }
      wasmReadyMs = performance.now() - start
    }
    const pointer = module._malloc(request.data.byteLength)
    if (!pointer) throw new MediaError('OUT_OF_MEMORY')
    module.HEAPU8.set(new Uint8Array(request.data), pointer)
    // The C bridge consumes this allocation even when create fails.
    context = module._aniview_webp_create(pointer, request.data.byteLength)
    if (!context) {
      const error = module._aniview_webp_error()
      throw new MediaError(error === 2 || error === 3 ? 'OUT_OF_MEMORY' : 'CORRUPTED_FILE')
    }
    metadata = {
      width: module._aniview_webp_width(context), height: module._aniview_webp_height(context),
      frameCount: module._aniview_webp_frame_count(context), loopCount: module._aniview_webp_loop_count(context),
    }
    send({ id: request.id, type: 'ready', metadata, wasmReadyMs, heapBytes: module.HEAPU8.byteLength })
    return
  }
  if (!module || !context || !metadata) throw new MediaError('DECODE_FAILED')
  if (request.type === 'reset') {
    module._aniview_webp_reset(context)
    frameIndex = 0
    previousTimestamp = 0
    send({ id: request.id, type: 'reset' })
    return
  }
  if (!module._aniview_webp_has_next(context)) { send({ id: request.id, type: 'end' }); return }
  const start = performance.now()
  if (!module._aniview_webp_next(context)) throw new MediaError('DECODE_FAILED')
  const timestamp = module._aniview_webp_timestamp(context)
  const durationMs = frameDuration(timestamp, previousTimestamp)
  previousTimestamp = timestamp
  const pointer = module._aniview_webp_frame(context)
  const length = metadata.width * metadata.height * 4
  // Never transfer a WASM heap view. GetNext/Reset/Delete invalidate libwebp's buffer.
  const rgba = module.HEAPU8.slice(pointer, pointer + length).buffer
  send({ id: request.id, type: 'frame', frameIndex: frameIndex++, durationMs,
    width: metadata.width, height: metadata.height, rgba, decodeMs: performance.now() - start,
    heapBytes: module.HEAPU8.byteLength }, [rgba])
}

// Serialize async initialization and requests; the client also allows only one in flight.
let queue = Promise.resolve()
globalThis.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(() => handle(event.data)).catch((cause: unknown) => {
    close()
    send({ id: event.data.id, type: 'error', code: cause instanceof MediaError ? cause.code : 'DECODE_FAILED' })
  })
})
