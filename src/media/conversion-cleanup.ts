import { runtimeDiagnostics } from './runtime-diagnostics'
export interface ConversionCleanup {
  activeDecoderWorkers:number;activeEncoderWorkers:number;activeVideoWorkers:number
  ownedVideoFrames:number;activeObjectUrls:number;cleanupErrors:number;videoFramesBalanced:boolean|null
}
let snapshot:ConversionCleanup|null=null
const listeners=new Set<()=>void>()
export const conversionCleanup={getSnapshot:()=>snapshot,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}}
/** Local numeric post-close evidence only; never stores source identity or bytes. */
export function recordConversionCleanup(value:ConversionCleanup){
  if(!runtimeDiagnostics.enabled)return
  snapshot={activeDecoderWorkers:value.activeDecoderWorkers,activeEncoderWorkers:value.activeEncoderWorkers,activeVideoWorkers:value.activeVideoWorkers,
    ownedVideoFrames:value.ownedVideoFrames,activeObjectUrls:value.activeObjectUrls,cleanupErrors:value.cleanupErrors,videoFramesBalanced:value.videoFramesBalanced}
  for(const listener of listeners)listener()
}
