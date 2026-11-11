// Actual compiled product Worker/native filename regression, using public
// original fixtures. --baseline observes the preserved old artifact; it never
// relaxes the mandatory assertions applied to the patched production artifact.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { launchBrowser } from '../creation/browser.mjs'
import { inspectMemory } from './verify-runtime.mjs'
import { filenameFixtureRoot, inspectFilenameFixture, prepareFilenameFixtures } from './rar4-filename-fixtures.mjs'

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const baseline = process.argv.includes('--baseline'), build = resolve(option('--build', 'dist'))
const output = resolve(option('--out', '.tools/m10c3/nul-fix/filename-' + (baseline ? 'before' : 'after') + '.json'))
const fixtureManifest = await prepareFilenameFixtures()
const workerNames = (await readdir(join(build, 'assets'))).filter(name => /^worker-[^/]+\.js$/u.test(name))
assert.equal(workerNames.length, 1, 'Unambiguous actual product extended Worker')
const workerPath = 'assets/' + workerNames[0], hash = bytes => createHash('sha256').update(bytes).digest('hex')
const wasm = await readFile(join(build, 'vendor/sevenzip/bounded-sevenzip.wasm'))
const glue = await readFile(join(build, 'vendor/sevenzip/bounded-sevenzip.js'))
const memory = inspectMemory(wasm)
assert.deepEqual(memory, { count: 1, flags: 1, initial: 16777216, maximum: 67108864 })
for (const fixture of fixtureManifest.cases) {
  const bytes = await readFile(join(filenameFixtureRoot, fixture.name))
  assert.equal(hash(bytes), fixture.sha256); assert.deepEqual(inspectFilenameFixture(bytes), fixture.structural)
}
const report = { scope: 'actual compiled product Worker + native RAR4 parser; original STORE-only public records',
  phase: baseline ? 'BEFORE: observation of preserved old artifact' : 'AFTER: strict security and Unicode acceptance',
  build, worker: workerPath, workerSha256: hash(await readFile(join(build, workerPath))),
  wasmSha256: hash(wasm), glueSha256: hash(glue), memory, rows: [] }
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (path === '/AniView/') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
      response.end('<!doctype html><meta charset="utf-8"><title>AniView RAR4 native filename validation</title>Local numeric validation only.'); return
    }
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
    const prefix = '/AniView/filename-fixtures/', directory = path.startsWith(prefix) ? filenameFixtureRoot : build
    const suffix = path.startsWith(prefix) ? path.slice(prefix.length) : path.replace(/^\/AniView\//u, '')
    const file = resolve(directory, suffix)
    assert(file.startsWith(directory + sep)); assert((await stat(file)).isFile())
    response.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.wasm': 'application/wasm' }[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'" })
    response.end(await readFile(file))
  } catch { response.writeHead(404); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await launchBrowser(resolve('.tools/m10c3/nul-fix/filename-' + (baseline ? 'before' : 'after') + '-browser'))
  await browser.navigate(`http://127.0.0.1:${server.address().port}/AniView/`)
  await browser.evaluate(`window.__rar4FilenameCheck=async function(fixture,workerPath){
    let worker,sequence=0,created=0,terminated=0;const pending=new Map(),phases=[];
    const stop=()=>{if(worker){worker.terminate();worker=undefined;terminated++;}for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('TEST_CLOSED'));}pending.clear();};
    const call=(type,payload={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(new Error('ARCHIVE_TIMEOUT'),{code:'ARCHIVE_TIMEOUT'}));stop();},15000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,generation:1,type,...payload});});
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const started=performance.now();
    try{
      const source=await(await fetch(new URL('filename-fixtures/'+fixture.name,location.href))).blob();
      worker=new Worker(new URL(workerPath,location.href),{type:'module'});created++;
      worker.onmessage=({data:m})=>{const task=pending.get(m.id);if(!task)return;if(m.type==='progress'){phases.push(m.phase);return;}clearTimeout(task.timer);pending.delete(m.id);if(m.type==='error')task.reject(Object.assign(new Error(m.code),{code:m.code}));else task.resolve(m);};
      worker.onerror=event=>{event.preventDefault();for(const task of pending.values()){clearTimeout(task.timer);task.reject(Object.assign(new Error('WORKER_FAILED'),{code:'WORKER_FAILED'}));}pending.clear();};
      const opened=await call('open',{source});const entries=opened.result.entries;
      const result={outcome:'ready',entries:entries.map(e=>({id:e.id,path:e.path,size:e.size})),phases,metrics:opened.result.metrics};
      if(fixture.expectedPath){const selected=entries.find(e=>e.path===fixture.expectedPath);if(selected){const decoded=await call('extract',{entryId:selected.id});result.outputBytes=decoded.result.data.byteLength;result.outputSha256=await digest(decoded.result.data);}}
      return {...result,elapsedMs:performance.now()-started};
    }catch(error){return {outcome:'error',code:error.code??error.message,phases,elapsedMs:performance.now()-started};}
    finally{stop();window.__rar4FilenameCleanup={created,terminated,activeWorkers:created-terminated,pendingRequests:pending.size};}
  }`)
  for (const fixture of fixtureManifest.cases) {
    const actual = await browser.evaluate(`window.__rar4FilenameCheck(${JSON.stringify({ name: fixture.name, expectedPath: fixture.expectedPath })},${JSON.stringify(workerPath)})`, 60000)
    const cleanup = await browser.evaluate('window.__rar4FilenameCleanup')
    const matchesExpected = fixture.expectedError ? actual.outcome === 'error' && actual.code === fixture.expectedError
      : actual.outcome === 'ready' && actual.entries.length === 1 && actual.entries[0].path === fixture.expectedPath
        && actual.outputBytes === fixture.expectedOutputBytes && actual.outputSha256 === fixture.expectedOutputSha256
    report.rows.push({ case: fixture.name, purpose: fixture.purpose, expectedError: fixture.expectedError,
      expectedPath: fixture.expectedPath, structure: fixture.structural, ...actual, matchesExpected, cleanup })
    await writeFile(output, JSON.stringify(report, null, 2) + '\n')
    assert.equal(cleanup.activeWorkers, 0); assert.equal(cleanup.pendingRequests, 0); assert.equal(cleanup.created, cleanup.terminated)
    if (!baseline) {
      assert(matchesExpected, fixture.name + ': ' + JSON.stringify(actual))
      if (['nul-name-rar4.rar', 'nul-hidden-traversal.rar', 'nul-trailing.rar'].includes(fixture.name)) {
        assert(actual.phases.includes('opening'), 'Raw regression must reach the actual native opening call: ' + fixture.name)
        assert(!actual.phases.includes('listing'), 'Raw name must be rejected during native opening, before structured metadata: ' + fixture.name)
      }
    } else if (fixture.name === 'nul-name-rar4.rar') {
      assert.equal(actual.outcome, 'ready', 'Original regression must reproduce in the preserved artifact')
      assert.equal(actual.entries[0].path, 'safe', 'Preserved artifact silently truncates the original raw NUL name')
    } else if (fixture.expectedPath && !['unicode-length-1024.rar', 'unicode-private-use.rar', 'utf8-private-use.rar'].includes(fixture.name)) assert(matchesExpected, 'Preserved baseline valid fixture: ' + fixture.name)
    console.log(fixture.name + ': ' + (baseline ? actual.outcome + (actual.code ? ' ' + actual.code : '') : 'PASS'))
  }
  report.secureContext = await browser.evaluate('isSecureContext')
  report.hmr = await browser.evaluate('performance.getEntriesByType("resource").some(e=>e.name.includes("/@vite/client"))')
  report.browser = await browser.evaluate('navigator.userAgent')
  report.browserErrors = browser.errors
  report.observedWorkers = await browser.evaluate('window.__creationProbe')
  assert.equal(report.hmr, false); assert.deepEqual(browser.errors, [])
  assert.equal(report.observedWorkers.activeWorkers, 0)
  assert.equal(report.observedWorkers.workersCreated, report.observedWorkers.workersTerminated)
  report.baselineObserved = baseline; report.passed = !baseline
  report.matches = report.rows.filter(row => row.matchesExpected).length
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ phase: report.phase, cases: report.rows.length, matches: report.matches, passed: report.passed, baselineObserved: baseline, output }))
} catch (error) {
  await writeFile(output, JSON.stringify({ ...report, passed: false, error: error.stack, browserErrors: browser?.errors }, null, 2) + '\n')
  throw error
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
