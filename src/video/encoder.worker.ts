import { MP4Encoder } from './mp4-encoder'
import { VideoError } from './model'
import type { VideoRequest, VideoResponse } from './protocol'
let encoder: MP4Encoder | undefined
const send = (value: VideoResponse, transfer: Transferable[] = []) => globalThis.postMessage(value, { transfer })
let queue = Promise.resolve()
send({id:0,type:'boot'})
globalThis.addEventListener('message', (event: MessageEvent<VideoRequest>) => {
  const r = event.data
  queue = queue.then(async () => {
    if (r.type === 'open') { if (encoder) throw new VideoError('VIDEO_ENCODER_INIT_FAILED'); encoder = new MP4Encoder(r.metadata,undefined,phase=>send({id:0,type:'phase',phase})); send({ id: r.id, type: 'ready', probe: await encoder.open() }); return }
    if (!encoder) throw new VideoError('VIDEO_ENCODER_INIT_FAILED')
    if (r.type === 'frame') { await encoder.addFrame(r.frame); send({ id: r.id, type: 'accepted', metrics: { ...encoder.metrics } }); return }
    const result = await encoder.finish(); await encoder.dispose(); encoder = undefined
    send({ id: r.id, type: 'result', result }, [result.data])
  }).catch(async (cause: unknown) => {
    await encoder?.dispose(); encoder = undefined
    send({ id: r.id, type: 'error', code: cause instanceof VideoError ? cause.code : 'VIDEO_ENCODE_FAILED' })
  })
})
