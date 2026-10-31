// Isolated desktop controls. Never mutates the frozen phone build or codec policy.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
import {launchBrowser} from '../conversion/browser.mjs'
const root=resolve('.tools/video-followup-site'),out=resolve('.tools/video/finalize-followup'),base='/AniView/followup/'
const allowed=new Set((await readdir(root,{recursive:true})).filter(p=>!p.includes('..')).map(p=>p.replaceAll('\\','/')))
let fault='none'
const server=createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost'),suffix=u.pathname.slice(base.length)
    if(req.method!=='GET'||!u.pathname.startsWith(base)||!allowed.has(suffix)||(await stat(resolve(root,suffix))).isDirectory()){res.writeHead(404);res.end();return}
    const fail=fault==='fixture'&&/\/fixture\.worker-/.test(u.pathname)||fault==='held'&&/\/held-encoder\.worker-/.test(u.pathname)
    if(fail){res.writeHead(408);res.end('Intentional local test fault');return}
    const mime={'.js':'text/javascript','.html':'text/html','.wasm':'application/wasm','.txt':'text/plain'}
    const bytes=await readFile(resolve(root,suffix));res.writeHead(200,{'Content-Type':mime[extname(suffix)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes)
  }catch{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));await mkdir(out,{recursive:true})
const port=server.address().port,report={scope:'Installed desktop Edge / controlled faults; not Android root-cause evidence',cases:[]}
let browser
try{
  browser=await launchBrowser(out)
  await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const DiagnosticNativeWorker=window.Worker,diagnosticNativeTimeout=window.setTimeout;
    window.Worker=class extends DiagnosticNativeWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(window.__holdFinalizingMarker&&e.data?.type==='finalize-held')e.stopImmediatePropagation()})}};
    window.setTimeout=function(fn,ms,...args){return diagnosticNativeTimeout(fn,window.__holdFinalizingMarker&&ms===120000?1000:ms,...args)};
  `})
  await browser.navigate('http://127.0.0.1:'+port+base+'experiments/video/index.html?debug=1');await browser.waitFor('!!window.__videoHarness')
  for(const large of [false,true]){
    const count=await browser.evaluate('window.__videoHarness.results.length');await browser.evaluate(`window.__videoHarness.runSet(${large})`)
    const rows=await browser.evaluate(`window.__videoHarness.results.slice(${count})`)
    assert.equal(rows.length,3);assert(rows.every(row=>row.status==='PASS'));assert.deepEqual(rows.map(row=>row.options.source),['gif','apng','webp'])
    report.cases.push({mode:large?'medium-three-formats':'small-three-formats',rows});console.log((large?'medium':'small')+' three formats PASS')
  }
  for(const mode of ['fixture','held','none','none','none','lost-marker']){
    fault=mode;const count=await browser.evaluate('window.__videoHarness.results.length')
    await browser.evaluate(`window.__holdFinalizingMarker=${mode==='lost-marker'};document.querySelector('#finalize-test').click()`)
    const good=mode==='none';await browser.waitFor(`window.__videoHarness.results.length>=${count+(good?2:1)}`)
    const rows=await browser.evaluate(`window.__videoHarness.results.slice(${count})`),first=rows[0]
    if(good){assert.equal(first.status,'CANCELLED');assert.equal(first.investigation.phase,'held-finalizing');assert.equal(first.investigation.finalizePhase,'mux-finalizing');assert.equal(first.investigation.acceptedFrames,20);assert.equal(first.finalizeHeld,true);assert.equal(rows[1].status,'PASS')}
    else{
      assert.equal(first.error,'WORKER_FAILED');assert.equal(first.status,'FAIL')
      const e=first.investigation.worker
      if(mode==='lost-marker'){assert.equal(e.trigger,'request-timeout');assert.equal(e.moduleBooted,true);assert.equal(e.operation,'finish');assert.equal(first.investigation.acceptedFrames,20);assert.equal(first.investigation.finalizePhase,'mux-finalizing')}
      else{assert.equal(e.trigger,'error-event');assert.equal(e.moduleBooted,false);assert.equal(e.role,mode==='fixture'?'fixture':'held-encoder')}
    }
    assert.equal(first.resources.activeWorkers,0);assert.equal(first.resources.cleanupErrors,0)
    report.cases.push({mode,timerAccelerated:mode==='lost-marker',rows});console.log(JSON.stringify({mode,status:first.status,evidence:first.investigation}))
  }
  await browser.evaluate('window.__holdFinalizingMarker=false;window.__videoHarness.clear()')
  report.final=await browser.evaluate('JSON.parse(document.querySelector("#failures").textContent)')
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
