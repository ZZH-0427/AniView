// Engineering-only cancellation oracle: hold the actual library onFinalize, never the product Worker.
import { BufferTarget, Mp4OutputFormat, Output } from 'mediabunny'
import { MP4Encoder } from '../../video/mp4-encoder'
import { VideoError } from '../../video/model'
import type { VideoRequest, VideoResponse } from '../../video/protocol'
let encoder: MP4Encoder | undefined, queue = Promise.resolve()
const send = (r: VideoResponse, transfer: Transferable[] = []) => globalThis.postMessage(r, { transfer })
send({id:0,type:'boot'})
globalThis.addEventListener('message', (event: MessageEvent<VideoRequest>) => {
  const r=event.data
  queue=queue.then(async()=>{
    if(r.type==='open'){
      encoder=new MP4Encoder(r.metadata,(target:BufferTarget)=>new Output({format:new Mp4OutputFormat({fastStart:false}),target,
        onFinalize:()=>new Promise<void>(()=>{globalThis.postMessage({type:'finalize-held',state:'finalizing'})})}),
        phase=>globalThis.postMessage({type:'finalize-phase',phase}))
      send({id:r.id,type:'ready',probe:await encoder.open()});return
    }
    if(!encoder)throw new VideoError('VIDEO_ENCODER_INIT_FAILED')
    if(r.type==='frame'){await encoder.addFrame(r.frame);send({id:r.id,type:'accepted',metrics:{...encoder.metrics}});return}
    const result=await encoder.finish();await encoder.dispose();send({id:r.id,type:'result',result},[result.data])
  }).catch((e:unknown)=>send({id:r.id,type:'error',code:e instanceof VideoError?e.code:'VIDEO_ENCODE_FAILED'}))
})
