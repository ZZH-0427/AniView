// Real desktop decode with a test-only native display-metadata fault injection.
// No browser/library patch is shipped in the candidate.
import assert from 'node:assert/strict'
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {launchBrowser} from '../conversion/browser.mjs'
const output=resolve('.tools/video-source/par-compat-browser')
await mkdir(output,{recursive:true})
const browser=await launchBrowser(output)
try{
 const bootstrap=String.raw`
 const NativeDecoder=self.VideoDecoder;
 self.VideoDecoder=class extends NativeDecoder{
  constructor(init){super({...init,output(frame){
   const rect=frame.visibleRect;
   const copy=new VideoFrame(frame,{displayWidth:rect.width,displayHeight:rect.height});
   frame.close();init.output(copy);
  }})}
 };
 `
 await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`
  const ParentWorker=window.Worker;
  window.Worker=class extends ParentWorker{
   constructor(url,options){
    const sourceUrl=String(url);
    if(sourceUrl.includes('source.worker-')){
     const queue='const early=[];const hold=e=>{early.push(e.data);e.stopImmediatePropagation()};self.addEventListener("message",hold);';
     const drain='self.removeEventListener("message",hold);for(const data of early)self.dispatchEvent(new MessageEvent("message",{data}));';
     const script=queue+${JSON.stringify(bootstrap+'\n')}+'await import('+JSON.stringify(sourceUrl)+');'+drain;
     const wrapped=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
     super(wrapped,{...options,type:'module'});this.probeUrl=wrapped;
    }else super(url,options);
   }
   terminate(){if(this.probeUrl){URL.revokeObjectURL(this.probeUrl);this.probeUrl=undefined}return super.terminate()}
  };
 `})
 await browser.navigate(process.argv[2]??'http://127.0.0.1:4232/AniView/experiments/video-source/?debug=1')
 await browser.waitFor('!!window.__videoSourceHarness')
 const cases=[]
 for(const target of ['gif','webp','apng']){
  const row=await browser.evaluate('window.__videoSourceHarness.runCase("par.mp4",'+JSON.stringify(target)+')')
  assert.equal(row.status,'PASS',JSON.stringify(row));assert(row.videoSource.trackParFallbackSamples>0,'fault injection must reach fallback')
  assert.equal(row.plan.width,128);assert.equal(row.plan.height,48)
  assert.equal(row.videoSource.activeSamples,0);assert.equal(row.videoSource.cleanupErrors,0)
  cases.push(row)
 }
 await browser.evaluate('window.__videoSourceHarness.clear()')
 const summary=await browser.evaluate('window.__videoSourceHarness.summary()')
 assert.equal(summary.resources.activeWorkers,0);assert.equal(summary.activeObjectUrls,0)
 assert.equal(summary.peakCanonicalRgba,1);assert.deepEqual(browser.errors,[])
 await writeFile(resolve(output,'report.json'),JSON.stringify({scope:'Desktop real decode plus test-only PAR metadata omission; not Android',cases,summary},null,2))
 console.log(JSON.stringify({status:'PASS',build:summary.build,targets:cases.map(r=>r.target),fallbackSamples:summary.trackParFallbackSamples,
  allOutputOraclesMatched:true,resources:summary.resources}))
}finally{await browser.close()}
