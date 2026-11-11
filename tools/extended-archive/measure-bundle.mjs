// Measures captured production requests; it does not infer that a file on disk
// was downloaded. Missing runtime artifacts stay pending instead of becoming0.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const args = process.argv.slice(2)
const option = (name, fallback) => { const at = args.indexOf(name); return at === -1 ? fallback : args[at + 1] ?? fallback }
const root = resolve(option('--root', 'dist'))
const baselineRoot = resolve(option('--baseline-root', '.tools/m10b2/site-0a35d4fa3e9f'))
const previousAuditPath = option('--baseline-evidence', '.tools/m10b2/bundle-audit.json')
const currentEvidencePath = option('--network-evidence', '.tools/m10c3/zip-regression.json')
const out = option('--out', '.tools/m10c3/bundle-audit.json')
const previous = JSON.parse(await readFile(previousAuditPath, 'utf8'))
const current = JSON.parse(await readFile(currentEvidencePath, 'utf8'))
const names = await readdir(root + '/assets')
const pending = []
const relativeAsset = url => {
  const pathname = new URL(url, 'http://local.invalid').pathname
  if (!pathname.startsWith('/AniView/')) throw Error('Captured asset is outside /AniView/: ' + pathname)
  return decodeURIComponent(pathname.slice('/AniView/'.length))
}
async function measure(directory, path, optional = false) {
  try {
    const bytes = await readFile(directory + '/' + path)
    return { name: path, bytes: bytes.length, gzip: gzipSync(bytes).length }
  } catch (error) {
    if (!optional || error.code !== 'ENOENT') throw error
    pending.push(path); return null
  }
}
const total = rows => ({ bytes: rows.reduce((n, row) => n + row.bytes, 0), gzip: rows.reduce((n, row) => n + row.gzip, 0) })
const classify = rows => ({ js: total(rows.filter(row => row.name.endsWith('.js'))), css: total(rows.filter(row => row.name.endsWith('.css'))) })
const beforeHome = await Promise.all(previous.home.map(row => measure(baselineRoot, 'assets/' + row.name)))
const afterHome = []
const seen = new Set()
for (const row of current.homeAssets ?? []) {
  if (row.status !== 200) throw Error('Captured Home asset did not return200: ' + row.url)
  const path = relativeAsset(row.url)
  if (seen.has(path)) continue
  seen.add(path)
  const metrics = await measure(root, path, true)
  if (metrics) afterHome.push(metrics)
}
const currentHomeComplete = afterHome.length === seen.size && seen.size > 0
const before = classify(beforeHome), after = currentHomeComplete ? classify(afterHome) : null
const difference = (a, b) => ({ bytes: a.bytes - b.bytes, gzip: a.gzip - b.gzip })
const firstMatching = async pattern => {
  const file = names.find(name => pattern.test(name))
  return file ? measure(root, 'assets/' + file) : null
}
const componentWorker = await firstMatching(/^worker-[^.]+\.js$/)
const jsGlue = await measure(root, 'vendor/sevenzip/bounded-sevenzip.js', true)
const wasm = await measure(root, 'vendor/sevenzip/bounded-sevenzip.wasm', true)
const component = {
  archiveSourceFactory: await firstMatching(/^archive-source-factory-.*\.js$/),
  extendedSession: await firstMatching(/^extended-session-.*\.js$/),
  archivePasswordUi: await firstMatching(/^ArchiveEntryAccess-.*\.js$/),
  extendedWorker: componentWorker, jsGlue, wasm,
  runtimeStatus: jsGlue && wasm ? 'present; behavior/build verification is separate evidence' : 'PENDING: final native runtime unavailable',
}
const isExtendedRuntime = value => {
  const path = new URL(value, 'http://local.invalid').pathname
  return /\/vendor\/sevenzip\/|bounded-sevenzip|\/extended-session-[^/]+\.js$/i.test(path)
    || componentWorker !== null && path.endsWith('/' + componentWorker.name)
}
const homeUrls = (current.homeAssets ?? []).map(row => row.url)
const requests = current.requests ?? []
const allUrls = requests.map(row => row.url).filter(value => typeof value === 'string')
const extendedHomeRequests = homeUrls.filter(isExtendedRuntime)
const extendedZipRequests = allUrls.filter(isExtendedRuntime)
const uniqueOrigins = [...new Set(allUrls.map(url => new URL(url).origin))]
const report = {
  scope: 'M10C3 controller/UI production build and actual Home/ZIP request capture; native and Android gates are independent',
  baseline: { root: relative(process.cwd(), baselineRoot), evidence: previousAuditPath, stage: 'M10B2', home: beforeHome, totals: before },
  current: { root: relative(process.cwd(), root), evidence: currentEvidencePath, evidencePassed: current.passed === true,
    homeAssetsMatchBuild: currentHomeComplete, home: afterHome, totals: after, component },
  delta: after ? { homeJs: difference(after.js, before.js), homeCss: difference(after.css, before.css) } : null,
  network: { capturedRequests: requests.length, requestOrigins: uniqueOrigins,
    homeSevenZipRequests: extendedHomeRequests, zipSevenZipRequests: extendedZipRequests,
    homeDoesNotLoadSevenZip: current.passed === true && homeUrls.length > 0 && extendedHomeRequests.length === 0,
    zipDoesNotLoadSevenZip: current.passed === true && requests.length > 0 && extendedZipRequests.length === 0,
    note: 'ZIP evidence includes the captured ZIP/password-ZIP and conversion regression flow. This is not RAR/7z first-use evidence.' },
  pendingAssets: pending,
  limitations: ['gzip is a byte measurement, not proof of HTTP Content-Encoding.',
    ...(!currentHomeComplete ? ['Captured Home filenames do not match every file in --root; rerun with the frozen capture build or recapture network before comparing totals.'] : []),
    ...(!jsGlue || !wasm ? ['Native product component has not completed its build; no final WASM/glue size or product-readiness claim.'] : [])],
}
await mkdir(resolve(out, '..'), { recursive: true })
await writeFile(out, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ homeBefore: before, homeAfter: after, delta: report.delta,
  extendedWorker: componentWorker, jsGlue, wasm, runtimeStatus: component.runtimeStatus,
  network: report.network, homeAssetsMatchBuild: currentHomeComplete, pendingAssets: pending }, null, 2))
