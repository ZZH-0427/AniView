// Temporary LAN acceptance server. The production build remains fixture-free.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { resolve, join, relative, extname, sep } from 'node:path'

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const host = option('--host', '127.0.0.1'), port = Number(option('--port', '4198'))
const dist = resolve('dist'), fixtures = resolve('.tools/creation'), base = '/AniView/'
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.zip': 'application/zip', '.json': 'application/json' }
const safePath = (root, suffix) => {
  const path = resolve(root, suffix), from = relative(root, path)
  if (from === '..' || from.startsWith('..' + sep) || from.includes(':')) throw new Error('Unsafe path')
  return path
}
const index = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AniView local creation samples</title>
<style>body{font:16px/1.6 system-ui;max-width:48rem;margin:auto;padding:1rem}a{display:block;min-height:44px;padding:.4rem}code{overflow-wrap:anywhere}</style>
<h1>Local GIF creation samples</h1><p>Original programmatically generated images for local Android acceptance. Download a ZIP, extract it with the phone's Files app, then choose the extracted static images in Create GIF. These ZIPs are fixture delivery only; the creator does not accept ZIP input.</p>
<a href="${base}">Open AniView development build</a>
<a href="mobile-40.zip" download>Download 40 × 320×240 static PNGs</a>
<a href="mobile-10-large.zip" download>Download 10 × 1024² static PNGs</a>
<a href="mixed-static.zip" download>Download mixed JPEG / PNG / WebP</a>
<p>Run the small workload first. Stop increasing workload after a tab crash or reload. All image processing stays in your browser.</p></html>`

const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
    if (path === base + 'validation/creation/' || path === base + 'validation/creation/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : index); return
    }
    let file
    if (path.startsWith(base + 'validation/creation/')) {
      const suffix = path.slice((base + 'validation/creation/').length)
      if (!suffix.startsWith('fixtures/') && !['mobile-40.zip','mobile-10-large.zip','mixed-static.zip'].includes(suffix)) {
        response.writeHead(404); response.end(); return
      }
      file = safePath(fixtures, suffix)
    }
    else if (path === base || path === base.slice(0, -1)) file = join(dist, 'index.html')
    else if (path.startsWith(base)) file = safePath(dist, path.slice(base.length))
    else { response.writeHead(404); response.end(); return }
    const info = await stat(file)
    if (!info.isFile()) throw new Error('Not a file')
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store',
      ...(extname(file) === '.zip' ? { 'Content-Disposition': `attachment; filename="${file.split(/[\\/]/).at(-1)}"` } : {}) })
    if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response)
  } catch { response.writeHead(404); response.end('Not found') }
})
await readFile(join(dist, 'index.html')) // Fail clearly before exposing an unbuilt directory.
server.listen(port, host, () => console.log(JSON.stringify({ localPreview: `http://${host}:${port}${base}`, fixtures: base + 'validation/creation/', productionDeployment: false })))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
