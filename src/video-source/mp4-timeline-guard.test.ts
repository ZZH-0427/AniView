import {expect,it} from 'vitest'
import {mp4EditedEnd} from './mp4-timeline-guard'
const combine=(...arrays:Uint8Array[])=>{const result=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){result.set(a,p);p+=a.length}return result}
const box=(name:string,...parts:Uint8Array[])=>{const bytes=combine(new Uint8Array(8),...parts);const v=new DataView(bytes.buffer);v.setUint32(0,bytes.length);[...name].forEach((c,i)=>bytes[4+i]=c.charCodeAt(0));return bytes}
function movie({entries=1,rate=1,media=0,withEdit=true,trackId=1}={}){
  const mvhd=new Uint8Array(24);new DataView(mvhd.buffer).setUint32(12,1000)
  const tkhd=new Uint8Array(24);new DataView(tkhd.buffer).setUint32(12,trackId)
  const elst=new Uint8Array(20),e=new DataView(elst.buffer);e.setUint32(4,entries);e.setUint32(8,1030);e.setInt32(12,media);e.setInt16(16,rate)
  return box('moov',box('mvhd',mvhd),box('trak',box('tkhd',tkhd),...(withEdit?[box('edts',box('elst',elst))]:[])))
}
async function inspect(bytes:Uint8Array,track=1){return mp4EditedEnd(async(a,b)=>bytes.slice(a,b),bytes.length,track)}
it('reads selected-track segment end without interpreting codec data',async()=>{
  expect(await inspect(movie())).toBe(1.03)
  expect(await inspect(movie({media:100}))).toBe(1.03)
})
it('leaves a no-edit timeline to Mediabunny presentation metadata',async()=>expect(await inspect(movie({withEdit:false}))).toBeUndefined())
it.each([{entries:2},{rate:0},{media:-1},{trackId:2}])('rejects complex/empty/unsupported edit semantics %j',async options=>await expect(inspect(movie(options))).rejects.toThrow())
it('rejects malformed boxes before unbounded reads',async()=>{
  const malformed=movie();new DataView(malformed.buffer).setUint32(0,0x7fffffff)
  await expect(inspect(malformed)).rejects.toThrow()
})
