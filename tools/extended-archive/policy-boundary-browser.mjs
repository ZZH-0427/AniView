// Exact product guard validation using the installed browser and actual production
// backend/Worker/native component. No test hooks enter the product bundle.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises'
import { join, resolve, extname, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { build } from 'vite'
import { launchBrowser } from '../creation/browser.mjs'

const root = resolve('.tools/m10c3/policy-boundaries'), fixtures = join(root, 'fixtures'), dist = join(root, 'dist')
await mkdir(fixtures, { recursive: true })
const prepareOnly = process.argv.includes('--prepare-only')
let memory
if (!prepareOnly) {
  const runtimeWasm = await readFile('public/vendor/sevenzip/bounded-sevenzip.wasm')
  const runtimeGlue = await readFile('public/vendor/sevenzip/bounded-sevenzip.js', 'utf8')
  assert(!runtimeGlue.includes('_av_probe_alloc'), 'Production glue exposes allocation probe')
  let cursor = 8
  const leb = () => { let value = 0, shift = 0, byte; do { byte = runtimeWasm[cursor++]; value += (byte & 127) * 2 ** shift; shift += 7 } while (byte & 128); return value }
  while (cursor < runtimeWasm.length) {
    const section = runtimeWasm[cursor++], length = leb(), end = cursor + length
    if (section === 5) { const count = leb(), flags = leb(), initial = leb(), maximum = flags & 1 ? leb() : null; memory = { count, flags, initial, maximum } }
    cursor = end
  }
  assert.deepEqual(memory, { count: 1, flags: 1, initial: 256, maximum: 1024 }, 'Product WASM must retain nonshared16/64MiB memory')
}

const sha = value => createHash('sha256').update(value).digest('hex')
const crc = bytes => { let n = 0xffffffff; for (const byte of bytes) { n ^= byte; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0) } return (n ^ 0xffffffff) >>> 0 }
const uint = n => {
  for (let extra = 0; extra < 8; extra++) if (n < 2 ** (7 + 7 * extra)) {
    const bytes = [(0xff << (8 - extra) & 255) | Math.floor(n / 2 ** (8 * extra))]
    for (let i = 0; i < extra; i++) bytes.push(Math.floor(n / 2 ** (8 * i)) & 255)
    return bytes
  }
  throw Error('Fixture integer overflow')
}
// COPY-only container construction, following the already accepted M10C2 fixture
// recipe. No compression algorithm or archive-writing product API is introduced.
async function copyFixture(name, paths, outputBytes = 1, padTo = undefined) {
  const data = paths.map(() => Buffer.alloc(outputBytes, 65)), packed = Buffer.concat(data)
  const names = Buffer.from(paths.map(path => path + '\0').join(''), 'utf16le'), count = paths.length
  const header = Buffer.from([1, 4, 6, 0, ...uint(count), 9, ...data.flatMap(b => uint(b.length)), 0,
    7, 11, ...uint(count), 0, ...paths.flatMap(() => [1, 1, 0]), 12, ...data.flatMap(b => uint(b.length)), 0, 0,
    5, ...uint(count), 17, ...uint(names.length + 1), 0, ...names, 0, 0])
  const start = Buffer.alloc(20)
  start.writeBigUInt64LE(BigInt(packed.length), 0); start.writeBigUInt64LE(BigInt(header.length), 8); start.writeUInt32LE(crc(header), 16)
  const signature = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4, 0, 0, 0, 0]); signature.writeUInt32LE(crc(start), 8)
  let archive = Buffer.concat([signature, start, packed, header])
  if (padTo !== undefined) { assert(archive.length <= padTo); archive = Buffer.concat([archive, Buffer.alloc(padTo - archive.length)]) }
  await writeFile(join(fixtures, name), archive)
  return { name, inputBytes: archive.length, firstSha256: sha(data[0]), firstBytes: outputBytes }
}
const cases = []
const add = async (name, paths, outputBytes, expectedCode, padTo) => {
  const fixture = await copyFixture(name, paths, outputBytes, padTo)
  cases.push({ ...fixture, expectedCode: expectedCode ?? null })
}
for (const delta of [-1, 0, 1]) await add(`input-${delta}.7z`, ['a.bin'], 1,
  delta > 0 ? 'ARCHIVE_LIMIT_EXCEEDED' : null, 15 * 1024 ** 2 + delta)
