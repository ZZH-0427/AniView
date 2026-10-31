import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {launchBrowser,sleep} from '../conversion/browser.mjs'
import {regionalAPNG,regionalGIF,regionalWebP} from './conformance-fixtures.mjs'
const output=resolve('.tools/video'),port='4221',url=`http://127.0.0.1:${port}/AniView/experiments/video/?debug=1`
await mkdir(output,{recursive:true})
const server=spawn(process.execPath,['tools/video/preview.mjs','--port',port],{windowsHide:true,stdio:'ignore'})
let browser
const report={scope:'Actual installed desktop Edge, not Android',cases:[],comparisons:null,errors:[],native:[]}
try{
  for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break}catch{}await sleep(100)}
  browser=await launchBrowser(output);await browser.navigate(url);await browser.waitFor('!!window.__videoHarness')
  report.browser=await browser.evaluate('navigator.userAgent');report.secure=await browser.evaluate('isSecureContext')
  report.comparisons=await browser.evaluate('window.__videoHarness.comparePaths()')
  const run=async(name,options,bytes,photo)=>{
    await browser.evaluate('window.__videoHarness.clear()')
    const row=await browser.evaluate(`window.__videoHarness.runCase(${JSON.stringify(options)},${bytes?JSON.stringify(bytes):'undefined'},${photo?JSON.stringify(photo):'undefined'})`)
    report.cases.push({name,...row});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({name,status:row.status,error:row.error,validation:row.validation,metrics:row.metrics}))
    assert.equal(row.status,options.cancelAt?'CANCELLED':'PASS',name)
    assert.equal(row.resources.activeWorkers,0,name+' active workers');assert.equal(row.resources.activeBitmaps,0)
    if(row.status==='PASS'){
      assert.equal(row.metrics.activeVideoFrames,0);assert.equal(row.metrics.framesCreated,row.metrics.framesClosed)
      assert(row.metrics.maxEncodeQueue<=2);assert.equal(row.peakCanonicalRgbaFrames,1)
      const native=await browser.evaluate(`(async()=>{const v=document.querySelector('video');for(let i=0;i<200&&v.readyState<2;i++)await new Promise(r=>setTimeout(r,25));await v.play();await new Promise(r=>setTimeout(r,150));v.pause();return{width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime,error:v.error?.code??null}})()`)
      assert.equal(native.error,null);assert(native.time>0);assert.equal(native.width,row.validation.width);report.native.push({name,...native})
      const data=Buffer.from(await browser.evaluate('window.__videoHarness.outputBase64()'),'base64');await writeFile(join(output,`${name.replace(/[^a-z0-9]+/gi,'-')}.mp4`),data)
      if(!options.scene||options.scene!=='mixed-alpha')assert.equal(row.qualityAssessment,'WITHIN_SPIKE_THRESHOLD',name+' sampled quality')
      await browser.evaluate('document.querySelector("video").scrollIntoView()')
      await browser.send('Page.captureScreenshot',{format:'png'}).then(x=>writeFile(join(output,`${name.replace(/[^a-z0-9]+/gi,'-')}.png`),Buffer.from(x.data,'base64')))
    }else if(options.cancelAt==='finalize-held')assert.equal(row.finalizeHeld,true)
    return row
  }
  const small={width:320,height:240,count:10,durations:[1,10,20,27,33,41,100,250,500,1000]}
  for(const source of ['gif','apng','webp'])await run('VFR '+source,{...small,source,scene:'mixed-alpha'})
  if(!process.argv.includes('--smoke')){
    for(const scene of ['solid','transparent','flat','gradient','sparse'])await run(scene,{...small,source:'apng',scene})
    await run('photo-like',{...small,source:'webp',scene:'gradient',photo:true})
    // One photographic source is resized/translated only when generating the test
    // animation; the canonical-to-video path never resizes imported source frames.
    const photo=await readFile(join(output,'nasa-blue-marble.jpg')).catch(async()=>{
      const response=await fetch('https://www.nasa.gov/wp-content/uploads/2023/03/as17-148-22727_lrg_0.jpg?resize=600,600',{signal:AbortSignal.timeout(30000)})
      assert(response.ok);const data=Buffer.from(await response.arrayBuffer());await writeFile(join(output,'nasa-blue-marble.jpg'),data);return data
    })
    await run('photographic Apollo17',{source:'webp',width:320,height:320,count:10},undefined,[...photo])
    await run('soft edges',{...small,source:'apng',softEdges:true})
    for(const count of [10,50,100,200])await run('benchmark 320 '+count,{source:'apng',width:320,height:240,count,scene:'flat',durations:[27,100,41,20]})
    for(const [width,height] of [[1024,1024],[1920,1080],[2048,2048],[319,241],[1221,1729]])await run(`dimensions ${width}x${height}`,{source:'webp',width,height,count:2,scene:'gradient',durations:[27,500]})
    await run('regional APNG NONE BACKGROUND PREVIOUS SOURCE OVER',{source:'apng',width:48,height:32,count:8},[...await regionalAPNG()])
    for(const [name,count] of [['previous.gif',3],['background-opaque.gif',2],['background-transparent.gif',3],['transparent-local.gif',2]])await run('regional GIF '+name,{source:'gif',width:48,height:32,count},[...await regionalGIF(name)])
    await run('regional WebP blend dispose',{source:'webp',width:64,height:32,count:4},[...await regionalWebP()])
    for(const playCount of [0,1,5])await run('one cycle source playCount '+playCount,{source:'apng',width:64,height:48,count:3,playCount})
    await run('encode cancel',{source:'apng',width:320,height:240,count:20,cancelAt:'encode'})
    await run('finalize cancel',{...small,source:'webp',cancelAt:'finalize-held'})
    await run('rerun after cancel',{...small,source:'gif'})
  }
  await browser.send('Page.captureScreenshot',{format:'png'}).then(x=>writeFile(join(output,'native-playback.png'),Buffer.from(x.data,'base64')))
  await browser.evaluate('window.__videoHarness.clear()');report.final=await browser.evaluate('JSON.parse(document.querySelector("#result").textContent)')
  report.errors=browser.errors;assert.deepEqual(report.errors,[])
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2))
}finally{await browser?.close();server.kill()}
