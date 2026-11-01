import type {VirtualFile} from '../input/virtual-file'
import {VideoSourceAdapter} from '../video-source/worker-client'
import {EncoderWorkerClient} from '../conversion/encoder-client'
import {VideoInputError} from '../video-source/model'
import type {VideoSourceMetrics} from '../video-source/model'
import {checkVideoHeader} from './input-container'
export {convertVideoToAnimation as convert} from '../video-source/convert'
export interface PrepareObserver {worker(kind:'source'|'encoder',active:boolean):void;metrics(value:VideoSourceMetrics):void}
/** Public 8D1 adapter and existing encoder capability probe; no alternative decoder. */
export async function prepare(file:VirtualFile,signal:AbortSignal,observer:PrepareObserver){
 const container=await checkVideoHeader(file,signal)
 const source=new VideoSourceAdapter(file,signal,observer.metrics);observer.worker('source',true)
 let info
 try{info=await source.open();if(info.container!==container)throw new VideoInputError('VIDEO_CONTAINER_UNSUPPORTED')}
 finally{await source.close();observer.metrics(source.metrics);observer.worker('source',false)}
 if(signal.aborted)throw new VideoInputError('CANCELLED')
 const encoder=new EncoderWorkerClient();observer.worker('encoder',true)
 const stop=()=>encoder.dispose();signal.addEventListener('abort',stop,{once:true})
 try{await encoder.open('gif',{width:1,height:1,frameCount:1,playCount:0});if(signal.aborted)throw new VideoInputError('CANCELLED');return{info,deflate:encoder.capabilities.deflate}}
 finally{signal.removeEventListener('abort',stop);encoder.dispose();observer.worker('encoder',false)}
}
