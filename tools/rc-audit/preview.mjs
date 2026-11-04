// Production files and explicit procedural samples only. No upload/API endpoints.
import {createServer} from 'node:http'
import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import {resolve,relative,extname,sep} from 'node:path'
const arg=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback
const root=resolve(arg('--root','dist')),base='/AniView/',prefix=base+'validation/rc/'
const samples=new Map([
 ['animation.gif','.tools/mp4-product/fixtures/small.gif'],['animation.webp','.tools/mp4-product/fixtures/small.webp'],
 ['animation.png','.tools/mp4-product/fixtures/small.png'],['small.mp4','.tools/video-source/fixtures/cfr.mp4'],
 ['medium.mp4','.tools/video-source/fixtures/benchmark.mp4'],['vp9.webm','.tools/video-source/fixtures/vp9.webm'],
 ['mixed.zip','.tools/conversion-product/small.zip'],['static.png','tests/fixtures/static/quadrants.png'],
 ['static.jpg','tests/fixtures/static/quadrants.jpg'],['static.webp','tests/fixtures/static/quadrants.webp'],
])
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml',
 '.wasm':'application/wasm','.txt':'text/plain','.mp4':'video/mp4','.webm':'video/webm','.gif':'image/gif','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.zip':'application/zip'}
const server=createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
 if(path==='/favicon.ico'){res.writeHead(204);res.end();return}
 if(!path.startsWith(base))throw Error()
 const sample=path.startsWith(prefix),name=path.slice(prefix.length)
 if(sample&&!samples.has(name))throw Error()
 const file=sample?resolve(samples.get(name)):resolve(root,path.slice(base.length)||'index.html'),from=relative(root,file)
 if(!sample&&(from==='..'||from.startsWith('..'+sep)||from.includes(':')))throw Error()
 const info=await stat(file);if(!info.isFile())throw Error()
 res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  ...(sample?{'Content-Disposition':`attachment; filename="${name}"`}:{})})
 if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}catch{res.writeHead(404);res.end('Not found')}})
await stat(resolve(root,'index.html'))
server.listen(Number(arg('--port','4258')),arg('--host','127.0.0.1'),()=>console.log(JSON.stringify({root,port:arg('--port','4258'),production:true,hmr:false,pages:false})))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0))})
