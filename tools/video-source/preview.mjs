// GET/HEAD production preview; only built assets and named generated fixtures.
import {createServer} from 'node:http'
import {createReadStream} from 'node:fs'
import {stat,readFile} from 'node:fs/promises'
import {resolve,relative,sep,extname} from 'node:path'
const arg=(n,d)=>process.argv.includes(n)?process.argv[process.argv.indexOf(n)+1]:d
const root=resolve(arg('--root','.tools/video-source-site')),fixtures=resolve('.tools/video-source/fixtures'),base='/AniView/'
const names=new Set(['manifest.json',...JSON.parse(await readFile(resolve(fixtures,'manifest.json'),'utf8')).fixtures.map(f=>f.name)])
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.txt':'text/plain','.mp4':'video/mp4','.webm':'video/webm'}
const server=createServer(async(req,res)=>{try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return}
  if(!path.startsWith(base))throw Error()
  const fixturePrefix=base+'experiments/video-source/fixtures/',sample=path.startsWith(fixturePrefix)
  const suffix=sample?path.slice(fixturePrefix.length):(path.slice(base.length)||'experiments/video-source/index.html')
  if(sample&&!names.has(suffix))throw Error()
  const normalized=suffix==='experiments/video-source/'?'experiments/video-source/index.html':suffix
  const directory=sample?fixtures:root,file=resolve(directory,normalized),from=relative(directory,file)
  if(from==='..'||from.startsWith('..'+sep)||from.includes(':')||!(await stat(file)).isFile())throw Error()
  res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}catch{res.writeHead(404);res.end('Not found')}})
await stat(resolve(root,'experiments/video-source/index.html'))
server.listen(Number(arg('--port','4230')),arg('--host','127.0.0.1'),()=>console.log(JSON.stringify({productionPreview:true,hmr:false,pages:false,port:arg('--port','4230')})))
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0))})
