// Actual desktop HTTPS product smoke; not Android acceptance.
import assert from 'node:assert/strict'
import {resolve} from 'node:path'
import {mkdir,writeFile} from 'node:fs/promises'
import {launchBrowser} from '../creation/browser.mjs'
const output=resolve('.tools/video-conversion-product/https-check')
await mkdir(output,{recursive:true})
const browser=await launchBrowser(output)
const url=process.argv[2]??'http://127.0.0.1:4240/AniView/?debug=1'
const test=name=>'[data-testid="'+name+'"]'
try{
 await browser.navigate(url);await browser.waitFor(`!!document.querySelector('${test('convert-video-entry')}')`,60000)
 assert.equal(await browser.evaluate('isSecureContext'),true)
 assert.equal(await browser.evaluate('Array.from(document.scripts).some(s=>s.src.includes("/@vite/client"))'),false)
 const candidate=await browser.evaluate('(async()=>await(await fetch(new URL("release-candidate.json",location.href))).json())()')
 await browser.click(test('convert-video-entry'));await browser.waitFor(`!!document.querySelector('${test('video-input')}')`)
 await browser.inputFiles(test('video-input'),[resolve('.tools/video-source/fixtures/cfr.mp4')])
 await browser.waitFor(`['ready','error'].includes(JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent).status)`,120000)
 assert.equal(await browser.evaluate(`JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent).status`),'ready')
 await browser.evaluate(`(()=>{const e=document.querySelector('${test('video-target')}');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'apng');e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await browser.click(test('video-convert'));await browser.waitFor(`['success','error'].includes(JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent).status)`,120000)
 const diagnostics=await browser.evaluate(`JSON.parse(document.querySelector('${test('video-conversion-debug')}').textContent)`)
 assert.equal(diagnostics.status,'success');assert.equal(diagnostics.sampledFrames,diagnostics.plan.frameCount)
 await browser.evaluate(`(async()=>{const v=document.querySelector('${test('video-source-preview')}');await v.play();v.pause();v.currentTime=.2;v.dispatchEvent(new Event('timeupdate'))})()`)
 await browser.click(test('video-result-preview'));await browser.waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
 await browser.clickLabel('Play');await browser.clickLabel('Pause');await browser.clickLabel('Close');await browser.waitFor(`!!document.querySelector('${test('video-result-download')}')`)
 const layouts=[]
 for(const width of[320,390,1280]){await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500})
  const layout=await browser.evaluate('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1})');assert.equal(layout.overflow,false);layouts.push(layout)}
 await browser.click(test('video-conversion-back'));await browser.waitFor(`!!document.querySelector('${test('convert-video-entry')}')`)
 const cleanup=await browser.evaluate("JSON.parse(document.querySelector('[data-testid=runtime-metrics]').textContent)")
 assert.equal(cleanup.activeWorkers,0);assert.equal(cleanup.lastVideoAnimationCleanup.activeObjectUrls,0);assert.deepEqual(browser.errors,[])
 const report={scope:'Desktop secure-context product check; not Android',url,candidate,secureContext:true,hmr:false,diagnostics,layouts,cleanup,errors:browser.errors}
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'PASS',url,candidate,layouts,activeWorkers:cleanup.activeWorkers,activeObjectUrls:cleanup.lastVideoAnimationCleanup.activeObjectUrls}))
}finally{await browser.close()}
