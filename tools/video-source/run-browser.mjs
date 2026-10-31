import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {launchBrowser,sleep} from '../conversion/browser.mjs'
const dir=resolve('.tools/video-source/desktop'),port='4231',url='http://127.0.0.1:'+port+'/AniView/experiments/video-source/?debug=1'
await mkdir(dir,{recursive:true})
const server=spawn(process.execPath,['tools/video-source/preview.mjs','--port',port],{windowsHide:true,stdio:'ignore'})
let browser
const report={scope:'Installed desktop Edge production build; not Android',cases:[],errors:[]}
try{
  for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break}catch{}await sleep(100)}
  browser=await launchBrowser(dir);await browser.navigate(url);await browser.waitFor('!!window.__videoSourceHarness')
  report.browser=await browser.evaluate('navigator.userAgent');report.secureContext=await browser.evaluate('isSecureContext')
  const run=async(name,target,options={},expected='PASS')=>{
    const row=await browser.evaluate('window.__videoSourceHarness.runCase('+JSON.stringify(name)+','+JSON.stringify(target)+','+JSON.stringify(options)+')')
    report.cases.push(row);await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2))
    console.log(JSON.stringify({name,target,status:row.status,error:row.error,stage:row.stage,validation:row.validation,totalMs:row.totalMs,source:row.videoSource&&{peak:row.videoSource.peakSamples,observed:row.videoSource.observedSourceSamples,pixels:row.videoSource.observedSourcePixels,cleanupErrors:row.videoSource.cleanupErrors}}))
    assert.equal(row.status,expected,name+' → '+target)
    assert.equal(row.resources.activeWorkers,0,'all job + verification workers close')
    assert.equal(row.resources.activeBitmaps,0)
    if(expected==='PASS'){
      assert(row.videoSource.peakSamples<=2);assert.equal(row.peakRgbaFrames,1)
      assert.equal(row.videoSource.activeSamples,0);assert.equal(row.videoSource.activeCanvases,0)
      assert.equal(row.videoSource.cleanupErrors,0);assert.equal(row.cleanup.softClosed,true)
      const ext=target==='apng'?'png':target
      const data=Buffer.from(await browser.evaluate('window.__videoSourceHarness.outputBase64()'),'base64')
      await writeFile(resolve(dir,name.replace(/\W/g,'-')+'-'+target+'.'+ext),data)
    }
    return row
  }
  for(const target of['gif','webp','apng'])await run('cfr.mp4',target)
  for(const target of['gif','webp','apng'])await run('vp9.webm',target)
  await run('vfr.mp4','apng',{fps:20,endUs:1_030_000})
  await run('bframes.mp4','webp',{fps:10,endUs:2_000_000})
  await run('rotation.mp4','apng')
  if(!process.argv.includes('--smoke')){
    await run('portrait.mp4','webp')
    await run('par.mp4','apng')
    await run('nonzero.webm','apng')
    await run('negative.mp4','apng')
    await run('long.mp4','webp',{startUs:20_300_000,endUs:21_330_000,fps:10})
    await run('vfr.mp4','gif',{endUs:1_030_000,fps:10})
    for(const target of['gif','webp','apng'])await run('cfr.mp4',target,{endUs:41_667,fps:target==='gif'?10:24})
    for(const fps of[24,30])await run('cfr.mp4','apng',{fps,endUs:1_030_000})
    for(const endUs of[.4,.45,.65].map(x=>x*1e6))await run('vfr.mp4','apng',{startUs:150_000,endUs,fps:20})
    for(const count of[10,50,100,150])await run('benchmark.mp4','webp',{endUs:Math.round(count/15*1e6),fps:15})
    for(const longSide of[480,720])await run('1080.mp4','apng',{longSide,fps:10})
    await run('photo.mp4','apng',{longSide:480,fps:10})
    await run('dense-1080.mp4','apng',{endUs:5_200_000,fps:5},'FAIL')
    assert.equal(report.cases.at(-1).error,'VIDEO_SOURCE_LIMIT')
    for(const cancelAt of['opening','probing','preroll','sampling','drawing','readback','waiting-encoder','encoder-ack','encoding','finalizing']){
      if(cancelAt==='preroll')await run('long.mp4','apng',{startUs:20_300_000,endUs:21_300_000,fps:15,cancelAt},'CANCELLED')
      else await run('benchmark.mp4','apng',{endUs:6_000_000,fps:15,cancelAt},'CANCELLED')
      await run('cfr.mp4','apng')
    }
    await run('long-gop.mp4','webp',{startUs:8_000_000,endUs:9_000_000},'FAIL')
    assert.equal(report.cases.at(-1).error,'VIDEO_PREROLL_LIMIT')
    await run('1080.mp4','apng',{endUs:1_000_000,fps:15,longSide:'original'},'FAIL')
    assert.equal(report.cases.at(-1).error,'VIDEO_OUTPUT_PLAN_LIMIT')
    for(const [fixture,error]of[['4k.mp4','VIDEO_SOURCE_LIMIT'],['hdr-tagged.mp4','VIDEO_CODEC_UNSUPPORTED'],['audio.mp4','NO_VIDEO_TRACK']]){
      await run(fixture,'apng',{},'FAIL');assert.equal(report.cases.at(-1).error,error)
      assert.equal(report.cases.at(-1).videoSource.capability.firstDecoded,false)
    }
    await run('cfr.mp4','apng')
  }
  await browser.evaluate('window.__videoSourceHarness.clear()')
  report.summary=await browser.evaluate('window.__videoSourceHarness.summary()')
  report.errors=browser.errors
  assert.deepEqual(report.errors,[])
  await browser.send('Page.captureScreenshot',{format:'png'}).then(x=>writeFile(resolve(dir,'harness.png'),Buffer.from(x.data,'base64')))
  report.transfers=await browser.evaluate('window.__conversionTransfers')
  assert.equal(report.summary.resources.activeWorkers,0)
  await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({completed:report.cases.length,summary:report.summary}))
  if(!process.argv.includes('--smoke')){
    const ffmpeg=process.env.FFMPEG_PATH??resolve('.tools/video-source/fixture-tool/ffmpeg.exe')
    execFileSync(ffmpeg,['-y','-v','error','-i',resolve(dir,'1080-mp4-apng.png'),'-frames:v','1',resolve(dir,'resize-720.png')],{windowsHide:true})
    execFileSync(ffmpeg,['-y','-v','error','-i',resolve(dir,'photo-mp4-apng.png'),'-frames:v','1',resolve(dir,'photo-480.png')],{windowsHide:true})
  }
}finally{await browser?.close();server.kill()}
