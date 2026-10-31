import { afterEach, describe, it, expect, vi } from 'vitest'
import { avcConfigs, probeAvc } from './capability'
afterEach(()=>vi.unstubAllGlobals())
describe('exact H264 capability probing', () => {
  it('does not equate a constructor with supported configuration', async () => {
    vi.stubGlobal('VideoFrame',class {})
    const probe = vi.fn(async(config:VideoEncoderConfig)=>({supported:false,config}))
    const r = await probeAvc(320,240,{isConfigSupported:probe})
    expect(r.apiPresent).toBe(true); expect(r.selected).toBeNull(); expect(probe).toHaveBeenCalledTimes(3)
  })
  it('chooses constrained baseline before other H264 profiles without CFR metadata', async () => {
    vi.stubGlobal('VideoFrame',class {})
    const r = await probeAvc(320,240,{isConfigSupported:async config=>({supported:true,config})})
    expect(r.selected?.codec).toBe('avc1.42e01f'); expect(r.selected).not.toHaveProperty('framerate')
  })
  it('tolerates a rejected candidate and keeps fallback within AVC', async()=>{
    vi.stubGlobal('VideoFrame',class {})
    const r=await probeAvc(1920,1080,{isConfigSupported:async config=>{if(config.codec.includes('42e0'))throw Error();return{supported:true,config}}})
    expect(r.selected?.codec).toBe('avc1.4d0028')
  })
  it('does not invent a main-thread fallback for missing Worker APIs', async()=>{
    vi.stubGlobal('VideoFrame',undefined); vi.stubGlobal('VideoEncoder',undefined)
    expect((await probeAvc(320,240)).apiPresent).toBe(false)
  })
  it('uses a higher level for 2048 square rather than an invalid small AVC level',()=>{
    expect(avcConfigs(2048,2048)[0]?.codec).toBe('avc1.42e032')
  })
})
