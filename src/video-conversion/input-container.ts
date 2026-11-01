import type {VirtualFile} from '../input/virtual-file'
import {VideoInputError,VIDEO_INPUT_LIMITS} from '../video-source/model'
/** Cheap product rejection only; the accepted Worker remains the authoritative demuxer. */
export async function checkVideoHeader(file:VirtualFile,signal:AbortSignal){
 if(signal.aborted)throw new VideoInputError('CANCELLED')
 if(file.size>VIDEO_INPUT_LIMITS.maxSourceBytes)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
 const bytes=new Uint8Array(await file.read(0,Math.min(file.size,4096)))
 if(signal.aborted)throw new VideoInputError('CANCELLED')
 if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return 'webm'
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
 for(let at=0,n=0;at+12<=bytes.length&&n<32;n++){
  const size=view.getUint32(at),kind=String.fromCharCode(...bytes.subarray(at+4,at+8))
  if(kind==='ftyp'){
   if(String.fromCharCode(...bytes.subarray(at+8,at+12))==='qt  ')break
   return 'mp4'
  }
  if(size<8)break
  at+=size
 }
 throw new VideoInputError('VIDEO_CONTAINER_UNSUPPORTED')
}
