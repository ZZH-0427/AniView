import { describe, it, expect } from 'vitest'
import { readGIF } from './gif-reader'
import { decodeGIFFrame } from './gif-frame'
import { GIFCompositor } from './gif-compositor'
import { normalizeGifFrameDuration, normalizeGifLoop } from './gif-timing'
import previous from '../../../tests/fixtures/gif/previous.gif?inline'
import opaque from '../../../tests/fixtures/gif/background-opaque.gif?inline'
import local from '../../../tests/fixtures/gif/transparent-local.gif?inline'
import interlace from '../../../tests/fixtures/gif/interlace.gif?inline'
import single from '../../../tests/fixtures/gif/gif87a.gif?inline'
import finite from '../../../tests/fixtures/gif/finite.gif?inline'
const interlacedCases = import.meta.glob<string>('../../../tests/fixtures/gif/interlace-*.gif', { eager: true, query: '?inline', import: 'default' })
const data = (url: string) => Uint8Array.from(atob(url.split(',')[1]!), c => c.charCodeAt(0)).buffer
const red = [255,0,0,255], green = [0,255,0,255], blue = [0,0,255,255], clear = [0,0,0,0]
function decode(url: string) {
  const p=readGIF(data(url)), c=new GIFCompositor(p.width,p.height)
  return {p,c, next: (i:number)=>Array.from(new Uint8Array(c.compose(p.frames[i]!, canvas=>decodeGIFFrame(p,i,canvas))))}
}
describe('GIF timing and loops',()=>{
  it.each([[0,100],[1,100],[2,20],[3,30],[10,100]])('normalizes %scs to %sms',(raw,expected)=>expect(normalizeGifFrameDuration(raw)).toBe(expected))
  it.each([[null,1],[0,0],[1,2],[2,3]])('normalizes repeats %s to total plays %s',(raw,expected)=>expect(normalizeGifLoop(raw)).toBe(expected))
})
describe('GIF parsing and pixel composition',()=>{
  it('restores first-frame PREVIOUS to transparent pixels and releases the backup',()=>{
    const c=new GIFCompositor(2,1),f={x:0,y:0,width:1,height:1,delay:2,disposal:3,transparent:null}
    expect(Array.from(new Uint8Array(c.compose(f,p=>p.set(red))))).toEqual([...red,...clear])
    expect(c.backupBytes).toBe(4)
    const result=c.compose({...f,x:1,disposal:0},p=>p.set(green,4))
    expect(Array.from(new Uint8Array(result))).toEqual([...clear,...green]);expect(c.backupBytes).toBe(0)
    c.dispose();expect(()=>c.compose(f,()=>{})).toThrow()
  })
  it('bounds source size, frame count and full-canvas decode work before vendor allocation',()=>{
    const source=new Uint8Array(64*1024*1024+1);source.set(new Uint8Array(data(single)))
    expect(()=>readGIF(source.buffer)).toThrow(expect.objectContaining({code:'RESOURCE_LIMIT_EXCEEDED'}))
    const original=new Uint8Array(data(single)),parsed=readGIF(original.buffer)
    const descriptor=parsed.reader.frameInfo(0).data_offset-10
    const header=original.slice(0,descriptor),frame=original.subarray(descriptor,original.length-1)
    function repeated(n:number,large:boolean){
      const b=new Uint8Array(header.length+frame.length*n+1);b.set(header)
      if(large){b[6]=0;b[7]=8;b[8]=0;b[9]=8}
      for(let i=0;i<n;i++)b.set(frame,header.length+i*frame.length)
      b[b.length-1]=0x3b;return b.buffer
    }
    expect(()=>readGIF(repeated(10_001,false))).toThrow(expect.objectContaining({code:'RESOURCE_LIMIT_EXCEEDED'}))
    expect(()=>readGIF(repeated(65,true))).toThrow(expect.objectContaining({code:'RESOURCE_LIMIT_EXCEEDED'}))
  })
  it.each(Object.entries(interlacedCases))('maps all four passes for offsets, transparent and local-palette pixels: %s',(name,url)=>{
    const height=Number(name.match(/interlace-(\d+)/)![1]),{next,p}=decode(url)
    next(0)
    const pixels=next(1), colors=[[255,255,255,255],[255,0,255,255],[0,255,255,255]]
    for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
      const expected=x===1&&y>=1&&y<=height?colors[(y-1)%3]:red
      expect(pixels.slice((y*p.width+x)*4,(y*p.width+x+1)*4)).toEqual(expected)
    }
    expect(p.reader.frameInfo(1).interlaced).toBe(true)
  })
  it('normalizes actual loop blocks, both application names, and absent extensions',()=>{
    expect(readGIF(data(single)).loopCount).toBe(1)
    expect(readGIF(data(finite)).loopCount).toBe(3)
    const b=new Uint8Array(data(finite)),name=new TextEncoder().encode('NETSCAPE2.0')
    const offset=b.findIndex((_,i)=>name.every((v,j)=>b[i+j]===v))
    b.set(new TextEncoder().encode('ANIMEXTS1.0'),offset)
    expect(readGIF(b.buffer).loopCount).toBe(3)
  })
  it('restores missing GCE defaults instead of inheriting the previous image controls',()=>{
    const original=new Uint8Array(data(previous)), p=readGIF(original.buffer)
    const descriptor=p.reader.frameInfo(1).data_offset-10
    const b=Uint8Array.from([...original.subarray(0,descriptor-8),...original.subarray(descriptor)])
    expect(readGIF(b.buffer).frames[1]).toMatchObject({delay:0,disposal:0,transparent:null})
  })
  it('rejects malformed LZW output and restores vendor flags and console after failure',()=>{
    const b=new Uint8Array(data(interlace)),p=readGIF(b.buffer)
    const offset=p.reader.frameInfo(0).data_offset
    b[offset+2]=0x2c // clear then end: structurally intact but no decoded pixels
    const log=console.log
    expect(()=>decodeGIFFrame(p,0,new Uint8Array(p.width*p.height*4))).toThrow()
    expect(console.log).toBe(log);expect(p.reader.frameInfo(0).interlaced).toBe(true)
  })
  it('restores PREVIOUS before the next partial frame and resets without history',()=>{
    const {p,c,next}=decode(previous)
    expect(p.loopCount).toBe(0)
    const first=next(0); expect(first).toEqual([...red,...red,...red,...red,...red,...red])
    expect(next(1)).toEqual([...red,...blue,...red,...red,...red,...red]);expect(c.backupBytes).toBe(4)
    expect(next(2)).toEqual([...red,...red,...green,...red,...red,...red]);expect(c.backupBytes).toBe(0)
    c.reset();expect(next(0)).toEqual(first);c.dispose()
  })
  it('clears only the disposal-2 rectangle, matching Chromium even with an opaque background',()=>{
    const {p,next}=decode(opaque);expect(p.background).toEqual(red)
    expect(next(0)).toEqual([...blue,...clear,...clear,...clear,...clear,...clear])
    expect(next(1)).toEqual([...clear,...clear,...green,...clear,...clear,...clear])
  })
  it('supports transparent local palettes over retained pixels',()=>{
    const {next}=decode(local);next(0)
    expect(next(1)).toEqual([...red,255,255,255,255,...red,...red,...red,...red])
  })
  it('decodes interlace row order and single GIF87a',()=>{
    const {next}=decode(interlace)
    expect(next(0)).toEqual([...red,...red,...red,...green,...green,...green,...blue,...blue,...blue,...red,...green,...blue])
    expect(readGIF(data(single)).frames.length).toBe(1)
  })
  it('rejects invalid signatures, truncation, dimensions, rectangles and code size',()=>{
    const original=data(previous)
    for(const mutate of [(b:Uint8Array)=>{b[0]=0},(b:Uint8Array)=>{b[6]=0;b[7]=0},(b:Uint8Array)=>{b[6]=255;b[7]=255;b[8]=255;b[9]=255}]){
      const b=new Uint8Array(original.slice(0));mutate(b);expect(()=>readGIF(b.buffer)).toThrow()
    }
    expect(()=>readGIF(original.slice(0,-1))).toThrow()
    const p=readGIF(original), b=new Uint8Array(original.slice(0));b[p.reader.frameInfo(0).data_offset]=12
    expect(()=>readGIF(b.buffer)).toThrow()
    const rectangle=new Uint8Array(original.slice(0)),descriptor=p.reader.frameInfo(0).data_offset-10
    rectangle[descriptor+1]=255
    expect(()=>readGIF(rectangle.buffer)).toThrow()
  })
})
