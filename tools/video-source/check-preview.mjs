import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {launchBrowser} from '../conversion/browser.mjs'
const url=process.argv[2]??'http://127.0.0.1:4230/AniView/experiments/video-source/?debug=1'
const output=resolve('.tools/video-source/preview-check')
await mkdir(output,{recursive:true})
const browser=await launchBrowser(output)
try{
 await browser.navigate(url);await browser.waitFor('!!window.__videoSourceHarness',60000)
 const report={url,scope:'Desktop HTTPS/asset preflight; not Android acceptance',
   environment:await browser.evaluate('document.querySelector("#environment").textContent'),
   secureContext:await browser.evaluate('isSecureContext'),cases:[],layouts:[],errors:[]}
 assert.equal(report.secureContext,true);assert(report.environment.includes('HMR: false'))
 for(const [name,target]of[['cfr.mp4','apng'],['vp9.webm','webp']]){
  const row=await browser.evaluate('window.__videoSourceHarness.runCase('+JSON.stringify(name)+','+JSON.stringify(target)+')')
  assert.equal(row.status,'PASS');assert.equal(row.inspection.secureContext,true)
  report.cases.push({name,target,status:row.status,capability:row.videoSource.capability})
 }
 for(const width of[320,390,1280]){
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500})
  const layout=await browser.evaluate('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1})')
  assert.equal(layout.overflow,false);report.layouts.push(layout)
 }
 await browser.evaluate('window.__videoSourceHarness.clear()')
 report.summary=await browser.evaluate('window.__videoSourceHarness.summary()')
 assert.equal(report.summary.resources.activeWorkers,0);assert.equal(report.summary.activeObjectUrls,0)
 report.errors=browser.errors;assert.deepEqual(report.errors,[])
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify({status:'PASS',url,environment:report.environment,layouts:report.layouts,cases:report.cases,resources:report.summary.resources}))
}finally{await browser.close()}
