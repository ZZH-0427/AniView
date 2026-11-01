// P1 product regressions only: installed Edge, accepted procedural fixtures, no codec matrix.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {launchBrowser,sleep} from '../creation/browser.mjs'

const out=resolve('.tools/ui-polish'),origin='http://127.0.0.1:4243/AniView/'
await mkdir(out,{recursive:true})
const video=resolve('.tools/video-source/fixtures/benchmark.mp4')
await stat(video) // Original 8D fixture prerequisite; never download a replacement.
const fixtures=JSON.parse(await readFile('.tools/creation/fixtures.json','utf8'))
const images=fixtures.groups['small-200'].files.slice(0,2)
// Use the accepted product fixture: tiny 2×2 parser fixtures are not native H.264 configurations.
const animation=resolve('.tools/mp4-product/fixtures/small.webp')
await stat(animation)
const server=spawn(process.execPath,['tools/video-conversion/preview.mjs','--root','dist','--port','4243'],{windowsHide:true,stdio:'ignore'})
let serverError;server.on('error',e=>{serverError=e})
const report={viewports:[1280,768,390,360],returns:[],checks:[],downloads:[],errors:[],assets:[]}
let browser
try{
 for(let i=0;i<100;i++){if(serverError)throw serverError;try{if((await fetch(origin)).ok)break}catch{}if(i===99)throw Error('Preview unavailable');await sleep(50)}
 browser=await launchBrowser(out)
 const {evaluate,waitFor,inputFiles,send}=browser,q=id=>`[data-testid="${id}"]`
 const downloadPath=join(out,'downloads');await mkdir(downloadPath,{recursive:true})
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath,eventsEnabled:true})
 const wait=code=>waitFor(code,90000)
 const viewport=async(width)=>{await send('Emulation.setDeviceMetricsOverride',{width,height:width===360?800:width===390?844:900,deviceScaleFactor:1,mobile:width<400});await send('Emulation.setTouchEmulationEnabled',{enabled:width<400,maxTouchPoints:2})}
 const home=async(debug=false)=>{await browser.navigate(origin+(debug?'?debug=1':''));await wait('!!document.querySelector(".home")')}
 const edit=async(id,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(q(id))});e.focus();Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur()})()`)}
 const key=async name=>{const code=name===' '?'Space':name;await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code,
  windowsVirtualKeyCode:name==='Enter'?13:name==='Tab'?9:name===' '?32:name==='Escape'?27:undefined,
  ...(['Enter',' '].includes(name)?{text:name==='Enter'?'\r':' ',unmodifiedText:name==='Enter'?'\r':' '}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code})}
 const pointer=async selector=>{const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r})}
 const click=id=>pointer(q(id))
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'.png'),Buffer.from(s.data,'base64'))}
 const check=async(name,fn)=>{await fn();report.checks.push({name,status:'PASS'});console.log('PASS '+name)}
 const live=()=>evaluate(`({workers:window.__creationProbe.activeWorkers,urls:window.__creationProbe.urlsCreated.filter(x=>!window.__creationProbe.urlsRevoked.includes(x.url)).length})`)
 const resultEvidence=(resultId,downloadId)=>evaluate(`({href:document.querySelector(${JSON.stringify(q(downloadId))}).href,text:document.querySelector(${JSON.stringify(q(resultId))}).innerText,jobs:window.__creationProbe.jobs.length})`)
 const previewReady=native=>wait(native?'document.querySelector("[data-testid=mp4-video]")?.readyState>=1':
  '["paused","ready"].includes(document.querySelector("[data-testid=playback-state]")?.textContent)')
 async function returns(flow,previewId,resultId,downloadId,native=false){
  for(const {width,resize} of [...report.viewports.map(width=>({width})),{width:390,resize:360}]){
   await viewport(width)
   const before=await resultEvidence(resultId,downloadId)
   await click(previewId)
   await previewReady(native)
   if(resize)await viewport(resize) // Additional case, not a substitute for same-width 390 testing.
   if(native)await click('video-preview-back');else await pointer('[aria-label="Close"]')
   await wait(`document.activeElement===document.querySelector(${JSON.stringify(q(previewId))})`)
   const after=await resultEvidence(resultId,downloadId)
   assert.deepEqual(after,before,'Preview must not re-encode, replace the Blob, or lose result metadata')
   const context=await evaluate(`(()=>{const p=document.querySelector(${JSON.stringify(q(previewId))}),d=document.querySelector(${JSON.stringify(q(downloadId))}),a=p.getBoundingClientRect(),b=d.getBoundingClientRect(),s=getComputedStyle(p);return {scrollY,viewport:innerWidth,preview:{top:a.top,bottom:a.bottom},download:{top:b.top,bottom:b.bottom},height:innerHeight,outline:s.outlineWidth,outlineStyle:s.outlineStyle,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
   assert.ok(context.preview.top>=0&&context.preview.bottom<=context.height)
   assert.ok(context.download.top>=0&&context.download.bottom<=context.height,'Download immediately visible')
   assert.ok(parseFloat(context.outline)>=3&&context.outlineStyle==='solid','Return target visibly focused after pointer Close')
   assert.equal(context.overflow,false)
   if(width===390)await shot(flow+'-return-'+context.viewport+(resize?'-reflow':''))
   await key('Tab')
   assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(q(downloadId))})`),true,'Next Tab goes to Download')
   report.returns.push({flow,width,resizedTo:resize??null,status:'PASS',...context})
  }
  // Keyboard open/close is a separate activation path from the pointer loops.
  const activation=flow==='mp4'?' ':'Enter'
  await evaluate(`document.querySelector(${JSON.stringify(q(previewId))}).focus()`);await key(activation)
  await previewReady(native)
  const close=native?q('video-preview-back'):'[aria-label="Close"]'
  await evaluate(`document.querySelector(${JSON.stringify(close)}).focus()`);await key(activation)
  await wait(`document.activeElement===document.querySelector(${JSON.stringify(q(previewId))})`)
  const downloadStart=browser.downloads.length
  await click(downloadId)
  for(let i=0;i<100&&!browser.downloads.slice(downloadStart).some(e=>e.state==='completed');i++)await sleep(30)
  const events=browser.downloads.slice(downloadStart),begin=events.find(e=>e.type==='Browser.downloadWillBegin')
  assert.ok(begin&&events.some(e=>e.state==='completed'),'Native download completed')
  const saved=await readFile(join(downloadPath,begin.suggestedFilename));assert.ok(saved.length>0)
  report.downloads.push({flow,name:begin.suggestedFilename,bytes:saved.length,status:'completed'})
  console.log('PASS '+flow+' pointer/keyboard/resize return and Download')
 }

 await viewport(390);await home();await click('create-gif-entry');await wait('!!document.querySelector("[data-testid=creation-input]")')
 await check('Creator 0/1/2 sources preserve enablement and explain the minimum',async()=>{
  assert.equal(await evaluate('document.querySelector("[data-testid=creation-generate]").disabled'),true)
  await inputFiles(q('creation-input'),[images[0]]);await wait('!!document.querySelector("[data-testid=creation-minimum-sources]")')
  assert.equal(await evaluate('document.querySelector("[data-testid=creation-generate]").disabled'),true);await shot('creator-one-image-390')
  await inputFiles(q('creation-input'),[images[1]]);await wait('!document.querySelector("[data-testid=creation-generate]").disabled')
  assert.equal(await evaluate('!!document.querySelector("[data-testid=creation-minimum-sources]")'),false)
 })
 await click('creation-generate');await wait('!!document.querySelector("[data-testid=creation-result]")')
 await returns('creator','creation-preview','creation-result','creation-download')
 await click('creation-back');await wait('!!document.querySelector(".home")');assert.deepEqual(await live(),{workers:0,urls:0})

 await inputFiles(q('image-input'),[animation]);await wait('document.querySelector("[data-testid=playback-state]")?.textContent==="paused"')
 await pointer('[aria-label="More"]');await key('Escape');assert.equal(await evaluate('!!document.querySelector("[role=menu]")'),false)
 assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'More')
 await pointer('[aria-label="More"]');await pointer('[aria-label="Convert animation"]');await wait('!!document.querySelector("[data-testid=conversion-start]")&&!document.querySelector("[data-testid=conversion-start]").disabled')
 await click('conversion-start');await wait('!!document.querySelector("[data-testid=conversion-result]")')
 await returns('animation','conversion-preview','conversion-result','conversion-download')
 await pointer('input[value="mp4"]');await click('conversion-start');await wait('document.querySelector("[data-testid=conversion-result]")?.textContent.includes("Converted MP4")')
 await returns('mp4','conversion-preview','conversion-result','conversion-download',true)
 await click('conversion-back');await wait('!!document.querySelector(".viewer")');await pointer('[aria-label="Close"]');await wait('!!document.querySelector(".home")');assert.deepEqual(await live(),{workers:0,urls:0})

 await click('convert-video-entry');await wait('!!document.querySelector("[data-testid=video-input]")')
 const invalid=join(out,'unsupported.mp4');await writeFile(invalid,'not a video')
 await inputFiles(q('video-input'),[invalid]);await wait('!!document.querySelector("[data-error-location=source]")')
 await check('Source errors are beside the picker, with one alert and input association',async()=>{
  assert.equal(await evaluate('document.querySelector("[data-testid=video-source-section]").contains(document.querySelector("[data-error-location=source]"))'),true)
  assert.equal(await evaluate('document.querySelectorAll("[role=alert]").length'),1)
  assert.equal(await evaluate('document.querySelector("[data-testid=video-input]").getAttribute("aria-describedby")===document.querySelector("[data-error-location=source]").id'),true)
  await evaluate('scrollTo(0,0)');await shot('source-error-360')
 })
 await inputFiles(q('video-input'),[video]);await wait('!!document.querySelector("[data-testid=video-estimate]")')
 await edit('video-start-time',6);await edit('video-end-time',5)
 await check('Trim error stays in the described invalid group and clears on correction',async()=>{
  await wait('!!document.querySelector("[data-error-location=trim]")')
  assert.equal(await evaluate('document.querySelector(".video-trim").contains(document.querySelector("[data-error-location=trim]"))'),true)
  assert.equal(await evaluate('document.querySelector(".video-trim").getAttribute("aria-invalid")'), 'true')
  assert.equal(await evaluate('document.querySelector("[data-testid=video-end-time]").getAttribute("aria-describedby")===document.querySelector("[data-error-location=trim]").id'),true)
  assert.equal(await evaluate('document.querySelectorAll("[role=alert]").length'),0)
  await evaluate('document.querySelector(".video-trim").scrollIntoView({block:"center"})');await shot('trim-error-360')
  await edit('video-start-time',0);await edit('video-end-time',5);await wait('!document.querySelector("[data-error-location=trim]")')
 })
 await edit('video-fps',30);await edit('video-end-time',6)
 await check('Frame-count rejection remains near Output/Convert',async()=>{
  await wait('!!document.querySelector("[data-error-location=output]")')
  assert.equal(await evaluate('document.querySelector("[data-testid=video-convert]").disabled'),true)
  assert.equal(await evaluate('document.querySelector(".video-trim").hasAttribute("aria-invalid")'),false)
 })
 await edit('video-fps',15);await edit('video-end-time',5)
 await check('Normal preflight hides engineering budgets',async()=>{assert.equal(await evaluate('/frame.pixel|15\\.36|workload/i.test(document.body.innerText)'),false)})
 await click('video-convert');await wait('!!document.querySelector("[data-testid=video-conversion-result]")')
 await returns('video','video-result-preview','video-conversion-result','video-result-download')
 await click('video-conversion-back');await wait('!!document.querySelector(".home")');assert.deepEqual(await live(),{workers:0,urls:0})
 await check('All workspace exits release active Workers and URLs',async()=>{assert.deepEqual(await live(),{workers:0,urls:0})})

 await home(true);await click('convert-video-entry');await wait('!!document.querySelector("[data-testid=video-input]")');await inputFiles(q('video-input'),[video]);await wait('!!document.querySelector("[data-testid=video-estimate]")')
 await check('Debug retains exact estimate and frame-pixel limit',async()=>{
  const debug=await evaluate('JSON.parse(document.querySelector("[data-testid=video-conversion-debug]").textContent)')
  assert.equal(debug.plan.framePixels,debug.estimate.framePixels);assert.equal(debug.limits.maxFramePixels,15360000)
  assert.ok(debug.plan.framePixels>0)
 })
 await click('video-conversion-back');await wait('!!document.querySelector(".home")')
 await check('Static viewing and ZIP navigation/conversion remain integrated',async()=>{
  await inputFiles(q('image-input'),[images[0]]);await wait('document.querySelector("[data-testid=playback-state]")?.textContent==="ready"')
  assert.equal(await evaluate('!!document.querySelector("[aria-label=Play]")'),false);await pointer('[aria-label="Close"]');await wait('!!document.querySelector(".home")')
  await inputFiles(q('archive-input'),[resolve('tests/fixtures/validation/zip/mixed.zip')]);await wait('document.querySelector("[data-testid=playback-state]")?.textContent==="paused"')
  const archive=await evaluate('document.querySelector("[data-testid=archive-name]").textContent')
  await pointer('[aria-label="More"]');await pointer('[aria-label="Convert animation"]');await wait('!!document.querySelector("[data-testid=conversion-start]")&&!document.querySelector("[data-testid=conversion-start]").disabled');await click('conversion-start');await wait('!!document.querySelector("[data-testid=conversion-result]")');await click('conversion-back');await wait('!!document.querySelector(".viewer")')
  assert.equal(await evaluate('document.querySelector("[data-testid=archive-name]").textContent'),archive)
 })
 // The shared CDP helper also records a probe RPC if its Worker target disappears
 // during legitimate teardown. Preserve that exact transport notice separately;
 // every page exception/console error and every other protocol error still fails.
 const detachedProbe=message=>{try{const error=JSON.parse(message);return error.code===-32001&&error.message==='Session with given id not found.'}catch{return false}}
 report.protocolNotices=browser.errors.filter(detachedProbe)
 report.errors=browser.errors.filter(message=>!detachedProbe(message));report.assets=browser.assets
 assert.deepEqual(report.errors,[]);assert.equal(report.assets.filter(a=>a.status>=400).length,0)
 report.status='PASS'
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();server.kill()}
