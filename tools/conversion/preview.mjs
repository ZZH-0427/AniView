// Static production-build-only engineering preview. No Vite client, HMR or uploads.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, relative, sep } from 'node:path'

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const host = option('--host', '127.0.0.1'), port = Number(option('--port', '4210')), root = resolve('.tools/conversion-site'), base = '/AniView/'
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' }
await stat(resolve(root, 'experiments/conversion/index.html'))
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
    if (!path.startsWith(base)) { response.writeHead(404); response.end(); return }
    let suffix = path.slice(base.length)
    if (!suffix || suffix === 'experiments/conversion/') suffix = 'experiments/conversion/index.html'
    const file = resolve(root, suffix), from = relative(root, file)
    if (from === '..' || from.startsWith('..' + sep) || from.includes(':')) throw new Error('Unsafe path')
    const data = await stat(file)
    if (!data.isFile()) throw new Error('Not a file')
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Length': data.size, 'Cache-Control': 'no-store' })
    if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response)
  } catch { response.writeHead(404); response.end('Not found') }
})
server.listen(port, host, () => console.log(JSON.stringify({ preview: `http://${host}:${port}${base}experiments/conversion/?debug=1`, hmr: false, publicDeployment: false })))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
