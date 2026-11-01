// UI/state preservation acceptance, not a codec/stress matrix. Uses the installed Edge.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {launchBrowser,sleep} from '../creation/browser.mjs'

const out=resolve('.tools/localization-browser'),base='http://127.0.0.1:4245/AniView/'
await mkdir(out,{recursive:true})
const fixtures=JSON.parse(await readFile('.tools/creation/fixtures.json','utf8'))
const report={checks:[],layouts:[],returns:[],activeJobs:[],mixed:[],errors:[]},q=id=>`[data-testid="${id}"]`
const server=spawn(process.execPath,['tools/video-conversion/preview.mjs','--port','4245'],{windowsHide:true,stdio:'ignore'})
let b
try{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break}catch{}if(i===99)throw Error('Preview unavailable');await sleep(50)}
 b=await launchBrowser(out);const {evaluate:ev,waitFor,send}=b,wait=x=>waitFor(x,90000)
 const viewport=async width=>{await send('Emulation.setDeviceMetricsOverride',{width,height:width===360?800:width===390?844:900,deviceScaleFactor:1,mobile:width<400});await send('Emulation.setTouchEmulationEnabled',{enabled:width<400,maxTouchPoints:2})}
 const key=async name=>{const code=name===' '?'Space':name;await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code,windowsVirtualKeyCode:name==='Enter'?13:name==='Tab'?9:name==='ArrowDown'?40:name==='Home'?36:undefined,...(['Enter',' '].includes(name)?{text:name==='Enter'?'\r':' ',unmodifiedText:name==='Enter'?'\r':' '}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code})}
 const locale=async value=>{await ev(`(()=>{const e=(document.fullscreenElement||document).querySelector('[data-testid=locale-switcher]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.documentElement.lang===${JSON.stringify(value)}`)}
 const edit=async(id,value)=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(q(id))})||document.getElementById(${JSON.stringify(id)});e.focus();Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur()})()`)
 const click=id=>b.click(q(id)),choose=(id,files)=>b.inputFiles(q(id),files)
 const paused=()=>wait('["paused","ready"].includes(document.querySelector("[data-testid=playback-state]")?.dataset.state)')
 const debug=id=>ev(`JSON.parse(document.querySelector(${JSON.stringify(q(id))}).textContent)`)
 const check=async(name,fn)=>{await fn();report.checks.push({name,status:'PASS'});console.log('PASS '+name)}
 async function boot(language,stored,blocked=false){
  const script=await send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'language',{configurable:true,get:()=>${JSON.stringify(language)}});Object.defineProperty(navigator,'languages',{configurable:true,get:()=>[${JSON.stringify(language)}]});${blocked?"Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Blocked','SecurityError')}})":stored===null?"localStorage.removeItem('aniview.locale')":`localStorage.setItem('aniview.locale',${JSON.stringify(stored)})`}`})
  await b.navigate(base+'?debug=1');await wait('!!document.querySelector(".home")');await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier})
 }
 async function audit(name,region){
  for(const width of [1440,1280,768,390,360])for(const language of ['en','zh-CN']){
   await viewport(width);await locale(language)
   await ev(region?`document.querySelector(${JSON.stringify(q(region))})?.scrollIntoView({block:'center'})`:'scrollTo(0,0)')
   const data=await ev(`(()=>{const node=document.body.cloneNode(true);const names=[...node.querySelectorAll('.creator-filename,.conversion-filename,.viewer-heading h1,[data-testid=archive-name]')].map(e=>e.title||e.textContent);node.querySelectorAll('[data-testid=diagnostics-panel],script,style,.language-switcher option,.creator-filename,.conversion-filename,.viewer-heading h1,[data-testid=archive-name]').forEach(e=>e.remove());const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),parts=[];while(walker.nextNode())parts.push(walker.currentNode.textContent);let text=parts.join(' ')+' '+[...node.querySelectorAll('[aria-label],[title]')].map(e=>(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||'')).join(' ');for(const n of names)text=text.split(n).join('');return {text,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,lang:document.documentElement.lang}})()`)
   assert.ok(data.scrollWidth<=width,'No horizontal overflow '+name)
   if(language==='en')assert.equal(/[\u3400-\u9fff]/.test(data.text),false,'Unintended Chinese in '+name)
   else{
    const allowed=new Set(['AniView','A','GIF','Animated','WebP','WebM','APNG','MP','H','VP','JPEG','PNG','ZIP','FPS','KiB','MiB','B','ms','s','px','CSS','Blob','ImageBitmap','Canvas','AbortController','ResizeObserver','OffscreenCanvas','Web','Worker','SDR'])
    const unknown=[...new Set(data.text.match(/[A-Za-z]+/g)||[])].filter(x=>!allowed.has(x))
    assert.deepEqual(unknown,[],'Unintended English in '+name)
   }
   report.layouts.push({surface:name,width,language,scrollWidth:data.scrollWidth});report.mixed.push({surface:name,width,language,status:'PASS'})
   const image=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${name}-${width}-${language}.png`),Buffer.from(image.data,'base64'))
  }
 }
 async function preview(flow,trigger,download,native=false){
  const href=await ev(`document.querySelector(${JSON.stringify(q(download))}).href`)
  for(const width of [390,360])for(const language of ['en','zh-CN']){
   await viewport(width);await locale(language);await click(trigger)
   if(native)await wait('document.querySelector("[data-testid=mp4-video]")?.readyState>=1');else await paused()
   await ev(`void(window.previewNode=document.querySelector(${JSON.stringify(native?q('mp4-video'):'canvas')}))`)
   await locale(language==='en'?'zh-CN':'en')
   assert.equal(await ev(`window.previewNode===document.querySelector(${JSON.stringify(native?q('mp4-video'):'canvas')})`),true,'Language must not remount preview media')
   if(native)await click('video-preview-back');else await b.clickLabel(language==='en'?'关闭':'Close')
   await wait(`document.activeElement===document.querySelector(${JSON.stringify(q(trigger))})`)
   assert.equal(await ev(`document.querySelector(${JSON.stringify(q(download))}).href`),href)
   const geometry=await ev(`(()=>{const p=document.querySelector(${JSON.stringify(q(trigger))}).getBoundingClientRect(),d=document.querySelector(${JSON.stringify(q(download))}).getBoundingClientRect();return {previewTop:p.top,downloadBottom:d.bottom,height:innerHeight}})()`)
   assert.ok(geometry.previewTop>=48&&geometry.downloadBottom<=geometry.height,'Result actions visible below the utility bar')
   await key('Tab');assert.equal(await ev(`document.activeElement===document.querySelector(${JSON.stringify(q(download))})`),true)
   report.returns.push({flow,width,language,status:'PASS',...geometry});await ev('delete window.previewNode')
  }
 }
 await viewport(390)
 await check('first-run detection, saved override, invalid preference and HTML language',async()=>{
  for(const [language,stored,expected] of [['zh-CN',null,'zh-CN'],['zh-HK',null,'zh-CN'],['en-US',null,'en'],['zh-CN','en','en'],['en-US','zh-CN','zh-CN'],['en-US','invalid','en']]){
   await boot(language,stored);await wait(`document.documentElement.lang===${JSON.stringify(expected)}`)
   assert.equal(await ev('document.querySelector("[data-testid=locale-switcher]").value'),expected)
  }
 })
 await check('language preference survives reload in both directions; keyboard operates switcher',async()=>{
  await locale('zh-CN');await send('Page.reload');await wait('document.documentElement.lang==="zh-CN"&&!!document.querySelector(".home")')
  await locale('en');await send('Page.reload');await wait('document.documentElement.lang==="en"&&!!document.querySelector(".home")')
  assert.equal(await ev('localStorage.getItem("aniview.locale")'),'en')
  await ev('document.querySelector("[data-testid=locale-switcher]").focus()');await key('Home');await key('ArrowDown');await key('Enter')
  await wait('document.documentElement.lang==="zh-CN"')
 })
 await audit('home');await locale('en')
 await choose('image-input',[resolve('.tools/mp4-product/fixtures/small.gif')]);await paused()
 await b.clickLabel('Next Frame');await paused();await b.clickLabel('Zoom In');await sleep(150)
 await check('Viewer file/frame/zoom/decoder survive language changes',async()=>{
  await ev('void(window.savedCanvas=document.querySelector("canvas"))')
  const before=await ev('({frame:document.querySelector("[data-testid=current-frame]").textContent.match(/\\d+/g),zoom:document.querySelector("[data-testid=zoom-percent]").textContent,workers:__creationProbe.workersCreated,name:document.querySelector(".viewer h1").title})')
  await locale('zh-CN');await locale('en')
  const after=await ev('({frame:document.querySelector("[data-testid=current-frame]").textContent.match(/\\d+/g),zoom:document.querySelector("[data-testid=zoom-percent]").textContent,workers:__creationProbe.workersCreated,name:document.querySelector(".viewer h1").title})')
  assert.deepEqual(after,before);assert.equal(await ev('savedCanvas===document.querySelector("canvas")'),true);await ev('delete window.savedCanvas')
 })
 await check('Playing Viewer and fullscreen/menu controls survive localization',async()=>{
  await b.clickLabel('Play');await wait('document.querySelector("[data-testid=playback-state]").dataset.state==="playing"');const workers=await ev('__creationProbe.workersCreated')
  await locale('zh-CN');assert.equal(await ev('document.querySelector("[data-testid=playback-state]").dataset.state'),'playing');assert.equal(await ev('__creationProbe.workersCreated'),workers);await b.clickLabel('\u6682\u505c');await paused();await locale('en')
  const button=await ev('(()=>{const b=document.querySelector("[aria-label=Fullscreen]");if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  if(button){await send('Input.dispatchMouseEvent',{type:'mousePressed',...button,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...button,button:'left',clickCount:1});await wait('!!document.fullscreenElement');await locale('zh-CN');assert.equal(await ev('document.fullscreenElement.querySelector("[data-testid=locale-switcher]").value'),'zh-CN');await ev('document.exitFullscreen()');await wait('!document.fullscreenElement');await locale('en')}
  await b.clickLabel('More');await locale('zh-CN');assert.equal(await ev('!!document.querySelector(".viewer-more-popover")'),true);await locale('en');await b.clickLabel('More')
 })
 await audit('viewer');await locale('en');await b.clickLabel('Close');await wait('!!document.querySelector(".home")')
 await click('create-gif-entry');await wait('!!document.querySelector("[data-testid=creation-input]")');await choose('creation-input',[fixtures.groups['small-200'].files[0]]);await wait('!!document.querySelector("[data-testid=creation-minimum-sources]")')
 await audit('creator-one-image');await locale('en');await ev('document.querySelector(".creator-more").open=true');await click('creation-clear');await choose('creation-input',fixtures.groups['large-10'].files);await wait('!document.querySelector("[data-testid=creation-input]").disabled')
 await edit('creation-duration',250);await ev('document.getElementById("creation-loop-forever").click()');await edit('creation-play-count',3)
 const creationBefore=await ev('({names:[...document.querySelectorAll(".creator-filename")].map(e=>e.title),duration:document.getElementById("creation-duration").value,plays:document.getElementById("creation-play-count").value})')
 await check('Creator active job changes language without restart/cancel',async()=>{
  await click('creation-generate');const before=await debug('creation-debug');assert.ok(['preparing','encoding','finalizing'].includes(before.status))
  await locale('zh-CN');const after=await debug('creation-debug');assert.equal(after.diagnostics.generations,before.diagnostics.generations);assert.equal(after.diagnostics.cancellations,0)
  report.activeJobs.push({flow:'creator',before:before.status,after:after.status,generations:after.diagnostics.generations})
  await wait('!!document.querySelector("[data-testid=creation-result]")')
  const current=await ev('({names:[...document.querySelectorAll(".creator-filename")].map(e=>e.title),duration:document.getElementById("creation-duration").value,plays:document.getElementById("creation-play-count").value})');assert.deepEqual(current,creationBefore)
 })
 await audit('creator-result','creation-result');await preview('creator','creation-preview','creation-download');await click('creation-back');await wait('!!document.querySelector(".home")')
 await locale('en');await choose('image-input',[resolve('.tools/mp4-product/fixtures/small.gif')]);await paused();await b.clickLabel('More');await b.clickLabel('Convert animation');await wait('!!document.querySelector("[data-testid=conversion-start]")&&!document.querySelector("[data-testid=conversion-start]").disabled')
 await audit('animation-convert');await locale('en');await click('conversion-start');await wait('!!document.querySelector("[data-testid=conversion-result]")');const animationResult=await ev('document.querySelector("[data-testid=conversion-download]").href')
 await locale('zh-CN');assert.equal(await ev('document.querySelector("[data-testid=conversion-download]").href'),animationResult)
 await preview('animation','conversion-preview','conversion-download');await b.click('input[value=mp4]');await click('conversion-start');await wait('document.querySelector("[data-testid=conversion-result]")?.textContent.includes("MP4")')
 await audit('mp4-result','conversion-result');await preview('mp4','conversion-preview','conversion-download',true)
 await click('conversion-back');await paused();await b.clickLabel(await ev('document.documentElement.lang')==='en'?'Close':'关闭');await wait('!!document.querySelector(".home")')
 await click('convert-video-entry');await wait('!!document.querySelector("[data-testid=video-input]")');await choose('video-input',[resolve('.tools/video-source/fixtures/benchmark.mp4')]);await wait('!!document.querySelector("[data-testid=video-estimate]")')
 await edit('video-start-time',.4);await edit('video-end-time',2.4);await edit('video-target','apng');await edit('video-fps',20);await edit('video-size',360)
 const settings=()=>ev('({values:[...document.querySelectorAll("fieldset input,fieldset select")].map(e=>e.value),url:document.querySelector("[data-testid=video-source-preview]").src,job:JSON.parse(document.querySelector("[data-testid=video-conversion-debug]").textContent).jobId})')
 await check('Video source and nondefault trim/target/FPS/size survive language switches',async()=>{const before=await settings();await locale('en');await locale('zh-CN');assert.deepEqual(await settings(),before)})
 await edit('video-end-time',.2)
 await check('Existing trim error updates language without changing its ARIA ID',async()=>{
  const id=await ev('document.querySelector("[data-error-location=trim]").id');await locale('en');assert.equal(await ev('document.querySelector("[data-error-location=trim]").id'),id)
  await locale('zh-CN');assert.equal(await ev('document.querySelector("[data-testid=video-end-time]").getAttribute("aria-describedby")'),id)
 })
 await audit('video-trim-error','video-start-time');await edit('video-end-time',2.4);await audit('video-convert')
 await check('Video conversion job ID and start count survive an active locale switch',async()=>{
  await locale('en');await click('video-convert');const before=await debug('video-conversion-debug');assert.ok(['converting','verifying'].includes(before.status))
  await locale('zh-CN');const after=await debug('video-conversion-debug');assert.equal(after.jobId,before.jobId);assert.equal(after.videoAnimationJobsStarted,1);assert.equal(after.videoAnimationCancellations,0)
  report.activeJobs.push({flow:'video',before:before.status,after:after.status,jobId:after.jobId})
  await wait('!!document.querySelector("[data-testid=video-conversion-result]")')
 })
 await audit('video-result','video-conversion-result');await preview('video','video-result-preview','video-result-download');await click('video-conversion-back');await wait('!!document.querySelector(".home")')
 await choose('archive-input',[resolve('tests/fixtures/validation/zip/encrypted-mixed.zip')]);await paused();await locale('en');await b.clickLabel('Next File');await wait('document.querySelector("[data-testid=playback-state]")?.dataset.state==="error"');await audit('zip-error');await locale('en');await b.clickLabel('Next File');await b.clickLabel('Next File');await paused();await b.clickLabel('Close archive');await wait('!!document.querySelector(".home")')
 await check('Blocked localStorage still allows in-memory language changes',async()=>{await boot('en-US',null,true);await locale('zh-CN');assert.equal(await ev('document.documentElement.lang'),'zh-CN')})
 await check('Ordinary page contains no diagnostic UI; only locale is stored',async()=>{await b.navigate(base);await wait('!!document.querySelector(".home")');assert.equal(await ev('!!document.querySelector("[data-testid=diagnostics-panel]")'),false);assert.deepEqual(await ev('Object.keys(localStorage)'),['aniview.locale'])})
 const detached=m=>{try{const e=JSON.parse(m);return e.code===-32001&&e.message==='Session with given id not found.'}catch{return false}}
 report.protocolNotices=b.errors.filter(detached);report.errors=b.errors.filter(e=>!detached(e));assert.deepEqual(report.errors,[])
 report.status='PASS'
}catch(e){report.status='FAIL';report.error=e.stack;console.error(e);if(b){const image=await b.send('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(image)await writeFile(join(out,'failure.png'),Buffer.from(image.data,'base64'))}process.exitCode=1}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await b?.close();server.kill()}
