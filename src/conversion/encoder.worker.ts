import { ConversionError } from './model'
import type { AnimationEncoder } from './model'
import type { EncoderRequest, EncoderResponse } from './protocol'

let encoder: AnimationEncoder | undefined
function send(response: EncoderResponse, transfer: Transferable[] = []) { globalThis.postMessage(response, { transfer }) }
function close() { encoder?.dispose(); encoder = undefined }
async function handle(request: EncoderRequest) {
  if (request.type === 'close') { close(); send({ id: request.id, type: 'closed' }); return }
  if (request.type === 'open') {
    close()
    if (request.target === 'apng') encoder = await (await import('./apng-encoder')).APNGAnimationEncoder.create(request.metadata)
    else if (request.target === 'webp') encoder = await (await import('./webp-encoder')).WebPAnimationEncoder.create(request.metadata)
    else if (request.target === 'gif') encoder = await (await import('./gif-encoder')).GIFAnimationEncoder.create(request.metadata)
    else throw new ConversionError('TARGET_ENCODER_UNSUPPORTED')
    let deflate = false
    try {
      if (typeof CompressionStream === 'function') {
        const stream = new CompressionStream('deflate')
        const drained = new Response(stream.readable).arrayBuffer()
        await stream.writable.getWriter().close(); await drained
        deflate = true
      }
    } catch { /* Capability result only. */ }
    send({ id: request.id, type: 'ready', capabilities: { deflate } }); return
  }
  if (!encoder) throw new ConversionError('TARGET_ENCODE_FAILED')
  if (request.type === 'frame') {
    await encoder.addFrame(request.frame)
    // No encoder retains this input buffer after acceptance. The next decoder
    // request occurs only after this task ends and the broker receives the ack.
    send({ id: request.id, type: 'accepted', metrics: encoder.metrics }); return
  }
  const result = await encoder.finish()
  close()
  send({ id: request.id, type: 'result', result }, [result.data])
}

let queue = Promise.resolve()
globalThis.addEventListener('message', (event: MessageEvent<EncoderRequest>) => {
  queue = queue.then(() => handle(event.data)).catch((cause: unknown) => {
    close()
    send({ id: event.data.id, type: 'error', code: cause instanceof ConversionError ? cause.code : 'TARGET_ENCODE_FAILED' })
  })
})
