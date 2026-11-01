// Product-only preview; built files plus a named original fixture allowlist, no uploads.
import {createServer} from 'node:http'
import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import {resolve,relative,sep,extname} from 'node:path'
const arg=(n,d)=>process.argv.includes(n)?process.argv[process.argv.indexOf(n)+1]:d
const root=resolve(arg('--root','dist')),fixtures=resolve('.tools/video-source/fixtures'),base='/AniView/'
const samples=new Map([['small.mp4','cfr.mp4'],['vp9.webm','vp9.webm'],['par.mp4','par.mp4'],['landscape.mp4','1080.mp4'],['medium.mp4','benchmark.mp4'],['rotation.mp4','rotation.mp4']])
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.txt':'text/plain','.json':'application/json','.mp4':'video/mp4','.webm':'video/webm'}
const prefix=base+'validation/video-animation/'
const server=createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
 if(path==='/favicon.ico'){res.writeHead(204);res.end();return}
 if(path===prefix){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>AniView video samples</title><h1>Video conversion samples</h1><p>Original procedural test media. Download, then choose it in Convert video.</p>'+[...samples.keys()].map(n=>'<p><a download href="'+n+'">'+n+'</a></p>').join(''));return}
 if(!path.startsWith(base))throw Error()
 const sample=path.startsWith(prefix),suffix=sample?path.slice(prefix.length):path.slice(base.length)||'index.html'
 if(sample&&!samples.has(suffix))throw Error()
 const dir=sample?fixtures:root,file=resolve(dir,sample?samples.get(suffix):suffix),from=relative(dir,file)
 if(from==='..'||from.startsWith('..'+sep)||from.includes(':')||!(await stat(file)).isFile())throw Error()
 res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  ...(sample?{'Content-Disposition':'attachment; filename="'+suffix+'"'}:{})})
 if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}catch{res.writeHead(404);res.end('Not found')}})
await stat(resolve(root,'index.html'))
server.listen(Number(arg('--port','4240')),arg('--host','127.0.0.1'),()=>console.log(JSON.stringify({productionPreview:true,hmr:false,pages:false,port:arg('--port','4240')})))
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0))})
