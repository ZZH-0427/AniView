import {runtimeDiagnostics} from '../media/runtime-diagnostics'
export interface VideoAnimationCleanup {
 activeVideoSourceWorkers:number;activeEncoderWorkers:number;activeOutputDecoderWorkers:number
 activeSamples:number;activeCanvases:number;activeImageData:number;ownedRgba:number;awaitingAck:number
 activeObjectUrls:number;cleanupErrors:number;softClosed:boolean|null;hardTerminated:boolean|null
}
let snapshot:VideoAnimationCleanup|null=null
const listeners=new Set<()=>void>()
export const videoAnimationCleanup={getSnapshot:()=>snapshot,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}}
export function recordVideoAnimationCleanup(value:VideoAnimationCleanup){
 if(!runtimeDiagnostics.enabled)return
 snapshot={...value};for(const listener of listeners)listener()
}
