import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {ZipWriter,BlobWriter,BlobReader} from '@zip.js/zip.js'
import {launchBrowser,sleep} from '../creation/browser.mjs'
import {regionalAPNG,regionalGIF,regionalWebP} from './conformance-fixtures.mjs'
const out=resolve('.tools/mp4-product'),fixtures=join(out,'fixtures'),port='4225',origin=`http://127.0.0.1:${port}`,test=id=>`[data-testid="${id}"]`
await mkdir(fixtures,{recursive:true});await mkdir(join(out,'downloads'),{recursive:true})
const workerDir=resolve('.tools/mp4-product-workers/assets'),held=(await readdir(workerDir)).find(n=>n.startsWith('held-encoder.worker-')),
  fixture=(await readdir(workerDir)).find(n=>n.startsWith('fixture.worker-'))
const assets=await readdir('dist/assets'),videoName=(await Promise.all(assets.filter(n=>n.startsWith('encoder.worker-')).map(async n=>({n,size:(await stat('dist/assets/'+n)).size})))).find(x=>x.size>200000)?.n
assert(held&&fixture&&videoName)
const server=spawn(process.execPath,['tools/video/product-preview.mjs','--port',port,'--test-workers'],{windowsHide:true,stdio:'ignore'})
let browser
const report={scope:'Installed desktop Edge, actual MP4 product UI; not Android',checks:[],matrix:[]}
try{
  for(let i=0;i<80;i++){try{if((await fetch(origin+'/AniView/')).ok)break}catch{}await sleep(100)}
  // Serve the fixture-generator Worker through its own isolated static preview.
  const generator=spawn(process.execPath,['tools/video/preview.mjs','--port','4226'],{windowsHide:true,stdio:'ignore'})
  try{
    browser=await launchBrowser(out);await browser.navigate(origin+'/AniView/?debug=1');await browser.waitFor("!!document.querySelector('input[type=file]')")
    const startup=[...browser.assets];assert(!startup.some(a=>/ConversionWorkspace|product-conversion|VideoResultPreview/.test(a.url)));report.startupAssets=startup
    // Use a same-origin fetchable fixture Worker: fixture creation stays in a disposable lab document.
    for(const [size,w,h,count] of [['small',320,240,10],['medium',960,720,10],['odd',319,241,10],['duration-limit',64,48,10]])for(const format of size==='odd'||size==='duration-limit'?['apng']:['gif','apng','webp']){
      // The existing engineering preview serves .tools/video-site; the generator artifact
      // is copied there by the build setup, outside the product dist.
      await browser.navigate('http://127.0.0.1:4226/AniView/experiments/video/index.html?debug=1')
    const options={width:w,height:h,count,playCount:2,scene:'flat',durations:size==='duration-limit'?[4000]:[27,100,41,250]}
      const encoded=await browser.evaluate(`(async()=>{const w=new Worker('/AniView/assets/${fixture}',{type:'module'});try{return await new Promise((resolve,reject)=>{w.onerror=()=>reject(Error('fixture Worker'));w.onmessage=async e=>{if(e.data.type==='fixture-boot')return;if(e.data.type!=='fixture'){reject(Error('fixture error'));return}const blob=new Blob([e.data.data.slice(0,e.data.byteLength)]),reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)};w.postMessage({format:${JSON.stringify(format)},options:${JSON.stringify(options)},softEdges:${format!=='gif'}})})}finally{w.terminate()}})()`)
      await writeFile(join(fixtures,`${size}.${format==='apng'?'png':format}`),Buffer.from(encoded,'base64'))
    }
  }finally{generator.kill()}
  for(const size of ['small','medium','odd']){
    const zip=new ZipWriter(new BlobWriter('application/zip'))
    for(const format of size==='odd'?['apng']:['gif','apng','webp']){const extension=format==='apng'?'png':format;await zip.add(`${format}.${extension}`,new BlobReader(new Blob([await readFile(join(fixtures,`${size}.${extension}`))])))}
    await writeFile(join(fixtures,size+'.zip'),Buffer.from(await(await zip.close()).arrayBuffer()))
  }
  for(const [name,bytes] of [['regional.png',await regionalAPNG()],['regional.gif',await regionalGIF()],['regional.webp',await regionalWebP()]])await writeFile(join(fixtures,name),bytes)
  await writeFile(join(fixtures,'manifest.json'),JSON.stringify({small:{width:320,height:240,frames:10},medium:{width:960,height:720,frames:10},odd:{width:319,height:241,frames:10}}))
  const {evaluate,click,clickLabel,waitFor,inputFiles,send}=browser
  await browser.navigate(origin+'/AniView/?debug=1');await waitFor("!!document.querySelector('input[type=file]')")
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(out,'downloads'),eventsEnabled:true})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const ProductNativeWorker=Worker;
    window.Worker=class extends ProductNativeWorker{constructor(url,options){let target=url;
      if(String(url).includes(${JSON.stringify(videoName)})&&window.__mp4HoldFinalize)target='/AniView/validation/mp4-worker/${held}';
      let labUrl;if(String(url).includes(${JSON.stringify(videoName)})&&window.__mp4Unsupported){labUrl=URL.createObjectURL(new Blob(['import '+JSON.stringify(new URL(url,location.href).href)+';globalThis.VideoEncoder=undefined;'],{type:'text/javascript'}));target=labUrl}
      super(target,options);this.__mp4LabUrl=labUrl;if(labUrl)this.addEventListener('message',()=>{URL.revokeObjectURL(labUrl);this.__mp4LabUrl=undefined},{once:true});if(String(url).includes(${JSON.stringify(videoName)}))this.addEventListener('message',e=>{
        if(e.data?.type==='accepted'&&window.__mp4HoldAccepted){window.__mp4Accepted=true;e.stopImmediatePropagation()}
        if(e.data?.type==='finalize-held')window.__mp4Held=true;
      })}terminate(){if(this.__mp4LabUrl)URL.revokeObjectURL(this.__mp4LabUrl);return super.terminate()}
    };
  `})
  await browser.navigate(origin+'/AniView/?debug=1');await waitFor("!!document.querySelector('input[type=file]')")
  const debug=()=>evaluate(`JSON.parse(document.querySelector('${test('conversion-debug')}').textContent)`)
  const enter=async path=>{
    await inputFiles('input[type=file][accept="image/*"]',[path]);await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
    await clickLabel('More');await clickLabel('Convert animation');await waitFor(`document.querySelector('${test('conversion-start')}')?.disabled===false`)
    await click('input[name=conversion-target][value=mp4]')
  }
  const back=async()=>{await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")}
  const convert=async()=>{
    await evaluate(`window.__mp4Beat={last:performance.now(),max:0};window.__mp4Timer=setInterval(()=>{const n=performance.now(),b=window.__mp4Beat;b.max=Math.max(b.max,n-b.last);b.last=n},16);window.__mp4Progress=[];window.__mp4Observer=new MutationObserver(()=>{const p=document.querySelector('progress');if(p?.hasAttribute('value'))window.__mp4Progress.push({n:p.value,max:p.max})});window.__mp4Observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['value']})`)
    await click(test('conversion-start'));await waitFor(`['success','error'].includes(JSON.parse(document.querySelector('${test('conversion-debug')}').textContent).status)`,120000);const d=await debug()
    const observation=await evaluate('window.__mp4Observer.disconnect();clearInterval(window.__mp4Timer);({progress:window.__mp4Progress,heartbeat:window.__mp4Beat.max})')
    assert(observation.progress.every((p,i,a)=>p.n<=p.max&&(!i||p.n>=a[i-1].n)));report.maxHeartbeatGapMs=Math.max(report.maxHeartbeatGapMs??0,observation.heartbeat)
    assert.equal(d.status,'success',JSON.stringify(d));assert.equal(d.activeVideoWorkers,0);assert.equal(d.activeDecoderWorkers,0);assert.equal(d.peakCanonicalRgbaFrames,1);return d
  }
  for(const [name,extension] of [['small','gif'],['small','png'],['small','webp'],['odd','png'],['regional','gif'],['regional','png'],['regional','webp']]){
    await enter(join(fixtures,`${name}.${extension}`));if(report.matrix.length===0)assert(!browser.assets.some(a=>a.url.includes(videoName)||a.url.includes('product-conversion')))
    const d=await convert()
    const text=await evaluate(`document.querySelector('${test('conversion-result')}').innerText`);assert(text.includes('H.264'));assert(!text.includes('Frames'));assert(!text.includes('avc1.'))
    if(name==='odd')assert(text.includes('320 × 242')&&text.includes('padding'))
    const url=await evaluate(`document.querySelector('${test('conversion-download')}').href`)
    await click(test('conversion-preview'));await waitFor(`!!document.querySelector('${test('mp4-video')}')`)
    const playback=await send('Runtime.evaluate',{expression:`(async()=>{const v=document.querySelector('video');for(let i=0;i<100&&v.readyState<1;i++)await new Promise(r=>setTimeout(r,30));await v.play();await new Promise(r=>setTimeout(r,100));v.pause();v.currentTime=v.duration/2;return{width:v.videoWidth,height:v.videoHeight,duration:v.duration,error:v.error?.code??null}})()`,userGesture:true,awaitPromise:true,returnByValue:true})
    assert(!playback.exceptionDetails);const native=playback.result.value
    assert.equal(native.error,null);await click(test('video-preview-back'));await waitFor(`!!document.querySelector('${test('conversion-result')}')`)
    const facts=await evaluate(`Object.fromEntries([...document.querySelectorAll('${test('conversion-result')} dl>div')].map(e=>[e.querySelector('dt').textContent,e.querySelector('dd').textContent]))`)
    assert.equal(facts.Dimensions,native.width+' × '+native.height);assert(Math.abs(parseFloat(facts.Duration)-native.duration)<.001)
    assert.equal(await evaluate(`document.querySelector('${test('conversion-download')}').href`),url)
    report.matrix.push({source:`${name}.${extension}`,diagnostics:d,native})
    if(report.matrix.length===1){
      const before=new Set(await readdir(join(out,'downloads')));await click(test('conversion-download'));await sleep(100);await click(test('conversion-download'))
      let files=[];for(let i=0;i<100;i++){files=(await readdir(join(out,'downloads'))).filter(f=>!before.has(f)&&f.endsWith('.mp4'));if(files.length===2)break;await sleep(100)}
      assert.equal(files.length,2);assert.notEqual(files[0],files[1]);assert.deepEqual(await readFile(join(out,'downloads',files[0])),await readFile(join(out,'downloads',files[1])));report.downloads=files
      for(const file of files){const bytes=[...await readFile(join(out,'downloads',file))];const reopened=await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([new Uint8Array(${JSON.stringify(bytes)})],{type:'video/mp4'})),v=document.createElement('video');try{v.src=url;v.preload='metadata';for(let i=0;i<100&&v.readyState<1&&!v.error;i++)await new Promise(r=>setTimeout(r,20));return{width:v.videoWidth,error:v.error?.code??null}}finally{v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url)}})()`);assert(reopened.width>0);assert.equal(reopened.error,null)}
    }
    else if(report.matrix.length<=3){const before=new Set(await readdir(join(out,'downloads')));await click(test('conversion-download'));await waitFor(`document.querySelector('${test('conversion-result')}')!==null`);for(let i=0;i<100;i++){if((await readdir(join(out,'downloads'))).some(f=>!before.has(f)&&f.endsWith('.mp4')))break;await sleep(30)}assert((await readdir(join(out,'downloads'))).some(f=>!before.has(f)&&f.endsWith('.mp4')))}
    await back();await clickLabel('Close')
  }
  for(const mode of ['Accepted','Finalize']){
    await enter(join(fixtures,'medium.png'));await evaluate(`window.__mp4Hold${mode}=true;window.__mp4${mode==='Accepted'?'Accepted':'Held'}=false`)
    await click(test('conversion-start'));await waitFor(`window.__mp4${mode==='Accepted'?'Accepted':'Held'}===true`,120000)
    if(mode==='Finalize')assert((await evaluate(`document.querySelector('${test('conversion-status')}').textContent`)).includes('Finalizing MP4'))
    await click(test('conversion-cancel'));await waitFor(`JSON.parse(document.querySelector('${test('conversion-debug')}').textContent).status==='cancelled'`)
    await evaluate(`window.__mp4Hold${mode}=false`);await convert();await back();await clickLabel('Close');report.checks.push(mode+' actual product Cancel→rerun')
  }
  await enter(join(fixtures,'medium.png'));await evaluate('window.__mp4HoldFinalize=true;window.__mp4Held=false');await click(test('conversion-start'));await waitFor('window.__mp4Held===true',120000);await back();await evaluate('window.__mp4HoldFinalize=false');await clickLabel('Close');report.checks.push('Back while actually finalizing hard-stops the product job')
  await enter(join(fixtures,'small.gif'));await evaluate('window.__mp4Unsupported=true');await click(test('conversion-start'));await waitFor(`JSON.parse(document.querySelector('${test('conversion-debug')}').textContent).status==='error'`)
  assert.equal((await debug()).error,'VIDEO_API_UNAVAILABLE');assert((await evaluate(`document.querySelector('${test('conversion-error')}').textContent`)).includes('not supported'))
  await evaluate('window.__mp4Unsupported=false');await convert();await back();await clickLabel('Close');report.checks.push('Missing native API produces explicit unsupported UX, no fallback; rerun recovers')
  await enter(join(fixtures,'duration-limit.png'));await click(test('conversion-start'));await waitFor(`JSON.parse(document.querySelector('${test('conversion-debug')}').textContent).status==='error'`)
  assert.equal((await debug()).error,'RESOURCE_LIMIT');assert.equal((await debug()).activeVideoWorkers,0);assert.equal(await evaluate(`!!document.querySelector('${test('conversion-result')}')`),false);await back();await clickLabel('Close');report.checks.push('40-second animation is rejected by unchanged 30-second cycle guard')
  await enter(join(fixtures,'small.gif'));await convert()
  for(const width of [320,390,768,1280]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'))}
  await send('Emulation.clearDeviceMetricsOverride');await back();await clickLabel('Close');report.checks.push('Responsive result controls at320/390/768/1280 and recovery after resource rejection')
  // Borrowed MediaSession and ArchiveSession must retain their current source.
  await inputFiles('input[type=file][accept="image/*"]',[join(fixtures,'small.gif'),join(fixtures,'small.webp')]);await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  await clickLabel('More');await clickLabel('Convert animation');await waitFor(`document.querySelector('${test('conversion-start')}')?.disabled===false`);await click('input[value=mp4]');await convert();await back();await clickLabel('Next File');await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'");await clickLabel('Close');report.checks.push('MediaSession source and Next retained')
  await inputFiles('input[type=file][accept^=".zip"]',[join(fixtures,'small.zip')]);await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  await clickLabel('More');await clickLabel('Convert animation');await waitFor(`document.querySelector('${test('conversion-start')}')?.disabled===false`);await click('input[value=mp4]');await convert();await back();await clickLabel('Next File');await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'");await clickLabel('Close');report.checks.push('ZIP source and Next retained')
  await waitFor("JSON.parse(document.querySelector('[data-testid=runtime-metrics]').textContent).activeWorkers===0")
  report.cleanup=await evaluate("JSON.parse(document.querySelector('[data-testid=runtime-metrics]').textContent)");assert.equal(report.cleanup.lastConversionCleanup.activeObjectUrls,0);assert.equal(report.cleanup.lastConversionCleanup.activeVideoWorkers,0)
  report.errors=browser.errors;assert.deepEqual(report.errors,[])
  console.log(JSON.stringify({matrix:report.matrix.length,checks:report.checks,cleanup:report.cleanup}))
}finally{report.errors=browser?.errors??[];await writeFile(join(out,'product-report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill()}
