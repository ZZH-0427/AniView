// Analyze an existing local diagnostic export; never modify/rebuild the candidate.
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
function analyze(value){
 if(!value||typeof value!=='object'||!value.summary||!Array.isArray(value.rows)||value.rows.length>1000)throw Error('UNRECOGNIZED_EXPORT')
 const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null
 const fixture=x=>typeof x==='string'&&/^[a-z0-9-]+\.(mp4|webm)$/.test(x)?x:'local-input'
 const rows=value.rows.map((row,index)=>{
  if(!row||typeof row!=='object')throw Error('INVALID_ROW')
  const m=row.videoSource??{}
  return{index:index+1,case:fixture(row.name),target:['gif','webp','apng'].includes(row.target)?row.target:null,
   status:['PASS','FAIL','CANCELLED'].includes(row.status)?row.status:null,
   wallMs:number(row.wallMs),conversionMs:number(row.totalMs),encodeMs:number(row.encodeMs),
   heartbeatCount:number(row.heartbeatCount),heartbeatMaxGapMs:number(row.heartbeatMaxGapMs),
   source:{probeMs:number(m.probeMs),sampleMs:number(m.sampleMs),drawMs:number(m.drawMs),
    readbackMs:number(m.readbackMs),phase:typeof m.phase==='string'?m.phase.slice(0,24):null}}
 })
 const gaps=rows.filter(row=>row.heartbeatMaxGapMs!==null).sort((a,b)=>b.heartbeatMaxGapMs-a.heartbeatMaxGapMs)
 return{diagnosticVersion:'heartbeat-readback-1',build:typeof value.summary.build==='string'?value.summary.build.slice(0,40):null,
  rowCount:rows.length,pass:rows.filter(r=>r.status==='PASS').length,cancelled:rows.filter(r=>r.status==='CANCELLED').length,
  largestGaps:gaps.slice(0,3),originalVisibilityEventsRecorded:false,originalLongTasksRecorded:false,
  limitation:'Original timer gaps alone cannot identify foreground blocking, browser timer throttling or a clock/scheduling anomaly.'}
}
const root=resolve('.tools/video-source-par-site/heartbeat-readback')
await mkdir(root,{recursive:true})
await writeFile(resolve(root,'worker.js'),'const analyze='+analyze.toString()+`;self.onmessage=async e=>{try{
 const file=e.data;if(!(file instanceof Blob)||file.size>8*1024*1024)throw Error('EXPORT_SIZE_LIMIT');
 self.postMessage(analyze(JSON.parse(await file.text())));
}catch(error){self.postMessage({diagnosticVersion:'heartbeat-readback-1',error:error instanceof SyntaxError?'INVALID_JSON':error.message})}};`)
await writeFile(resolve(root,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AniView local heartbeat readback</title><link rel="icon" href="data:,"><style>body{font:16px system-ui;background:#10141e;color:#e6edf8;padding:16px;max-width:900px}button,input{font:inherit;padding:12px;max-width:100%;min-height:48px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>Local diagnostic readback</h1><p>heartbeat-readback-1 · reads an existing AniView diagnostic JSON. No conversion, uploads or persistence.</p><input id="file" type="file" accept="application/json,.json"><button id="copy">Copy short JSON</button><pre id="result">Choose the previously exported diagnostic JSON.</pre><script type="module">
const result=document.querySelector('#result');let active;
window.analyzeExport=file=>new Promise(resolve=>{active?.terminate();result.textContent='Reading locally';const worker=new Worker('./worker.js',{type:'module'});active=worker;const finish=value=>{clearTimeout(timer);worker.terminate();if(active===worker)active=undefined;result.textContent=JSON.stringify(value,null,2);resolve(value)};const timer=setTimeout(()=>finish({error:'READ_TIMEOUT'}),10000);worker.onmessage=e=>finish(e.data);worker.onerror=e=>{e.preventDefault();finish({error:'READ_WORKER_FAILED'})};worker.postMessage(file)});
document.querySelector('#file').onchange=e=>{const file=e.target.files[0];if(file)void window.analyzeExport(file)};
document.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(result.textContent)}catch{result.textContent+='\\nSelect this text to copy manually.'}};
addEventListener('pagehide',()=>active?.terminate());
</script></body></html>`)
console.log(JSON.stringify({diagnostic:'heartbeat-readback-1',root,candidateUnchanged:true}))