for (const delta of [-1, 0, 1]) await add(`output-${delta}.7z`, ['a.bin'], 4 * 1024 ** 2 + delta,
  delta > 0 ? 'ARCHIVE_LIMIT_EXCEEDED' : null)
for (const count of [999, 1000, 1001]) await add(`entries-${count}.7z`, Array.from({ length: count }, (_, id) => `e${id}`), 1,
  count > 1000 ? 'ARCHIVE_LIMIT_EXCEEDED' : null)
for (const count of [1023, 1024, 1025]) await add(`path-${count}.7z`, ['a'.repeat(count)], 1,
  count > 1024 ? 'ARCHIVE_LIMIT_EXCEEDED' : null)
for (const delta of [-1, 0, 1]) {
  const paths = Array.from({ length: 128 }, (_, id) => 'a'.repeat(id === 0 && delta === -1 ? 1023 : 1024))
  if (delta === 1) paths.push('a')
  await add(`total-path-${delta}.7z`, paths, 1, delta > 0 ? 'ARCHIVE_LIMIT_EXCEEDED' : null)
}

// Changing a known tiny LZMA2 stream's dictionary declaration to a larger valid
// value needs no codec implementation. Installed7-Zip independently verifies the
// resulting output, then the product must accept4MiB and reject6MiB metadata.
const temp = await mkdtemp(join(root, 'dictionary-')), seven = process.env.SEVENZIP_EXE ?? 'C:/Program Files/7-Zip/7z.exe'
await writeFile(join(temp, 'a.bin'), Buffer.alloc(64, 65))
const seed = join(temp, 'seed.7z')
execFileSync(seven, ['a', '-t7z', '-y', '-mmt=1', '-ms=off', '-mhc=off', '-m0=LZMA2', '-md4m', seed, 'a.bin'],
  { cwd: temp, windowsHide: true, stdio: 'ignore' })
