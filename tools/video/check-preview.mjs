// HTTPS certificate validation remains enabled. No bypass flags or media upload.
import assert from 'node:assert/strict'
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {launchBrowser,sleep} from '../conversion/browser.mjs'
const url=process.argv[2];assert(url?.startsWith('https://'),'Use a trusted HTTPS preview URL')
await mkdir('.tools/video/https-check',{recursive:true})
let html=''
for(let attempt=0;attempt<8;attempt++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(r.ok){html=await r.text();if(html.includes('8C1 Animation'))break}}catch{/* Temporary tunnel may take time to attach. */}
  await sleep(500)
}
assert(html.includes('8C1 Animation'),'Engineering HTML unavailable through temporary tunnel');assert(!html.includes('/@vite/client'))
const browser=await launchBrowser(resolve('.tools/video/https-check'))
try{
  await browser.navigate(url);await browser.waitFor('!!window.__videoHarness || (document.title==="Tunnel website ahead!" && !!document.querySelector("input") && !!document.querySelector("button"))')
  const gateway=await browser.evaluate('document.title==="Tunnel website ahead!"')
  const gatewayErrors=gateway?[...browser.errors]:[]
  if(gateway){
    browser.errors.length=0
    // Complete the provider's documented visitor form, not a TLS bypass.
    await browser.evaluate('(()=>{const text=document.body.innerText,ip=text.match(/This tunnel is hosted by:\\s*([0-9.]+)/)?.[1];if(!ip)throw Error("Gateway host unavailable");const input=document.querySelector("input");input.value=ip;input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("button[type=submit]").click()})()')
  }
  await browser.waitFor('!!window.__videoHarness')
  assert.equal(await browser.evaluate('isSecureContext'),true)
  const row=await browser.evaluate("window.__videoHarness.runCase({source:'apng',width:320,height:240,count:3,softEdges:true})")
  assert.equal(row.status,'PASS')
  const playback=await browser.evaluate("(async()=>{const v=document.querySelector('video');await v.play();await new Promise(r=>setTimeout(r,200));v.pause();return{time:v.currentTime,width:v.videoWidth,height:v.videoHeight,error:v.error?.code??null}})()")
  assert(playback.time>0);assert.equal(playback.error,null)
  await browser.evaluate('window.__videoHarness.clear()')
  const report={url,scope:'Installed desktop Edge over public temporary HTTPS, not Android',certificateChecksEnabled:true,hmr:false,
    summary:await browser.evaluate('JSON.parse(document.querySelector("#summary").textContent)'),playback,gatewayCompleted:gateway,gatewayErrors,
    errors:browser.errors.filter(e=>!e.includes('Cannot find default execution context'))}
  assert.deepEqual(report.errors,[])
  await writeFile('.tools/video/https-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{await browser.close()}
