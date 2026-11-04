// Installed Edge, actual production UI and synthetic fixtures only. No private passwords/media.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {launchBrowser,sleep} from '../creation/browser.mjs'
const output=resolve('.tools/m10b2'),base=process.env.ANIVIEW_PASSWORD_URL??'http://127.0.0.1:4280/AniView/',q=id=>`[data-testid="${id}"]`
const report={checks:[],requests:[],console:[],layouts:[],fixtures:[]},check=(name,data)=>{report.checks.push({name,...(data?{data}:{})});console.log(name)}
await mkdir(output,{recursive:true})
const b=await launchBrowser(join(output,'browser'),{onEvent(e){
 if(e.method==='Network.requestWillBeSent'){const r=e.params.request;report.requests.push({method:r.method,url:r.url.startsWith('blob:')?'blob:local':r.url.startsWith('data:')?'data:embedded':r.url})}
 if(e.method==='Runtime.consoleAPICalled'&&e.params.type!=='debug')report.console.push(e.params.args.map(a=>a.value??a.description).join(' '))
}})
const {evaluate:ev,waitFor:rawWait,click,inputFiles,send}=b,wait=expression=>rawWait(expression,60000),label=b.clickLabel
const ready=()=>wait(`['ready','paused','playing','ended'].includes(document.querySelector('${q('playback-state')}')?.dataset.state)`)
const prompt=()=>wait(`!!document.querySelector('${q('archive-password-prompt')}')&&!document.querySelector('${q('archive-password-input')}').disabled`)
const input=value=>ev(`(()=>{const e=document.querySelector('${q('archive-password-input')}');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
const locale=async value=>{await ev(`(()=>{const e=document.querySelector('[data-testid=locale-switcher]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.documentElement.lang===${JSON.stringify(value)}`)}
const key=async(key,code,n)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:n,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n})}
const unlock=async(password='aniview-test')=>{await input(password);await click(q('archive-password-unlock'))}
const open=async name=>{await inputFiles(q('archive-input'),[resolve('tests/fixtures/zip/'+name)])}
const json=id=>ev(`JSON.parse(document.querySelector('${q(id)}').textContent)`)
const home=async()=>{await label('Close archive');await wait('!!document.querySelector(".home")&&window.__creationProbe.activeWorkers===0');const r=await json('runtime-metrics');for(const k of ['activeWorkers','activeBitmaps','activeArchiveSessions','cleanupErrors'])assert.equal(r[k],0,k);if(r.lastArchiveCleanup)for(const [k,v]of Object.entries(r.lastArchiveCleanup))assert.equal(v,0,k);return r}
const position=n=>wait(`document.querySelector('${q('session-position')}')?.textContent==='${n} / 5'`)
try{
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__passwordProbe={attempts:[],workers:[],held:0};const Base=Worker;window.Worker=class extends Base{constructor(...args){super(...args);this.__url=String(args[0]);this.__dead=false;window.__passwordProbe.workers.push(this.__url);if(this.__url.includes('archive.worker-'))this.addEventListener('message',e=>{if(window.__holdPasswordResult&&e.data.type==='extracted'&&!e.__replayed){e.stopImmediatePropagation();window.__passwordProbe.held++;const data=e.data;setTimeout(()=>{if(!this.__dead){const event=new MessageEvent('message',{data});event.__replayed=true;this.dispatchEvent(event)}},400)}})}postMessage(m,...args){if(m.type==='extract'&&this.__url.includes('archive.worker-'))window.__passwordProbe.attempts.push({entryId:m.entryId,hasCredential:m.password!==undefined});return super.postMessage(m,...args)}terminate(){this.__dead=true;return super.terminate()}};`})
 await b.navigate(base);await wait('!!document.querySelector(".home")');report.homeAssets=[...b.assets]
 assert(!b.assets.some(a=>/archive.worker|ArchiveEntryAccess/.test(a.url)));assert.equal(await ev('!!document.querySelector("[data-testid=runtime-metrics]")'),false)
 check('ordinary startup has no password/ZIP runtime or diagnostics')
 await b.navigate(base+'?debug=1');await wait('!!document.querySelector(".home")');await locale('en')
 await open('password-first.zip');await prompt();await wait('JSON.parse(document.querySelector("[data-testid=archive-metrics]").textContent).extractions===0')
 assert.equal(await ev('window.__creationProbe.activeWorkers'),1);assert.equal(await ev('document.activeElement===document.querySelector("[data-testid=archive-password-input]")'),true)
 assert.equal(await ev('window.__passwordProbe.attempts.length'),0)
 for(const width of [1280,768,390,360]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});await locale('zh-CN')
  const layout=await ev(`(()=>{const form=document.querySelector('${q('archive-password-prompt')}'),controls=[...form.querySelectorAll('button,input:not([type=checkbox]),.archive-password-show')].map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height}});return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,controls}})()`)
  assert(!layout.overflow);assert(layout.controls.every(r=>r.height>=43.9));report.layouts.push(layout)
  const screen=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,`password-${width}.png`),Buffer.from(screen.data,'base64'))
 }
 await send('Emulation.setDeviceMetricsOverride',{width:360,height:320,deviceScaleFactor:1,mobile:false})
 await ev('document.querySelector("[data-testid=archive-password-cancel]").scrollIntoView({block:"center"})')
 const shortLayout=await ev(`(()=>{const r=document.querySelector('${q('archive-password-cancel')}').getBoundingClientRect();return{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,cancelReachable:r.top>=0&&r.bottom<=innerHeight}})()`)
 assert(!shortLayout.overflow&&shortLayout.cancelReachable);report.layouts.push(shortLayout)
 await send('Emulation.clearDeviceMetricsOverride');await locale('en')
 await input('wrong');await locale('zh-CN');assert.equal(await ev('document.querySelector("[data-testid=archive-password-input]").value'),'wrong');await locale('en')
 await ev('document.querySelector("[data-testid=archive-password-input]").focus()');await key('Enter','Enter',13);await wait('!!document.querySelector("[data-testid=archive-password-error]")');assert((await ev('document.querySelector("[data-testid=archive-password-error]").textContent')).includes('not accepted'))
 await click(q('archive-password-show'));assert.equal(await ev('document.querySelector("[data-testid=archive-password-input]").type'),'text');await click(q('archive-password-show'))
 await ev('document.querySelector("[data-testid=archive-password-input]").focus()');await key('Tab','Tab',9);assert.equal(await ev('document.activeElement.dataset.testid'),'archive-password-show')
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});assert.equal(await ev('document.activeElement.dataset.testid'),'archive-password-input')
 await key('Escape','Escape',27);await wait('document.querySelector("[data-testid=archive-entry-access]")?.dataset.state==="locked"')
 assert.equal(await ev('document.activeElement.dataset.testid'),'archive-password-retry');assert.equal(await ev('document.querySelector("[data-testid=archive-status]").dataset.state'),'open')
 await click(q('archive-password-retry'));await prompt();assert.equal(await ev('document.querySelector("[data-testid=archive-password-input]").value'),'')
 await unlock();await ready();check('encrypted metadata stays lazy; input focus, Enter, Tab/Shift+Tab, Escape, Cancel/retry and live EN/ZH preserve correct state')
 await home()

 await open('password-mixed.zip');await ready();await position(1);await label('Next File');await prompt()
 await input('not-a-real-secret');await label('Next File');await ready();await position(3);await label('Previous File');await prompt()
 assert.equal(await ev('document.querySelector("[data-testid=archive-password-input]").value'),'')
 const heldBefore=await ev('window.__passwordProbe.held'),attemptBefore=await ev('window.__passwordProbe.attempts.length')
 await ev('window.__holdPasswordResult=true');await input('aniview-test');await ev('(()=>{const b=document.querySelector("[data-testid=archive-password-unlock]");b.click();b.click()})()')
 await wait(`window.__passwordProbe.held>${heldBefore}`);assert.equal(await ev('window.__passwordProbe.attempts.length'),attemptBefore+1)
 await label('Next File');await ready();await position(3);await ev('window.__holdPasswordResult=false');await label('Previous File');await prompt()
 await unlock();await ready();await position(2)
 check('prompt and in-flight entry switching invalidate old credentials/results; duplicate submit creates only one attempt')
 await label('Next File');await ready();await position(3);await label('Next File');await ready();await position(4)
 assert.equal(await ev('!!document.querySelector("[data-testid=archive-password-prompt]")'),false)
 const beforeConversion=await json('archive-metrics')
 await label('More');await label('Convert animation');await wait('!!document.querySelector("[data-testid=conversion-start]")&&!document.querySelector("[data-testid=conversion-start]").disabled')
 await click('input[value="apng"]');await click(q('conversion-start'));await wait('JSON.parse(document.querySelector("[data-testid=conversion-debug]").textContent).status==="success"')
 await click(q('conversion-preview'));await ready();await label('Close');await wait('!!document.querySelector("[data-testid=conversion-result]")');await click(q('conversion-back'));await ready();await position(4)
 assert.equal(await ev('!!document.querySelector("[data-testid=archive-password-prompt]")'),false)
 await label('Next File');await ready();await position(5);await label('Previous File');await ready();await position(4)
 check('public/encrypted GIF→PNG→WebP→APNG navigation; same-secret reuse; encrypted-source conversion Preview/Back retains the same ZIP',{beforeConversion})
 await home()

 for(const kind of ['zipcrypto','aes128','aes192','aes256'])for(const compression of ['store','deflate']){
  const name=`password-${kind}-${compression}.zip`;await open(name);await prompt();await unlock();await ready();report.fixtures.push({name,passed:true});await home()
 }
 check('eight independent 7-Zip STORE/DEFLATE fixtures across ZipCrypto/AES128/AES192/AES256 open through the actual product UI')
 await open('password-different.zip');await prompt();await unlock();await ready();await label('Next File');await prompt()
 const attempts=await ev('window.__passwordProbe.attempts.length');await sleep(250);assert.equal(await ev('window.__passwordProbe.attempts.length'),attempts)
 await unlock('beta');await ready();await label('Next File');await prompt();await unlock();await ready();await home()
 check('one recent successful value, automatic mismatch tried once, manual replacement and old-secret re-prompt without loops')

 for(const [name,selector,phrase] of [['password-corrupt-zipcrypto.zip','archive-password-error','could not be verified'],['password-corrupt-aes.zip','archive-entry-error','could not be verified']]){
  await open(name);await prompt();await unlock();await wait(`!!document.querySelector('${q(selector)}')`);assert((await ev(`document.querySelector('${q(selector)}').textContent`)).includes(phrase));const attempts=await ev('window.__passwordProbe.attempts.length');await sleep(250);assert.equal(await ev('window.__passwordProbe.attempts.length'),attempts);await home()
 }
 await open('password-unsupported.zip');await wait('!!document.querySelector("[data-testid=archive-entry-error]")');assert.equal(await ev('!!document.querySelector("[data-testid=archive-password-prompt]")'),false);await home()
 check('corruption/ambiguous integrity and unsupported encryption stay distinct, with no automatic password loop; archive remains replaceable')

 await open('password-first.zip');await prompt();await ev('window.__holdPasswordResult=true');await unlock();await wait('window.__passwordProbe.held>0');await locale('zh-CN')
 assert(await ev('!!document.querySelector("[data-testid=archive-password-busy]")'));await locale('en');await home();await ev('window.__holdPasswordResult=false')
 await open('password-first.zip');await prompt();assert.equal(await ev('document.querySelector("[data-testid=archive-password-input]").value'),'')
 await input('not-a-real-secret');await open('password-aes128-store.zip');await prompt();assert.equal(await ev('document.querySelector("[data-testid=archive-password-input]").value'),'');await label('Next File')
 await unlock();await ready();const cleanup=await home();check('close during pending verified result, locale during submit, late result suppression, fresh archive credential isolation and zero Home cleanup',{cleanup})
 await open('mixed.zip');await ready();await label('Next File');await ready();await home();check('ordinary ZIP remains usable after encrypted failures')

 report.storage=await ev('({local:Object.values(localStorage),session:Object.values(sessionStorage)})')
 const visibleRecords=JSON.stringify({requests:report.requests,console:report.console,storage:report.storage,cleanup})
 assert(!visibleRecords.includes('aniview-test'));assert(!visibleRecords.includes('not-a-real-secret'));assert(report.requests.every(r=>['GET','HEAD'].includes(r.method)))
 assert(report.requests.every(r=>r.url.startsWith(base)||['blob:local','data:embedded',new URL('/favicon.ico',base).href].includes(r.url)))
 assert.deepEqual(b.errors,[]);report.assets=b.assets;report.ownership=await ev('({created:window.__creationProbe.workersCreated,terminated:window.__creationProbe.workersTerminated,active:window.__creationProbe.activeWorkers})');assert.equal(report.ownership.created,report.ownership.terminated)
 report.browser=await b.send('Browser.getVersion');report.errors=b.errors;report.passed=true
 await writeFile(join(output,'password-browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:report.checks.length,fixtures:report.fixtures.length,ownership:report.ownership}))
}catch(e){await writeFile(join(output,'password-browser-failure.json'),JSON.stringify({checks:report.checks,error:e.stack,errors:b.errors},null,2));throw e}finally{await b.close()}
