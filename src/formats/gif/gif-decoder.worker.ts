import { MediaError } from '../../media/errors'
import { readGIF } from './gif-reader'
import { decodeGIFFrame } from './gif-frame'
import { GIFCompositor } from './gif-compositor'
import { normalizeGifFrameDuration } from './gif-timing'
import type { GIFRequest, GIFResponse } from './gif-worker-protocol'
let parsed: ReturnType<typeof readGIF> | undefined
let compositor: GIFCompositor | undefined
let index = 0
function close() { compositor?.dispose(); compositor = undefined; parsed = undefined; index = 0 }
function send(response: GIFResponse, transfer: Transferable[] = []) { globalThis.postMessage(response, { transfer }) }
function handle(request: GIFRequest) {
  if (request.type === 'close') { close(); send({ id: request.id, type: 'closed' }); return }
  if (request.type === 'open') {
    close(); const start = performance.now(); parsed = readGIF(request.data)
    compositor = new GIFCompositor(parsed.width, parsed.height)
    send({ id: request.id, type: 'ready', metadata: { width: parsed.width, height: parsed.height, frameCount: parsed.frames.length, loopCount: parsed.loopCount }, readyMs: performance.now() - start }); return
  }
  if (!parsed || !compositor) throw new MediaError('DECODE_FAILED')
  if (request.type === 'reset') { compositor.reset(); index = 0; send({ id: request.id, type: 'reset' }); return }
  const frame = parsed.frames[index]
  if (!frame) { send({ id: request.id, type: 'end' }); return }
  const start = performance.now()
  const rgba = compositor.compose(frame, canvas => decodeGIFFrame(parsed!, index, canvas))
  send({ id: request.id, type: 'frame', frameIndex: index++, width: parsed.width, height: parsed.height,
    durationMs: normalizeGifFrameDuration(frame.delay), rgba, decodeMs: performance.now() - start, liveBitmaps: 0, backupBytes: compositor.backupBytes }, [rgba])
}
globalThis.addEventListener('message', (event: MessageEvent<GIFRequest>) => {
  try { handle(event.data) } catch (cause) { close(); send({ id: event.data.id, type: 'error', code: cause instanceof MediaError ? cause.code : 'CORRUPTED_FILE' }) }
})
