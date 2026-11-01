import {describe,expect,it} from 'vitest'
import type {VideoInspection} from '../video-source/model'
import {estimateVideo,initialVideoSettings,normalizedPreviewTime,videoFps} from './settings'
import type {VideoSettings} from './settings'
const info:VideoInspection={container:'mp4',codec:'avc',codecString:'avc1.64001f',codedWidth:400,codedHeight:256,displayWidth:400,displayHeight:256,
 squarePixelWidth:400,squarePixelHeight:256,rotation:0,flip:false,timeResolution:90000,visibleStartTicks:0,visibleEndTicks:3600000,
 durationUs:40000000,firstPacketTimestamp:0,secureContext:true,apiPresent:true,configSupported:true,decoderInitialized:true,firstDecoded:true,firstDraw:true,
 nativeMemoryBytes:null,colorPolicy:'SDR8-browser-to-sRGB',alpha:false,audio:'ignored',trackSelection:'primary'}
const settings:VideoSettings={target:'webp',startUs:0,endUs:10000000,fps:15,longSide:480}
describe('video product preflight uses the accepted sampling grid',()=>{
 it('allows exactly150 sampled frames and exactly15.36MP, rejects151 before conversion',()=>{
  const exact=estimateVideo(info,settings);expect(exact.ok).toBe(true);expect(exact.estimate).toMatchObject({frameCount:150,framePixels:15360000})
  const over=estimateVideo(info,{...settings,endUs:10066667});expect(over).toMatchObject({ok:false,issue:'frames',estimate:{frameCount:151}})
 })
 it('rejects a workload overflow independently from the150-frame bound',()=>{
  expect(estimateVideo({...info,displayWidth:401},settings)).toMatchObject({ok:false,issue:'workload',estimate:{frameCount:150}})
 })
 it.each([[0,0],[-1,1000],[1000,500],[0,40000001],[NaN,1000]])('rejects invalid normalized trim %j %j',(startUs,endUs)=>{
  expect(estimateVideo(info,{...settings,startUs,endUs})).toMatchObject({ok:false,issue:'trim'})
 })
 it('explains duration,Original and target-timing limits separately',()=>{
  expect(estimateVideo(info,{...settings,endUs:30000001})).toMatchObject({ok:false,issue:'duration'})
  expect(estimateVideo({...info,displayWidth:1920,displayHeight:1080},{...settings,longSide:'original'})).toMatchObject({ok:false,issue:'size'})
  expect(estimateVideo(info,{...settings,target:'gif',endUs:100001,fps:10})).toMatchObject({ok:false,issue:'timing'})
 })
 it('matches integer-grid count for a nonzero start and nonintegral tail',()=>{
  const r=estimateVideo(info,{...settings,startUs:20300000,endUs:21330000,fps:10})
  expect(r).toMatchObject({ok:true,estimate:{frameCount:11,durationUs:1030000}})
  if(r.ok)expect(r.expectedDurationMs).toBe(1030)
 })
 it.each([360,480,720,'original'] as const)('does not upscale a320-pixel source with preset%s',longSide=>{
  expect(estimateVideo({...info,displayWidth:320,displayHeight:180},{...settings,endUs:1000000,longSide}).estimate).toMatchObject({width:320,height:180})
 })
 it('uses normalized portrait/PAR display geometry',()=>{
  expect(estimateVideo({...info,displayWidth:1080,displayHeight:1920},{...settings,endUs:1000000}).estimate).toMatchObject({width:270,height:480})
  expect(estimateVideo({...info,codedWidth:64,codedHeight:48,displayWidth:128,displayHeight:48},{...settings,endUs:1000000}).estimate).toMatchObject({width:128,height:48})
 })
 it('selects a conservative budget-valid initial clip and supported FPS',()=>{
  const s=initialVideoSettings({...info,displayWidth:1000,displayHeight:1000},'webp')
  expect(s).toMatchObject({startUs:0,fps:15,longSide:480,target:'webp'});expect(s.endUs).toBeLessThanOrEqual(5000000)
  expect(estimateVideo({...info,displayWidth:1000,displayHeight:1000},s).ok).toBe(true)
  expect(videoFps('gif')).toEqual([5,10,20]);expect(videoFps('apng')).toEqual([5,10,15,20,24,30])
 })
 it('rejects unsupported APNG before a job starts',()=>expect(estimateVideo(info,{...settings,target:'apng'},false)).toMatchObject({ok:false,issue:'apng'}))
 it('drops only an unencodable GIF tail rather than collapsing a useful clip to100ms',()=>{
  const short={...info,durationUs:1205000},s=initialVideoSettings(short,'gif')
  expect(s.endUs).toBe(1200000);expect(estimateVideo(short,s).ok).toBe(true)
 })
 it('normalizes either native preview timestamp convention without using it for sampling',()=>{
  const shifted={...info,visibleStartTicks:450000,durationUs:5000000}
  expect(normalizedPreviewTime(6,10,shifted)).toBe(1000000)
  expect(normalizedPreviewTime(1,5,shifted)).toBe(1000000)
  expect(normalizedPreviewTime(-1,5,info)).toBe(0)
 })
})
