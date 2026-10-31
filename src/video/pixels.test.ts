import { describe, it, expect } from 'vitest'
import { compositeWhite, sampleRgb } from './pixels'
import { codedSize } from './model'
const meta = { width: 2, height: 2, frameCount: 1, playCount: 0 }
describe('straight canonical RGBA to opaque white video', () => {
  it('keeps opaque RGB, ignores hidden RGB, composites soft alpha and reuses even buffer', () => {
    const a = new Uint8Array([12,34,56,255, 200,0,25,0, 255,0,0,128, 0,255,0,64])
    const r = compositeWhite(a.buffer, meta)
    expect(r.pixels.buffer).toBe(a.buffer); expect(r.temporaryRgbaFrames).toBe(0)
    expect([...r.pixels]).toEqual([12,34,56,255, 255,255,255,255, 255,127,127,255, 191,255,191,255])
  })
  it.each([[319,241],[1221,1729]])('pads %dx%d right/bottom without changing source pixels', (width,height) => {
    const a = new Uint8Array(width * height * 4).fill(255); a.set([7,8,9,255], ((height - 1) * width + width - 1) * 4)
    const r = compositeWhite(a.buffer, { ...meta, width, height })
    expect([r.width,r.height,r.temporaryRgbaFrames]).toEqual([width+1,height+1,1]); expect(r.pixels.buffer).not.toBe(a.buffer)
    expect([...r.pixels.subarray(((height-1)*r.width+width-1)*4,((height-1)*r.width+width)*4)]).toEqual([7,8,9,255])
    expect(r.pixels.subarray(height*r.width*4).every(x=>x===255)).toBe(true)
  })
  it('rejects wrong buffers and padded workloads outside the existing bound', () => {
    expect(()=>compositeWhite(new ArrayBuffer(1),meta)).toThrow('VIDEO_FRAME_FAILED')
    expect(()=>codedSize({...meta,width:2048,height:2048,frameCount:4})).toThrow('RESOURCE_LIMIT')
    expect(()=>codedSize({...meta,frameCount:201})).toThrow('RESOURCE_LIMIT')
  })
  it('keeps private comparison samples bounded independently of frame size', () => {
    expect(sampleRgb(new Uint8Array(2048*2048*4)).length).toBe(768)
  })
})
