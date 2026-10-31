// Isolated product preview; no uploads, HMR, or Pages deployment.
import {createServer} from 'node:http'
import {createReadStream} from 'node:fs'
import {stat,readdir} from 'node:fs/promises'
import {resolve,relative,sep,extname} from 'node:path'
const arg=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback
const root=resolve('dist'),fixtures=resolve('.tools/mp4-product/fixtures'),workers=resolve('.tools/mp4-product-workers/assets'),base='/AniView/'
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.txt':'text/plain','.json':'application/json','.zip':'application/zip','.gif':'image/gif','.png':'image/png','.webp':'image/webp'}
const sampleNames=new Set(['small.zip','medium.zip','odd.zip','manifest.json'])
const workerNames=new Set(process.argv.includes('--test-workers')?(await readdir(workers)).filter(n=>n.startsWith('held-encoder.worker-')):[])
const server=createServer(async(req,res)=>{try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return}if(!path.startsWith(base))throw Error()
  const sample=path.startsWith(base+'validation/mp4/'),test=path.startsWith(base+'validation/mp4-worker/'),directory=sample?fixtures:test?workers:root
  const suffix=sample?path.slice((base+'validation/mp4/').length):test?path.slice((base+'validation/mp4-worker/').length):path.slice(base.length)||'index.html'
  if(sample&&!sampleNames.has(suffix)||test&&!workerNames.has(suffix))throw Error()
  const file=resolve(directory,suffix),from=relative(directory,file)
  if(from==='..'||from.startsWith('..'+sep)||from.includes(':')||!(await stat(file)).isFile())throw Error()
  res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store',
    ...(extname(file)==='.zip'?{'Content-Disposition':`attachment; filename="${suffix}"`}:{})})
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}catch{res.writeHead(404);res.end('Not found')}})
await stat(resolve(root,'index.html'))
server.listen(Number(arg('--port','4224')),arg('--host','127.0.0.1'),()=>console.log(JSON.stringify({productionPreview:true,hmr:false,pages:false,testWorkers:workerNames.size})))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0))})
