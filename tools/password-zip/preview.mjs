// Read-only local acceptance server. Test fixtures are never copied into the production build.
import {createServer} from 'node:http'
import {readFile,stat} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {resolve,join,relative,extname,sep} from 'node:path'
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback
const root=resolve(option('--root','dist')),fixtures=resolve('tests/fixtures/zip'),host=option('--host','127.0.0.1'),port=Number(option('--port','4280')),base='/AniView/'
const samples=['mixed.zip','password-mixed.zip','password-first.zip','password-different.zip',...['zipcrypto','aes128','aes192','aes256'].flatMap(k=>['store','deflate'].map(m=>`password-${k}-${m}.zip`)), 'password-corrupt-zipcrypto.zip','password-corrupt-aes.zip','password-unsupported.zip','password-invalid-strength.zip']
const catalog=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AniView password ZIP samples</title><style>body{font:16px/1.6 system-ui;padding:1rem;max-width:45rem;margin:auto}a{display:block;padding:.5rem;min-height:44px;overflow-wrap:anywhere}</style><h1>Password ZIP samples — TEST FIXTURE ONLY</h1><p>These are original synthetic test files. Password: <strong>aniview-test</strong>. In password-different.zip only the second entry uses <strong>beta</strong>. Do not use personal passwords.</p><p>Open ZIP directly in AniView; do not extract it first. A .png entry may be APNG.</p><a href="${base}?debug=1">Open production preview (no HMR)</a>${samples.map(n=>`<a href="${n}" download>${n}</a>`).join('')}</html>`
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json','.zip':'application/zip','.txt':'text/plain; charset=utf-8'}
const safe=(directory,suffix)=>{const p=resolve(directory,suffix),r=relative(directory,p);if(r==='..'||r.startsWith('..'+sep)||r.includes(':'))throw Error('Path');return p}
await readFile(join(root,'index.html'))
createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
 if(path==='/favicon.ico'){res.writeHead(204);res.end();return}
 const prefix=base+'validation/password-zip/'
 if(path===prefix){res.writeHead(200,{'Content-Type':mime['.html'],'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:catalog);return}
 let file
 if(path.startsWith(prefix)){const name=path.slice(prefix.length);if(!samples.includes(name))throw Error('Sample');file=safe(fixtures,name)}
 else if(path===base||path===base.slice(0,-1))file=join(root,'index.html')
 else if(path.startsWith(base))file=safe(root,path.slice(base.length))
 else throw Error('Base')
 const info=await stat(file);if(!info.isFile())throw Error('File')
 res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store',...(file.endsWith('.zip')?{'Content-Disposition':`attachment; filename="${file.split(/[\\/]/).at(-1)}"`}:{})})
 if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}catch{res.writeHead(404);res.end('Not found')}}).listen(port,host,()=>console.log(JSON.stringify({preview:`http://${host}:${port}${base}`,root,productionDeployment:false})))
