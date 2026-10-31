import { describe,expect,it } from 'vitest'
import { countGrid,createSamplingPlan,frameTime,normalizeTimeline,offsetUs,outputSize,validateTargetTiming } from './sampling-plan'
import { gateCodec,validateCodedSize,validateVideoMatrix,validateSampleColor,VideoInputError } from './model'
const info={displayWidth:320,displayHeight:240,durationUs:32_000_000}
describe('integer presentation sampling plan',()=>{
  it.each([[1_000_000,10,10],[1_030_000,10,11],[10_000_000,15,150],[41_667,24,1],[66_667,30,2],[7_866_667,15,118]])('counts [0,%i) at %i FPS as %i',(endUs,fps,n)=>{
    expect(countGrid(0,endUs,fps)).toBe(n)
    const p={startUs:0,endUs,fps,frameCount:n}
    expect(frameTime(p,n-1).timeUs).toBeLessThan(endUs)
    expect(offsetUs(n,fps)).toBeGreaterThanOrEqual(endUs)
  })
  it('shares one plan for estimates, timestamps and tail durations',()=>{
    for(const fps of[5,10,15,20,24,30])for(const endUs of[100_001,1_000_000,1_030_000,2_345_679]){
      const p=createSamplingPlan(info,{startUs:0,endUs,fps,longSide:480})
      let total=0
      for(let n=0;n<p.frameCount;n++){const t=frameTime(p,n);expect(t.durationUs).toBeGreaterThan(0);total+=t.durationUs}
      expect(total).toBe(endUs)
    }
  })
  it('starts at a nonzero trim without accumulating float intervals',()=>{
    const p=createSamplingPlan(info,{startUs:20_000_000,endUs:21_030_000,fps:10,longSide:480})
    expect(p.frameCount).toBe(11);expect(frameTime(p,0).timeUs).toBe(20_000_000)
    expect(frameTime(p,10).durationMs).toBe(30)
  })
  it.each([[0,0,10],[-1,100,10],[2,1,10],[0,30_000_001,10],[0,1000,31],[0,1.5,10]])('rejects invalid interval/FPS %j %j %j',(a,b,f)=>expect(()=>countGrid(a,b,f)).toThrow(VideoInputError))
  it('does not confuse positive origin or negative preroll with visible duration',()=>{
    expect(normalizeTimeline(5,10,90_000)).toEqual({visibleStartTicks:450000,visibleEndTicks:900000,durationUs:5_000_000})
    expect(normalizeTimeline(-.2,1.03,90_000).durationUs).toBe(1_030_000)
    expect(()=>normalizeTimeline(2,1,1000)).toThrow()
  })
  it('rejects an oversized workload despite exactly 150 frames',()=>{
    expect(()=>createSamplingPlan({displayWidth:480,displayHeight:270,durationUs:10_000_000},{startUs:0,endUs:10_000_000,fps:15,longSide:480})).toThrow()
    expect(createSamplingPlan(info,{startUs:0,endUs:10_000_000,fps:15,longSide:480}).framePixels).toBe(11_520_000)
  })
  it('keeps existing encoder limits separate from video-source 150',()=>{
    expect(()=>createSamplingPlan(info,{startUs:0,endUs:15_100_000,fps:10,longSide:480})).toThrow()
  })
  it('preserves portrait/display aspect, odd dimensions and no-upscale',()=>{
    expect(outputSize(1080,1920,480)).toEqual({width:270,height:480})
    expect(outputSize(319,241,480)).toEqual({width:319,height:241})
    expect(outputSize(128,48,360)).toEqual({width:128,height:48})
    expect(()=>outputSize(1920,1080,'original')).toThrow()
  })
  it('predicts target timing without changing canonical durations',()=>{
    const p=createSamplingPlan(info,{startUs:0,endUs:1_030_000,fps:10,longSide:480})
    expect(validateTargetTiming(p,'gif')).toBe(1030)
    expect(validateTargetTiming(p,'webp')).toBe(1030)
    expect(validateTargetTiming(p,'apng')).toBe(1030)
    const tiny=createSamplingPlan(info,{startUs:0,endUs:100_001,fps:10,longSide:480})
    for(const target of ['gif','webp','apng'] as const)expect(()=>validateTargetTiming(tiny,target)).toThrow()
    expect(()=>validateTargetTiming({...p,fps:30},'gif')).toThrow()
  })
})
describe('restricted source capability gates',()=>{
  it('rejects HDR/wide gamut seen on decoded samples even if container metadata was incomplete',()=>{
    expect(()=>validateSampleColor({primaries:'bt709',transfer:'pq',matrix:'bt709'})).toThrow()
    expect(()=>validateSampleColor({primaries:'bt2020',transfer:'bt709',matrix:'bt2020-ncl'})).toThrow()
    expect(()=>validateSampleColor({primaries:'smpte432',transfer:'iec61966-2-1',matrix:'rgb'})).toThrow()
    expect(()=>validateSampleColor({primaries:'bt709',transfer:'bt709',matrix:'bt709'})).not.toThrow()
  })
  it('accepts quarter-turn/flip matrices and rejects shear, scaling and degeneracy',()=>{
    expect(()=>validateVideoMatrix([0,1,0,-1,0,0,48,0,1])).not.toThrow()
    expect(()=>validateVideoMatrix([-1,0,0,0,1,0,64,0,1])).not.toThrow()
    expect(()=>validateVideoMatrix([0,0,0,0,0,0,0,0,1])).toThrow()
    expect(()=>validateVideoMatrix([1,1,0,0,1,0,0,0,1])).toThrow()
    expect(()=>validateVideoMatrix([2,0,0,0,2,0,0,0,1])).toThrow()
  })
  it.each([['mp4','avc','avc1.64001f'],['webm','vp9','vp09.00.10.08']])('accepts explicit 8-bit family %s/%s',(container,codec,config)=>expect(()=>gateCodec(container!,codec!,config!,false,false)).not.toThrow())
  it.each([['mp4','hevc','hvc1'],['webm','vp8','vp8'],['mkv','vp9','vp09.00.10.08'],['mp4','avc','avc1.6e001f'],['webm','vp9','vp09.02.10.10']])('rejects unsupported family %s/%s',(c,v,s)=>expect(()=>gateCodec(c!,v!,s!,false,false)).toThrow())
  it('rejects HDR/alpha and oversized input before decoding',()=>{
    expect(()=>gateCodec('webm','vp9','vp09.00.10.08',false,true)).toThrow()
    expect(()=>gateCodec('mp4','avc','avc1.64001f',true,false)).toThrow()
    expect(()=>validateCodedSize(1920,1080)).not.toThrow()
    expect(()=>validateCodedSize(1080,1920)).not.toThrow()
    expect(()=>validateCodedSize(2048,2048)).toThrow()
    expect(()=>validateCodedSize(3840,2160)).toThrow()
  })
})
