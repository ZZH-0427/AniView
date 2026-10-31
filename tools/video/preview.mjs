// Production engineering build only. GET/HEAD whitelist; never accepts user media.
import {createServer as httpServer} from 'node:http'
import {createServer as httpsServer} from 'node:https'
import {createReadStream} from 'node:fs'
import {readFile,stat} from 'node:fs/promises'
import {resolve,relative,sep,extname} from 'node:path'
const arg=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback
const root=resolve('.tools/video-site'),base='/AniView/',host=arg('--host','127.0.0.1'),port=Number(arg('--port','4220'))
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.json':'application/json'}
const handler=async(req,res)=>{try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return}
  if(!path.startsWith(base))throw Error('base')
  let suffix=path.slice(base.length);if(!suffix||suffix==='experiments/video/')suffix='experiments/video/index.html'
  const file=resolve(root,suffix),from=relative(root,file)
  if(from==='..'||from.startsWith('..'+sep)||from.includes(':'))throw Error('path')
  const info=await stat(file);if(!info.isFile())throw Error('not file')
  res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}catch{res.writeHead(404);res.end('Not found')}}
const key=arg('--key'),cert=arg('--cert'),tls=key&&cert
const server=tls?httpsServer({key:await readFile(key),cert:await readFile(cert)},handler):httpServer(handler)
await stat(resolve(root,'experiments/video/index.html'))
server.listen(port,host,()=>console.log(JSON.stringify({url:`${tls?'https':'http'}://${host}:${port}${base}experiments/video/?debug=1`,hmr:false,publicDeployment:false})))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
