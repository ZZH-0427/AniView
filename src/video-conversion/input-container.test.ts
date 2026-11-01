import {describe,expect,it} from 'vitest'
import {browserFile} from '../input/browser-file'
import {checkVideoHeader} from './input-container'
const signal=()=>new AbortController().signal
describe('video product binary input gate',()=>{
 it('accepts MP4 bytes despite wrong filename and MIME',async()=>{
  const file=new File([new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0])],'wrong.png',{type:'image/png'})
  expect(await checkVideoHeader(browserFile(file),signal())).toBe('mp4')
 })
 it('rejects QuickTime rather than productizing MOV',async()=>{
  const file=new File([new Uint8Array([0,0,0,16,102,116,121,112,113,116,32,32,0,0,0,0])],'video.mp4')
  await expect(checkVideoHeader(browserFile(file),signal())).rejects.toMatchObject({videoCode:'VIDEO_CONTAINER_UNSUPPORTED'})
 })
 it('does not trust a video extension for nonvideo bytes',async()=>{
  await expect(checkVideoHeader(browserFile(new File(['GIF89a'],'video.mp4')),signal())).rejects.toMatchObject({videoCode:'VIDEO_CONTAINER_UNSUPPORTED'})
 })
 it('routes EBML to authoritative Worker inspection, not to an extension-based codec assumption',async()=>{
  expect(await checkVideoHeader(browserFile(new File([new Uint8Array([0x1a,0x45,0xdf,0xa3])],'video.bin')),signal())).toBe('webm')
 })
 it('rejects size before reading and honors abort',async()=>{
  await expect(checkVideoHeader({name:'x',size:67108865,source:'file',read:async()=>{throw Error('must not read')}},signal())).rejects.toMatchObject({videoCode:'VIDEO_SOURCE_LIMIT'})
  const c=new AbortController();c.abort();await expect(checkVideoHeader(browserFile(new File([],'x')),c.signal)).rejects.toMatchObject({videoCode:'CANCELLED'})
 })
})
