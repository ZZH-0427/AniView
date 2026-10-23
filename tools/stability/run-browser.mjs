// Uses Node's CDP/WebSocket support and an installed browser; installs nothing.
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

const mode = process.argv[2] ?? 'core'
if (!['core', 'stress', 'soak'].includes(mode)) throw new Error('Expected core, stress or soak')
if (mode !== 'core') {
  const { generateMediaStressFixtures } = await import('./media-fixtures.mjs')
  const { generateArchiveFixtures } = await import('./archive-fixtures.mjs')
  await generateMediaStressFixtures()
  await generateArchiveFixtures({ large: true })
}
await mkdir('.tools/browser-results', { recursive: true })
const port = process.env.ANIVIEW_TEST_PORT ?? '4187'
const url = `http://127.0.0.1:${port}/AniView/?debug=1`
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
})
let previewError = ''
preview.stderr.on('data', data => { previewError += data.toString() })
preview.on('error', error => { previewError = error.message })
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (preview.exitCode !== null) throw new Error(`Preview stopped: ${previewError}`)
    try { ready = (await fetch(url)).ok } catch { /* Starting the local server. */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error(`Preview did not start: ${previewError}`)
  const browser = spawn(process.execPath, ['tools/webp-wasm/browser-check.mjs', url, 'public/validation/viewer/long.webp', mode], {
    windowsHide: true, stdio: 'inherit',
  })
  const code = await new Promise((resolve, reject) => { browser.on('error', reject); browser.on('exit', resolve) })
  if (code !== 0) throw new Error(`Browser ${mode} checks failed (${code})`)
} finally { preview.kill() }
