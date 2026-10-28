import { MediaError } from '../../media/errors'
import { parseAPNGFile } from './apng-parser'
import type { ParsedAPNG } from './apng-parser'
import { APNGCompositor } from './apng-compositor'
import { readFullSourceRGBA } from './apng-full-source-rgba'
import type { APNGRequest, APNGResponse } from './apng-worker-protocol'

let parsed: ParsedAPNG | undefined
let compositor: APNGCompositor | undefined
let frameIndex = 0
let directCanonical = false

function close() {
  compositor?.dispose()
  compositor = undefined
  parsed = undefined // Drops all compressed frame Blobs/metadata; no decoded history exists.
  frameIndex = 0
  directCanonical = false
}
function send(response: APNGResponse, transfer: Transferable[] = []) {
  globalThis.postMessage(response, { transfer })
}
async function handle(request: APNGRequest) {
  if (request.type === 'close') { close(); send({ id: request.id, type: 'closed' }); return }
  if (request.type === 'open') {
    close()
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined' || typeof Blob !== 'function') throw new MediaError('APNG_RUNTIME_UNAVAILABLE')
    const start = performance.now()
    parsed = parseAPNGFile(request.data) // Validate dimensions/resource limits before canvas allocation.
    // Opt-in exact readback only when every frame is independent. Never skip
    // composition state for a sequence whose later partial frame needs it.
    directCanonical = request.canonicalRGBA === true && parsed.frames.every(frame =>
      frame.left === 0 && frame.top === 0 && frame.width === parsed!.width && frame.height === parsed!.height
      && frame.blendOp === 0 && frame.disposeOp === 0)
    if (!directCanonical) compositor = new APNGCompositor(parsed.width, parsed.height)
    const { width, height, frameCount, loopCount } = parsed
    send({ id: request.id, type: 'ready', metadata: { width, height, frameCount, loopCount }, readyMs: performance.now() - start })
    return
  }
  if (!parsed) throw new MediaError('DECODE_FAILED')
  if (request.type === 'reset') {
    compositor?.reset()
    frameIndex = 0
    send({ id: request.id, type: 'reset' })
    return
  }
  if (request.type !== 'next') throw new MediaError('DECODE_FAILED')
  const frame = parsed.frames[frameIndex]
  if (!frame) { send({ id: request.id, type: 'end' }); return }
  const start = performance.now()
  if (directCanonical) {
    const rgba = await readFullSourceRGBA(frame, parsed.width, parsed.height)
    if (rgba) {
      send({ id: request.id, type: 'frame', frameIndex: frameIndex++, width: parsed.width, height: parsed.height,
        durationMs: frame.durationMs, rgba, decodeMs: performance.now() - start,
        liveBitmaps: 0, backupBytes: 0, pixelPath: 'direct-rgba' }, [rgba])
      return
    }
  }
  compositor ??= new APNGCompositor(parsed.width, parsed.height)
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(frame.imageData) }
  catch (cause) { throw new MediaError('DECODE_FAILED', { cause }) }
  // compose takes ownership and closes the one temporary bitmap even on failure.
  const rgba = compositor.compose(bitmap, frame, frameIndex)
  send({ id: request.id, type: 'frame', frameIndex: frameIndex++, width: parsed.width, height: parsed.height,
    durationMs: frame.durationMs, rgba, decodeMs: performance.now() - start,
    liveBitmaps: 0, backupBytes: compositor.backupBytes, pixelPath: 'canvas' }, [rgba])
}

// One request at a time; closing an active client terminates this instance and pending work.
let queue = Promise.resolve()
globalThis.addEventListener('message', (event: MessageEvent<APNGRequest>) => {
  queue = queue.then(() => handle(event.data)).catch((cause: unknown) => {
    close()
    send({ id: event.data.id, type: 'error', code: cause instanceof MediaError ? cause.code : 'DECODE_FAILED' })
  })
})
