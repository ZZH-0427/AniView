import {describe,expect,it} from 'vitest'
import {validateSampleGeometry} from './sample-geometry'
import type {TrackSampleGeometry,DecodedSampleGeometry} from './sample-geometry'
const track:TrackSampleGeometry={codedWidth:64,codedHeight:48,displayWidth:128,displayHeight:48,
  squarePixelWidth:128,squarePixelHeight:48,rotation:0,flip:false}
const missingPar:DecodedSampleGeometry={displayWidth:64,displayHeight:48,squarePixelWidth:64,squarePixelHeight:48,
  rotation:0,flip:false,visibleRect:{left:0,top:0,width:64,height:48}}
describe('decoded source geometry and native PAR omission',()=>{
  it('accepts normal decoded PAR geometry without a fallback',()=>{
    expect(validateSampleGeometry(track,{...missingPar,displayWidth:128,squarePixelWidth:128})).toBe(false)
  })
  it('recognizes the real Quark full-frame unadjusted geometry',()=>{
    expect(validateSampleGeometry(track,missingPar)).toBe(true)
  })
  it.each([90,180,270])('normalizes missing PAR after %i degree rotation without changing the sample',rotation=>{
    const rotated=rotation%180!==0
    const t={...track,rotation,displayWidth:rotated?48:128,displayHeight:rotated?128:48}
    const s={...missingPar,rotation,displayWidth:rotated?48:64,displayHeight:rotated?64:48}
    expect(validateSampleGeometry(t,s)).toBe(true)
    expect(s.squarePixelWidth).toBe(64)
  })
  it('requires matching flip metadata',()=>{
    expect(validateSampleGeometry({...track,flip:true},{...missingPar,flip:true})).toBe(true)
    expect(()=>validateSampleGeometry(track,{...missingPar,flip:true})).toThrow()
  })
  it.each([
    {left:1,top:0,width:64,height:48},{left:0,top:1,width:64,height:48},
    {left:0,top:0,width:32,height:48},{left:0,top:0,width:64,height:32},
  ])('rejects crop or dynamic-size changes even with explicit track PAR: %j',visibleRect=>{
    expect(()=>validateSampleGeometry(track,{...missingPar,visibleRect})).toThrow()
  })
  it('rejects arbitrary mismatched display sizes, not just a different ratio',()=>{
    expect(()=>validateSampleGeometry(track,{...missingPar,displayWidth:96})).toThrow()
    expect(()=>validateSampleGeometry(track,{...missingPar,displayWidth:256,displayHeight:96,squarePixelWidth:256,squarePixelHeight:96})).toThrow()
  })
  it('requires explicit coherent nonsquare track metadata',()=>{
    expect(()=>validateSampleGeometry({...track,squarePixelWidth:64},missingPar)).toThrow()
    expect(()=>validateSampleGeometry({...track,displayWidth:129},missingPar)).toThrow()
  })
  it('keeps bounds and rotation guards active',()=>{
    expect(()=>validateSampleGeometry(track,{...missingPar,displayWidth:Infinity})).toThrow()
    expect(()=>validateSampleGeometry(track,{...missingPar,displayWidth:4096})).toThrow()
    expect(()=>validateSampleGeometry(track,{...missingPar,rotation:90})).toThrow()
  })
})
