// Real product UI over trusted HTTPS; no certificate bypass or selected-media upload.
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {launchBrowser} from '../creation/browser.mjs'
const url=process.argv[2];assert(url?.startsWith('https://'))
const output=resolve('.tools/mp4-product/https-check');await mkdir(output,{recursive:true})
const browser=await launchBrowser(output)
try{
  await browser.navigate(url)
  await browser.waitFor('!!document.querySelector("input[type=file]") || (document.title==="Tunnel website ahead!" && !!document.querySelector("button[type=submit]"))')
  const gateway=await browser.evaluate('document.title==="Tunnel website ahead!"')
  if(gateway){
    browser.errors.length=0
    await browser.evaluate(`(()=>{const ip=document.body.innerText.match(/This tunnel is hosted by:\\s*([0-9.]+)/)?.[1];if(!ip)throw Error('Gateway host unavailable');const input=document.querySelector('input');input.value=ip;input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('button[type=submit]').click()})()`)
  }
  await browser.waitFor('!!document.querySelector("input[type=file]")')
  assert.equal(await browser.evaluate('isSecureContext'),true)
  assert(!browser.assets.some(a=>a.url.includes('/@vite/client')))
  await browser.inputFiles('input[type=file][accept="image/*"]',[resolve('.tools/mp4-product/fixtures/small.png')])
  await browser.waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  await browser.clickLabel('More');await browser.clickLabel('Convert animation')
  await browser.waitFor("document.querySelector('[data-testid=conversion-start]')?.disabled===false")
  await browser.click('input[value=mp4]');await browser.click('[data-testid=conversion-start]')
  await browser.waitFor("['success','error'].includes(JSON.parse(document.querySelector('[data-testid=conversion-debug]').textContent).status)",120000)
  const diagnostics=await browser.evaluate("JSON.parse(document.querySelector('[data-testid=conversion-debug]').textContent)")
  assert.equal(diagnostics.status,'success',JSON.stringify(diagnostics))
  await browser.click('[data-testid=conversion-preview]');await browser.waitFor("document.querySelector('video')?.readyState>=1")
  const played=await browser.send('Runtime.evaluate',{expression:"(async()=>{const v=document.querySelector('video');await v.play();await new Promise(r=>setTimeout(r,150));v.pause();return {time:v.currentTime,width:v.videoWidth,height:v.videoHeight,error:v.error?.code??null}})()",userGesture:true,awaitPromise:true,returnByValue:true})
  assert(!played.exceptionDetails);assert(played.result.value.time>0);assert.equal(played.result.value.error,null)
  await browser.click('[data-testid=video-preview-back]');await browser.click('[data-testid=conversion-back]')
  await browser.waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'");await browser.clickLabel('Close')
  await browser.waitFor("JSON.parse(document.querySelector('[data-testid=runtime-metrics]').textContent).activeWorkers===0")
  const cleanup=await browser.evaluate("JSON.parse(document.querySelector('[data-testid=runtime-metrics]').textContent)")
  assert.equal(cleanup.lastConversionCleanup.activeObjectUrls,0)
  const report={scope:'Installed desktop Edge over temporary HTTPS; not Android',url,certificateChecksEnabled:true,hmr:false,gatewayCompleted:gateway,diagnostics,playback:played.result.value,cleanup,errors:browser.errors.filter(e=>!e.includes('Cannot find default execution context'))}
  assert.deepEqual(report.errors,[]);await writeFile(resolve('.tools/mp4-product/https-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{await browser.close()}
