import { VideoInputError } from './model'
type Read=(start:number,end:number)=>Promise<Uint8Array>
interface Box {type:string;start:number;data:number;end:number}
const bad=()=>new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
/** Header-only guard for selected-track edit lists; Mediabunny remains the demuxer. */
export async function mp4EditedEnd(read:Read,size:number,trackId:number):Promise<number|undefined>{
  let visited=0
  const boxes=async(start:number,end:number)=>{
    const result:Box[]=[]
    while(start<end){
      if(++visited>4096||end-start<8)throw bad()
      const head=await read(start,start+8),v=new DataView(head.buffer,head.byteOffset,head.byteLength)
      let length=v.getUint32(0),header=8
      const type=String.fromCharCode(...head.subarray(4,8))
      if(length===1){const large=await read(start+8,start+16);const n=new DataView(large.buffer,large.byteOffset,large.byteLength).getBigUint64(0);if(n>BigInt(size))throw bad();length=Number(n);header=16}
      if(length===0)length=end-start
      if(length<header||start+length>end)throw bad()
      result.push({type,start,data:start+header,end:start+length});start+=length
    }
    return result
  }
  const moov=(await boxes(0,size)).find(x=>x.type==='moov')
  if(!moov)throw bad()
  const children=await boxes(moov.data,moov.end),mvhd=children.find(x=>x.type==='mvhd')
  if(!mvhd)throw bad()
  const movie=await read(mvhd.data,Math.min(mvhd.end,mvhd.data+32))
  const m=new DataView(movie.buffer,movie.byteOffset,movie.byteLength),version=m.getUint8(0)
  if(version>1)throw bad()
  const timeScale=m.getUint32(version===1?20:12)
  if(!timeScale)throw bad()
  for(const trak of children.filter(x=>x.type==='trak')){
    const parts=await boxes(trak.data,trak.end),tkhd=parts.find(x=>x.type==='tkhd')
    if(!tkhd)throw bad()
    const header=await read(tkhd.data,Math.min(tkhd.end,tkhd.data+32)),h=new DataView(header.buffer,header.byteOffset,header.byteLength)
    const v=h.getUint8(0);if(v>1)throw bad()
    if(h.getUint32(v===1?20:12)!==trackId)continue
    const edts=parts.find(x=>x.type==='edts')
    if(!edts)return
    const elst=(await boxes(edts.data,edts.end)).find(x=>x.type==='elst')
    if(!elst)return
    const data=await read(elst.data,Math.min(elst.end,elst.data+36)),e=new DataView(data.buffer,data.byteOffset,data.byteLength)
    const editVersion=e.getUint8(0)
    if(editVersion>1||e.getUint32(4)!==1)throw bad()
    const duration=editVersion===1?Number(e.getBigUint64(8)):e.getUint32(8)
    const mediaTime=editVersion===1?e.getBigInt64(16):BigInt(e.getInt32(12))
    const rateAt=editVersion===1?24:16
    if(mediaTime<0||e.getInt16(rateAt)!==1||e.getInt16(rateAt+2)!==0||!Number.isSafeInteger(duration)||duration<=0)throw bad()
    return duration/timeScale
  }
  throw bad()
}
