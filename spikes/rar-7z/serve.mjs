import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const root = resolve(process.env.SPIKE_ROOT??'spikes/rar-7z'), fixtures = resolve(process.env.SPIKE_FIXTURES??'.tools/m10c2/fixtures')
const port = Number(process.argv[2] ?? 4292)
const types = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript', '.js':'text/javascript', '.wasm':'application/wasm', '.json':'application/json', '.md':'text/plain; charset=utf-8', '.txt':'text/plain; charset=utf-8' }
createServer(async (req,res) => {
  try {
    let path = decodeURIComponent(new URL(req.url,'http://localhost').pathname)
    if (path === '/favicon.ico') { res.writeHead(204);res.end();return }
    if (!path.startsWith('/AniView/')) { res.writeHead(404);res.end();return }
    path = path.slice('/AniView/'.length) || 'index.html'
    const base=path.startsWith('fixtures/')?fixtures:root
    const file=resolve(base,path.startsWith('fixtures/')?path.slice(9):path)
    if (!file.startsWith(base+sep)) throw Error('outside')
    const data=await readFile(file)
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'"})
    res.end(data)
  } catch { res.writeHead(404);res.end() }
}).listen(port,'0.0.0.0',()=>console.log('M10C2 static production harness: '+port+' /AniView/; HMR=false'))
