// Local production build + original acceptance sources. No uploads and no HMR.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, relative, extname, sep } from 'node:path'
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const host=option('--host','127.0.0.1'),port=Number(option('--port','4216')),base='/AniView/'
const root=resolve('dist'),samples=resolve('.tools/conversion-product')
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.json':'application/json','.txt':'text/plain','.zip':'application/zip','.gif':'image/gif','.webp':'image/webp','.png':'image/png'}
await stat(resolve(root,'index.html'))
const server=createServer(async(req,res)=>{try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return}
  if(!path.startsWith(base)){res.writeHead(404);res.end();return}
  const sample=path.startsWith(base+'validation/conversion/'),directory=sample?samples:root
  const suffix=sample?path.slice((base+'validation/conversion/').length):path.slice(base.length)||'index.html'
  if(sample&&!['small.zip','medium.zip','manifest.json'].includes(suffix))throw Error('Not a sample')
  const file=resolve(directory,suffix),from=relative(directory,file)
  if(from==='..'||from.startsWith('..'+sep)||from.includes(':'))throw Error('Unsafe path')
  const info=await stat(file);if(!info.isFile())throw Error('Not a file')
  res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store',
    ...(extname(file)==='.zip'?{'Content-Disposition':`attachment; filename="${suffix}"`}:{})})
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}catch{res.writeHead(404);res.end('Not found')}})
server.listen(port,host,()=>console.log(JSON.stringify({preview:`http://${host}:${port}${base}`,hmr:false,publicDeployment:false})))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
