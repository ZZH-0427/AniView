// Fault-injected UI/controller regression, explicitly NOT native-backend acceptance.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchBrowser } from '../creation/browser.mjs'
const output = resolve('.tools/m10c3'), base = process.env.ANIVIEW_EXTENDED_URL ?? 'http://127.0.0.1:4295/AniView/'
await mkdir(output, { recursive: true })
const gif = [...await readFile('tests/fixtures/gif/previous.gif')]
const browser = await launchBrowser(resolve(output, 'controller-browser'))
const { evaluate: ev, click, inputFiles, waitFor, send } = browser
const wait = text => waitFor(text, 20000), q = id => `[data-testid="${id}"]`
const report = { scope: 'fault-injected controller only; no native acceptance', checks: [], layouts: [] }
const check = name => { report.checks.push(name); console.log(name) }
const ready = () => wait(`['ready','paused','playing','ended'].includes(document.querySelector('${q('playback-state')}')?.dataset.state)`)
const input = value => ev(`(()=>{const input=document.querySelector('${q('archive-password-input')}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
const locale = value => ev(`(()=>{const select=document.querySelector('${q('locale-switcher')}');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
const json = id => ev(`JSON.parse(document.querySelector('${q(id)}').textContent)`)
const open = async mode => {
  await ev(`window.__archiveTest.mode=${JSON.stringify(mode)}`)
  await inputFiles(q('archive-input'), [resolve('.tools/m10c3/fixtures/normal-rar4.rar')])
}
const close = async () => {
  await browser.clickLabel('Close archive')
  await wait(`!document.querySelector('${q('archive-status')}')&&JSON.parse(document.querySelector('${q('runtime-metrics')}').textContent).activeWorkers===0`)
}
try {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__archiveTest={mode:'normal',hold:false,created:0,terminated:0};
    const OriginalWorker=window.Worker;
    window.Worker=function(url,options){
      if(!/\\/worker-[^/]+\\.js/.test(String(url)))return new OriginalWorker(url,options);
      const test=window.__archiveTest,mode=test.mode;test.created++;let dead=false;
      return {onmessage:null,onerror:null,onmessageerror:null,
        terminate(){if(!dead){dead=true;test.terminated++}},
        postMessage(message){
          const reply=data=>setTimeout(()=>{if(!dead)this.onmessage?.({data:{id:message.id,generation:message.generation,...data}})},10);
          const error=code=>reply({type:'error',code});
          const metrics={wasmBytes:16777216,wasmMaximum:67108864,ranges:0,bytesRead:0,maxRead:0,outputBytes:0,mountedArchives:1,instances:1};
          if(message.type==='open'){
            if(mode==='fail'){error('ARCHIVE_BACKEND_ASSET_FAILED');return}
            if(mode==='header'&&message.password!=='fixture-only'){error(message.password?'ARCHIVE_WRONG_PASSWORD':'ARCHIVE_ENCRYPTED');return}
            const entries=[0,1].map(id=>({id,path:'image-'+id+'.gif',normalizedPath:'image-'+id+'.gif',isDirectory:false,isFile:true,size:${gif.length},packedSize:null,encrypted:mode==='header',solid:null,method:'COPY',attributes:null,dictionaryBytes:null,block:null,special:false}));
            reply({type:'ready',result:{entries,metrics}});
          }else if(message.type==='extract'){
            if(test.hold)return;
            if(mode==='header'&&message.password!=='fixture-only'){error('ARCHIVE_ENCRYPTED');return}
            reply({type:'extracted',result:{data:new Uint8Array(${JSON.stringify(gif)}).buffer,metrics}});
          }
        }};
    };
  ` })
  await browser.navigate(base + '?debug=1'); await wait('!!document.querySelector(".home")')
  await open('fail'); await wait(`document.querySelector('${q('archive-status')}')?.dataset.state==='error'`)
  await inputFiles(q('image-input'), [resolve('tests/fixtures/gif/previous.gif')]); await ready()
  await wait(`!!JSON.parse(document.querySelector('${q('runtime-metrics')}').textContent).lastExtendedArchiveCleanup`)
  assert.equal((await json('runtime-metrics')).lastExtendedArchiveCleanup.pendingAccess, 0)
  assert.equal(await ev(`!!document.querySelector('${q('archive-status')}')`), false)
  await browser.clickLabel('Close'); await wait('!!document.querySelector(".home")')
  check('retained opening failure → gallery replacement closes the prepared archive owner')

  await open('header'); await wait(`!!document.querySelector('${q('archive-password-input')}')`)
  await input('wrong'); await locale('zh-CN')
  assert.equal(await ev(`document.querySelector('${q('archive-password-input')}').value`), 'wrong')
  await locale('en'); await click(q('archive-password-unlock'))
  await wait(`!!document.querySelector('${q('archive-password-error')}')`)
  for (const width of [1280, 768, 390, 360]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 1, mobile: false })
    assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'), false)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(resolve(output, `controller-password-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 320, deviceScaleFactor: 1, mobile: false })
  await ev('document.querySelector("[data-testid=archive-password-cancel]").scrollIntoView({block:"center"})')
  assert(await ev('(()=>{const r=document.querySelector("[data-testid=archive-password-cancel]").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()'))
  await send('Emulation.clearDeviceMetricsOverride')
  await click(q('archive-password-cancel'))
  await wait(`!!document.querySelector('${q('archive-opening-retry')}')`)
  assert.equal(await ev(`!!document.querySelector('${q('archive-password-input')}')`), false)
  await click(q('archive-opening-retry')); await input('fixture-only'); await click(q('archive-password-unlock')); await ready()
  await browser.clickLabel('Next File'); await ready()
  assert.equal(await ev(`!!document.querySelector('${q('archive-password-prompt')}')`), false)
  check('header password wrong/cancel/retry, language preservation and verified body reuse')

  for (const width of [1280, 768, 390, 360]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 1, mobile: false })
    const layout = await ev('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})')
    assert.equal(layout.overflow, false); report.layouts.push(layout)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(resolve(output, `controller-viewer-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
  await send('Emulation.clearDeviceMetricsOverride'); await close()
  await ev('window.__archiveTest.hold=true'); await open('normal')
  await wait(`!!document.querySelector('${q('archive-extraction-cancel')}')`)
  await click(q('archive-extraction-cancel')); await wait(`!!document.querySelector('${q('archive-extraction-retry')}')`)
  await ev('window.__archiveTest.hold=false'); await click(q('archive-extraction-retry')); await ready()
  check('selected-entry cancellation → reopen → retry retains listing and recovers Viewer')
  await close(); report.cleanup = await json('runtime-metrics')
  for (const key of ['activeWorkers', 'activeBitmaps', 'activeArchiveSessions', 'cleanupErrors']) assert.equal(report.cleanup[key], 0)
  for (const key of ['activeExtendedArchiveWorkers', 'activeWasmInstances', 'activeArchiveSessions', 'activeExtraction', 'pendingAccess', 'currentExtractedBytes', 'activeObjectUrls', 'cleanupErrors'])
    assert.equal(report.cleanup.lastExtendedArchiveCleanup[key], 0)
  report.fake = await ev('window.__archiveTest'); assert.equal(report.fake.created, report.fake.terminated)
  assert.deepEqual(browser.errors, []); report.passed = true
  await writeFile(resolve(output, 'controller-regression.json'), JSON.stringify(report, null, 2) + '\n')
} catch (error) {
  await writeFile(resolve(output, 'controller-regression-failure.json'), JSON.stringify({ ...report, error: error.stack, browserErrors: browser.errors }, null, 2))
  throw error
} finally { await browser.close() }
