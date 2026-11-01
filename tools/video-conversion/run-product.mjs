import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {launchBrowser,sleep} from '../creation/browser.mjs'
const output=resolve('.tools/video-conversion-product'),origin='http://127.0.0.1:4241',test=n=>'[data-testid="'+n+'"]'
await mkdir(join(output,'downloads'),{recursive:true})
const server=spawn(process.execPath,['tools/video-conversion/preview.mjs','--port','4241'],{windowsHide:true,stdio:'ignore'})
let browser
const report={scope:'8D2 desktop product integration, not Android; inherits 8D1 decoder correctness',checks:[],matrix:[],errors:[]}
try{
 await sleep(200);browser=await launchBrowser(output)
 const{evaluate,waitFor,click,inputFiles,send}=browser
 const omission=`const NativeDecoder=self.VideoDecoder;self.VideoDecoder=class extends NativeDecoder{constructor(init){super({...init,output(frame){const r=frame.visibleRect;const copy=new VideoFrame(frame,{displayWidth:r.width,displayHeight:r.height});frame.close();init.output(copy)}})}};`
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`const ParentWorker=Worker;window.Worker=class extends ParentWorker{constructor(url,options){
  const original=String(url);if(window.__videoParOmission&&original.includes('source.worker-')){
   const queue='const early=[];const hold=e=>{early.push(e.data);e.stopImmediatePropagation()};self.addEventListener("message",hold);';
   const drain='self.removeEventListener("message",hold);for(const data of early)self.dispatchEvent(new MessageEvent("message",{data}));';
   const script=queue+${JSON.stringify(omission)}+'await import('+JSON.stringify(original)+');'+drain;
   const wrapped=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));super(wrapped,{...options,type:'module'});this.labUrl=wrapped;
  }else super(url,options)}terminate(){if(this.labUrl){URL.revokeObjectURL(this.labUrl);this.labUrl=undefined}return super.terminate()}};`})
 const debug=()=>evaluate('JSON.parse(document.querySelector('+JSON.stringify(test('video-conversion-debug'))+').textContent)')
 const field=async(name,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(test(name))});const setter=Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}))})()`)
 const select=async name=>{await inputFiles(test('video-input'),[resolve('.tools/video-source/fixtures',name)]);await waitFor(`['ready','error'].includes(JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent).status)`,120000);const d=await debug();assert.equal(d.status,'ready',JSON.stringify(d));return d}
 const convert=async()=>{
  await evaluate(`window.__videoProgress=[];window.__videoProgressObserver=new MutationObserver(()=>{const p=document.querySelector('progress[value]');if(p)window.__videoProgress.push(p.value)});window.__videoProgressObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['value']})`)
  await click(test('video-convert'));await waitFor(`['success','error'].includes(JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent).status)`,120000)
  await evaluate('window.__videoProgressObserver.disconnect()')
  const d=await debug();assert.equal(d.status,'success',JSON.stringify(d));assert.equal(d.sampledFrames,d.plan.frameCount)
  const values=await evaluate('window.__videoProgress');assert(values.every((v,i)=>v>=0&&v<=1&&(i===0||v>=values[i-1])))
  assert.equal(d.activeVideoSourceWorkers,0);assert.equal(d.activeEncoderWorkers,0);assert.equal(d.activeOutputDecoderWorkers,0)
  return d
 }
 const enter=async()=>{await browser.navigate(origin+'/AniView/?debug=1');await waitFor(`!!document.querySelector('${test('convert-video-entry')}')`);await click(test('convert-video-entry'));await waitFor(`!!document.querySelector('${test('video-input')}')`)}
 await browser.navigate(origin+'/AniView/?debug=1');await waitFor(`!!document.querySelector('${test('convert-video-entry')}')`)
 report.startupAssets=[...browser.assets];assert(!browser.assets.some(a=>/\/(?:VideoConversionWorkspace-|source\.worker-|runtime-(?!diagnostics-))/.test(a.url)),JSON.stringify(browser.assets))
 await click(test('convert-video-entry'));await waitFor(`!!document.querySelector('${test('video-input')}')`)
 assert(!browser.assets.some(a=>/source.worker|encoder.worker/.test(a.url)));report.checks.push('home entry and lazy UI/worker startup')
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(output,'downloads'),eventsEnabled:true})
 for(const source of['cfr.mp4','vp9.webm']){
  await select(source)
  for(const target of['gif','webp','apng']){await field('video-target',target);const d=await convert();report.matrix.push({source,target,diagnostics:d});await click(test('video-result-download'))}
 }
 report.checks.push('six directions / actual decode-back / monotonic progress / exact estimates')
 for(const [source,target,settings]of[
  ['vfr.mp4','apng',{start:.15,end:1.03,fps:20,size:360}],['bframes.mp4','webp',{start:0,end:2,fps:10,size:'original'}],
  ['rotation.mp4','apng',{start:0,end:1,fps:15,size:480}],['portrait.mp4','webp',{start:0,end:.5,fps:10,size:480}],
  ['1080.mp4','apng',{start:0,end:1,fps:10,size:360}],['1080.mp4','apng',{start:0,end:1,fps:10,size:720}],
 ]){await select(source);await field('video-target',target);await field('video-start-time',settings.start);await field('video-end-time',settings.end);await field('video-fps',settings.fps);await field('video-size',settings.size);const d=await convert();report.checks.push({source,target,plan:d.plan})}
 await select('par.mp4');for(const target of['gif','webp','apng']){await field('video-target',target);const d=await convert();assert.equal(d.plan.width,128);assert.equal(d.plan.height,48)}
 report.checks.push('PAR through all three product target flows')
 await evaluate('window.__videoParOmission=true');await select('par.mp4')
 for(const target of['gif','webp','apng']){await field('video-target',target);const d=await convert();assert.equal(d.plan.width,128);assert.equal(d.plan.height,48);assert(d.trackParFallbackSamples>0)}
 await evaluate('window.__videoParOmission=false');report.checks.push('test-only native PAR omission through all three product targets')
 await field('video-target','apng');await field('video-fps',30);await field('video-target','gif')
 assert.equal(await evaluate(`document.querySelector('${test('video-fps')}').value`),'10')
 assert.deepEqual(await evaluate(`Array.from(document.querySelector('${test('video-fps')}').options).map(o=>o.value)`),['5','10','20'])
 report.checks.push('target switching resets unsupported FPS')
 // Native preview controls only choose normalized UI trim; they do not decode conversion frames.
 await evaluate(`(async()=>{const v=document.querySelector('${test('video-source-preview')}');await v.play();v.pause();v.currentTime=.2;v.dispatchEvent(new Event('timeupdate'))})()`)
 await click(test('video-set-start'));assert.equal((await debug()).plan.startUs,200000)
 report.checks.push('native source play/pause/seek and Set Start')
 await field('video-start-time',0);await field('video-target','apng');await convert()
 const before=await debug();await click(test('video-result-preview'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
 await browser.clickLabel('Play');await browser.clickLabel('Pause');await browser.clickLabel('Close')
 await waitFor(`!!document.querySelector('${test('video-result-download')}')`);assert.equal((await debug()).videoAnimationJobsCompleted,before.videoAnimationJobsCompleted)
 report.checks.push('AniView result Preview playback and Close preserves result')
 const prior=(await readdir(join(output,'downloads'))).filter(n=>n.endsWith('.png'))
 await click(test('video-result-download'));await click(test('video-result-download'))
 let saved=[]
 for(let i=0;i<100;i++){saved=(await readdir(join(output,'downloads'))).filter(n=>n.endsWith('.png')&&!prior.includes(n));if(saved.length>=2)break;await sleep(50)}
 assert.equal(saved.length,2);assert.notEqual(saved[0],saved[1]);assert.deepEqual(await readFile(join(output,'downloads',saved[0])),await readFile(join(output,'downloads',saved[1])))
 report.downloads=saved;report.checks.push('two actual unique APNG downloads with matching retained bytes')
 await select('dense-1080.mp4');await field('video-target','webp');await field('video-size',720);await field('video-fps',30);await field('video-end-time',2)
 assert.equal(await evaluate(`document.querySelector('${test('video-convert')}').disabled`),true)
 assert((await evaluate(`document.querySelector('${test('video-preflight-error')}').textContent`)).includes('too large'))
 report.checks.push('frame-pixel overflow rejected with reduction advice')
 await select('benchmark.mp4');await field('video-fps',30);await field('video-end-time',10)
 assert.equal(await evaluate(`document.querySelector('${test('video-convert')}').disabled`),true)
 assert((await evaluate(`document.querySelector('${test('video-preflight-error')}').textContent`)).includes('too many frames'))
 await field('video-fps',15);assert.equal(await evaluate(`document.querySelector('${test('video-convert')}').disabled`),false)
 assert.equal((await debug()).plan.frameCount,150);await field('video-end-time',10.000001)
 assert.equal(await evaluate(`document.querySelector('${test('video-convert')}').disabled`),true)
 assert((await evaluate(`document.querySelector('${test('video-preflight-error')}').textContent`)).includes('too many frames'))
 report.checks.push('exact150 allowed /151 rejected before conversion')
 await field('video-end-time',5);await click(test('video-convert'));await waitFor(`!!document.querySelector('${test('video-cancel')}')`);await click(test('video-cancel'))
 await waitFor(`JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent).status==='cancelled'`);await convert();report.checks.push('product Cancel then same-settings rerun')
 for(const width of[320,390,768,1280]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false)}
 await send('Page.captureScreenshot',{format:'png'}).then(x=>writeFile(join(output,'product.png'),Buffer.from(x.data,'base64')))
 report.checks.push('320/390/768/1280 responsive layouts')
 await select('cfr.mp4');await field('video-target','gif');await convert();await click(test('video-conversion-back'))
 await waitFor(`!!document.querySelector('${test('convert-video-entry')}')`)
 report.cleanup=await evaluate("JSON.parse(document.querySelector('[data-testid=runtime-metrics]').textContent)")
 for(const name of['activeWorkers','activeBitmaps','activeArchiveSessions'])assert.equal(report.cleanup[name],0)
 for(const name of['activeVideoSourceWorkers','activeEncoderWorkers','activeSamples','activeCanvases','activeImageData','ownedRgba','awaitingAck','activeObjectUrls','cleanupErrors'])assert.equal(report.cleanup.lastVideoAnimationCleanup[name],0)
 report.checks.push('new source cleanup / Home final cleanup')
 for(const name of saved){await inputFiles('input[type=file][accept="image/*"]',[join(output,'downloads',name)]);await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'");await browser.clickLabel('Close');await waitFor(`!!document.querySelector('${test('convert-video-entry')}')`)}
 report.checks.push('both saved animations reopen in ordinary Viewer')
 await enter();await inputFiles(test('video-input'),[resolve('.tools/video-source/fixtures/hdr-tagged.mp4')]);await waitFor(`JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent).status==='error'`)
 assert.equal((await debug()).error,'VIDEO_CODEC_UNSUPPORTED');assert((await evaluate(`document.querySelector('${test('video-conversion-error')}').textContent`)).includes('codec'))
 await select('cfr.mp4');await convert();report.checks.push('unsupported source codec UX and normal source recovery')
 await enter();await select('benchmark.mp4');await click(test('video-convert'));await click(test('video-conversion-back'));await waitFor(`!!document.querySelector('${test('convert-video-entry')}')`)
 report.checks.push('leave page cancels active conversion')
 report.errors=browser.errors;assert.deepEqual(report.errors,[])
 report.probe=await evaluate('window.__creationProbe')
 assert.equal(report.probe.activeWorkers,0);assert.equal(report.probe.urlsCreated.length,report.probe.urlsRevoked.length)
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'PASS',checks:report.checks.length,matrix:report.matrix.length,probe:report.probe,errors:report.errors}))
}finally{await browser?.close();server.kill()}
