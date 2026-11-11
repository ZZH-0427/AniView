// Read-only production-preview server; public synthetic fixtures stay outside dist.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolve, join, relative, extname, sep } from 'node:path'
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const root = resolve(option('--root', 'dist')), fixtures = resolve(option('--fixtures', '.tools/m10c3/fixtures'))
const host = option('--host', '127.0.0.1'), port = Number(option('--port', '4295')), base = '/AniView/'
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.gz': 'application/gzip', '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed', '.zip': 'application/zip' }
const safe = (directory, suffix) => {
  const path = resolve(directory, suffix), part = relative(directory, path)
  if (part === '..' || part.startsWith('..' + sep) || part.includes(':')) throw Error('Path')
  return path
}
await readFile(join(root, 'index.html'))
createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
    let file
    const prefix = base + 'validation/extended-archive/'
    if (path.startsWith(prefix)) file = safe(fixtures, path.slice(prefix.length) || 'index.html')
    else if (path === base || path === base.slice(0, -1)) file = join(root, 'index.html')
    else if (path.startsWith(base)) file = safe(root, path.slice(base.length))
    else throw Error('Base')
    const info = await stat(file)
    if (!info.isFile()) throw Error('File')
    const extension = extname(file)
    response.writeHead(200, { 'Content-Type': mime[extension] ?? 'application/octet-stream', 'Content-Length': info.size,
      'Cache-Control': 'no-store', ...(path.startsWith(prefix) && ['.rar', '.7z', '.zip'].includes(extension)
        ? { 'Content-Disposition': 'attachment' } : {}),
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; object-src 'none'; base-uri 'self'" })
    if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response)
  } catch { response.writeHead(404); response.end('Not found') }
}).listen(port, host, () => console.log(JSON.stringify({ root, fixtures, preview: `http://${host}:${port}${base}`, hmr: false, deployment: false })))