const original = await readFile(seed), headerAt = 32 + Number(original.readBigUInt64LE(12)), headerLength = Number(original.readBigUInt64LE(20))
const marker = Buffer.from([1, 0x21, 0x21, 1]), propertyAt = original.indexOf(marker, headerAt) + marker.length
assert(propertyAt >= headerAt + marker.length && propertyAt < headerAt + headerLength, 'Known fixture LZMA2 property absent')
for (const [label, property, dictionaryBytes, expectedCode] of [['below', 19, 3 * 1024 ** 2, null], ['exact', 20, 4 * 1024 ** 2, null], ['above', 21, 6 * 1024 ** 2, 'ARCHIVE_LIMIT_EXCEEDED']]) {
  const archive = Buffer.from(original); archive[propertyAt] = property
  archive.writeUInt32LE(crc(archive.subarray(headerAt, headerAt + headerLength)), 28)
  archive.writeUInt32LE(crc(archive.subarray(12, 32)), 8)
  const name = `dictionary-${label}.7z`, path = join(fixtures, name)
  await writeFile(path, archive)
  const output = execFileSync(seven, ['e', '-so', '-p-', path, '--', 'a.bin'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(sha(output), sha(Buffer.alloc(64, 65)))
  cases.push({ name, inputBytes: archive.length, firstSha256: sha(output), firstBytes: 64, dictionaryBytes, expectedCode })
}
await writeFile(join(root, 'fixture-manifest.json'), JSON.stringify(cases, null, 2) + '\n')
if (prepareOnly) { console.log(JSON.stringify({ prepared: true, fixtures: cases.length, manifest: join(root, 'fixture-manifest.json') })); process.exit(0) }

await build({ configFile: false, base: '/AniView/', publicDir: resolve('public'),
  build: { outDir: dist, emptyOutDir: true, rollupOptions: { input: resolve('tools/extended-archive/policy-boundary.html') } } })
let fault = ''
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (fault && path.endsWith('/vendor/sevenzip/bounded-sevenzip.wasm')) {
      response.writeHead(fault === 'http' ? 503 : 200, { 'Content-Type': 'application/wasm', 'Cache-Control': 'no-store' })
      response.end('not valid wasm'); return
    }
    const prefix = '/AniView/policy-fixtures/', base = path.startsWith(prefix) ? fixtures : dist
    const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path.replace(/^\/AniView\//, '')
    const file = resolve(base, relative)
    assert(file.startsWith(base + sep), 'Invalid local test path')
    assert((await stat(file)).isFile())
    const mime = { '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json' }[extname(file)] ?? 'application/octet-stream'
    response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; img-src data:; connect-src 'self'" })
    response.end(await readFile(file))
  } catch { response.writeHead(404); response.end('Not found') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port, url = `http://127.0.0.1:${port}/AniView/tools/extended-archive/policy-boundary.html`
let browser
const rows = []
try {
  browser = await launchBrowser(root)
  await browser.navigate(url); await browser.waitFor('typeof window.extendedPolicyCheck==="function"')
  for (const item of cases) {
    const result = await browser.evaluate(`window.extendedPolicyCheck(${JSON.stringify(item.name)},${JSON.stringify(item.firstSha256)})`, 60000)
    if (item.expectedCode) assert.equal(result.code, item.expectedCode, item.name)
    else {
      assert.equal(result.status, 'success', item.name + ': ' + JSON.stringify(result))
      assert.equal(result.outputBytes, item.firstBytes)
      if (item.dictionaryBytes) assert.equal(result.dictionaryBytes, item.dictionaryBytes)
    }
    assert.equal(result.cleanup.activeWorkers, 0); assert.equal(result.cleanup.wasmInstances, 0)
    assert.equal(result.cleanup.workersCreated, result.cleanup.workersTerminated)
    assert.equal(result.cleanup.cleanupErrors, 0)
    rows.push({ case: item.name, ...result }); console.log(item.name + ': PASS')
  }
  // No native operation is mocked: a1ms parent deadline terminates the cold Worker.
  const deadline = await browser.evaluate('window.extendedPolicyCheck("output-0.7z",undefined,1)', 60000)
  assert.equal(deadline.code, 'ARCHIVE_TIMEOUT'); assert.equal(deadline.cleanup.activeWorkers, 0)
  rows.push({ case: 'deadline-1ms', ...deadline })
  for (const [mode, code] of [['http', 'ARCHIVE_BACKEND_ASSET_FAILED'], ['invalid', 'ARCHIVE_WASM_INITIALIZATION_FAILED']]) {
    fault = mode
    const result = await browser.evaluate('window.extendedPolicyCheck("dictionary-exact.7z")', 60000)
    assert.equal(result.code, code); assert.equal(result.cleanup.activeWorkers, 0)
    rows.push({ case: 'loader-' + mode, ...result })
  }
  fault = ''
  const retry = await browser.evaluate('window.extendedPolicyCheck("dictionary-exact.7z")', 60000)
  assert.equal(retry.status, 'success'); assert.equal(retry.cleanup.activeWorkers, 0)
  rows.push({ case: 'loader-recovery', ...retry })
  const unexpected = browser.errors.filter(error => !error.includes('503 ') && !error.includes('bounded-sevenzip.wasm'))
  assert.deepEqual(unexpected, [])
  const report = { passed: true, build: 'm10c3-product-policy', secureContext: await browser.evaluate('isSecureContext'),
    hmr: await browser.evaluate('performance.getEntriesByType("resource").some(e=>e.name.includes("/@vite/client"))'),
    browser: await browser.evaluate('navigator.userAgent'), memorySection: memory, rows,
    expectedAssetFailures: browser.errors.filter(error => !unexpected.includes(error)),
    limitation: 'Native LZMA2 dictionary declarations are discrete (3/4/6MiB); exact4MiB+1 metadata is covered by policy unit tests. Native actual-write cap remains compiled and cannot be bypassed through product protocol.' }
  assert.equal(report.hmr, false)
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, checks: rows.length, report: join(root, 'report.json') }))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
