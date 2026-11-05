// Local-only fault injection: real HTTP + installed browser + real WASM factory.
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { launchBrowser } from '../../tools/creation/browser.mjs'
const root=resolve('spikes/rar-7z'),fixtures=resolve('.tools/m10c2/fixtures')
let mode='http-error'
const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/AniView\//,'')||'index.html'
    if(path.endsWith('bounded-sevenzip.wasm')&&mode!=='valid'){
      res.writeHead(mode==='http-error'?503:200,{'Content-Type':'application/wasm'});res.end(new Uint8Array([1,2,3,4]));return
    }
    const base=path.startsWith('fixtures/')?fixtures:root,file=resolve(base,path.startsWith('fixtures/')?path.slice(9):path)
    if(!file.startsWith(base+sep))throw Error('outside')
    res.writeHead(200,{'Content-Type':({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.html':'text/html','.json':'application/json'})[extname(file)]??'application/octet-stream'})
    res.end(await readFile(file))
  }catch{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const b=await launchBrowser(resolve('.tools/m10c2/browser-init-fault'))
try{
  await b.navigate(`http://127.0.0.1:${server.address().port}/AniView/`);await b.waitFor('!!globalThis.spike')
  const rows=[]
  for(const value of ['http-error','invalid-wasm','valid']){
    mode=value
    const result=await b.evaluate(`spike.withBackend(async b=>{const t=performance.now();try{const open=await b.open(await spike.load('normal.7z'));return{ok:true,count:open.count,ms:performance.now()-t,trace:b.getTrace()}}catch(e){return{ok:false,code:e.code,ms:performance.now()-t,trace:b.getTrace()}}})`,30000)
    const expected=value==='http-error'?'ARCHIVE_BACKEND_ASSET_FAILED':value==='invalid-wasm'?'ARCHIVE_WASM_INITIALIZATION_FAILED':null
    if(expected?result.code!==expected:!result.ok)throw Error('Fault injection result mismatch')
    if(result.ms>=15000)throw Error('Fault became deadline timeout')
    rows.push({mode:value,...result})
  }
  const report={rows,summary:await b.evaluate('spike.summary()')};await writeFile('.tools/m10c2/init-fault-results.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({rows:rows.map(({mode,ok,code,ms})=>({mode,ok,code,ms})),summary:report.summary}))
}finally{await b.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
