// Read-only compatibility acceptance of the compiled product Worker/native library.
// Public fixture passwords are transient test inputs, never output diagnostics.
// Product UI/navigation acceptance is a separate run-product.mjs responsibility.
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { launchBrowser } from '../creation/browser.mjs'

const output = resolve('.tools/m10c3'), fixtures = join(output, 'fixtures')
const build = resolve(process.env.ANIVIEW_EXTENDED_BUILD ?? '.tools/m10c3/controller-ui')
const base = process.env.ANIVIEW_EXTENDED_URL ?? 'http://127.0.0.1:4295/AniView/'
await mkdir(output, { recursive: true })
const manifest = JSON.parse(await readFile(join(fixtures, 'manifest.json'), 'utf8'))
const assets = (await readdir(join(build, 'assets'))).filter(name => /^worker-[^/]+\.js$/u.test(name))
assert.equal(assets.length, 1, 'Need unambiguous compiled product extended Worker')
const workerPath = 'assets/' + assets[0], workerBytes = await readFile(join(build, workerPath))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const cases = manifest.rows.map(row => ({ ...row, iteration: 1 }))
for (const row of manifest.rows.filter(row => row.name.startsWith('test_read_format_rar4_'))) {
  for (const iteration of [2, 3]) cases.push({ ...row, iteration })
}
const negativeCases = manifest.negativeRows ?? []
cases.push(...negativeCases.map(row => ({ ...row, iteration: 1 })))
for (const row of [...manifest.rows, ...negativeCases]) {
  const actual = await readFile(join(fixtures, row.name))
  assert.equal(sha(actual), row.sha256, 'Public fixture changed: ' + row.name)
}
if (process.argv.includes('--prepare-only')) {
  console.log(JSON.stringify({ prepared: true, fixtures: manifest.rows.length, cases: cases.length, worker: workerPath,
    negativeFixtures: negativeCases.length, workerSha256: sha(workerBytes), note: 'No browser/native execution performed' })); process.exit(0)
}
assert(negativeCases.some(row => row.expectedError === 'ARCHIVE_UNSUPPORTED'), 'Missing native embedded-NUL rejection fixture')

const browser = await launchBrowser(join(output, 'compatibility-browser'))
const report = { scope: 'compiled product Worker/native component; separate from UI acceptance',
  worker: workerPath, workerSha256: sha(workerBytes), rows: [] }
try {
  await browser.navigate(base + '?debug=1'); await browser.waitFor('!!document.querySelector(".home")')
  assert.equal(sha(Buffer.from(await (await fetch(new URL(workerPath, base))).arrayBuffer())), report.workerSha256,
    'Preview serves a different Worker build')
  await browser.evaluate(`window.__extendedCompatibility = async function(fixture, workerPath) {
    let worker, generation = 0, sequence = 0, created = 0, terminated = 0;
    let peakWasmBytes = 0, lastNative = null, heartbeatCount = 0, maxHeartbeatGapMs = 0, lastBeat = performance.now();
    const pending = new Map(), events = [], selected = [];
    const beat = setInterval(() => { const now = performance.now(); heartbeatCount++; maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now-lastBeat); lastBeat=now },16);
    const error = code => Object.assign(new Error(code), {code});
    const stop = code => {
      generation++;
      if(worker) { worker.onmessage=worker.onerror=worker.onmessageerror=null; worker.terminate(); worker=undefined; terminated++; }
      for(const item of pending.values()) { clearTimeout(item.timer); item.reject(error(code)); }
      pending.clear();
    };
    const call = (type, payload = {}) => new Promise((resolve,reject) => {
      if(!worker) { reject(error('ARCHIVE_CLOSED')); return; }
      const id=++sequence, timer=setTimeout(()=>stop('ARCHIVE_TIMEOUT'),15000);
      pending.set(id,{resolve,reject,timer});
      try { worker.postMessage({id,generation,type,...payload}); }
      catch { stop('ARCHIVE_BACKEND_ERROR'); }
    });
    const start = () => {
      stop('CANCELLED'); const ownedGeneration=generation;
      worker=new Worker(new URL(workerPath,location.href),{type:'module'}); created++;
      worker.onmessage=({data:m})=>{
        if(m.generation!==ownedGeneration)return;
        const task=pending.get(m.id);if(!task)return;
        if(m.type==='progress')return;
        clearTimeout(task.timer);pending.delete(m.id);
        const metrics=m.result?.metrics??m.metrics;
        if(metrics){lastNative=metrics;peakWasmBytes=Math.max(peakWasmBytes,metrics.wasmBytes);}
        if(m.type==='error')task.reject(error(m.code));else task.resolve(m);
      };
      worker.onerror=e=>{e.preventDefault();stop('ARCHIVE_BACKEND_ERROR')};
      worker.onmessageerror=()=>stop('ARCHIVE_BACKEND_ERROR');
    };
    const source=await(await fetch(new URL('validation/extended-archive/'+encodeURIComponent(fixture.name),location.href))).blob();
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
    const credentialError=code=>['ARCHIVE_ENCRYPTED','ARCHIVE_WRONG_PASSWORD','ARCHIVE_PASSWORD_OR_CORRUPTED'].includes(code);
    const attempt=async(stage,operation,expected)=>{
      try { const result=await operation(); events.push({stage,outcome:'success'});if(expected)throw error('EXPECTED_CREDENTIAL_REJECTION');return result; }
      catch(cause){if(expected&&credentialError(cause.code)){events.push({stage,outcome:cause.code});return null;}throw cause;}
    };
    const open=async password=>{start();return await call('open',{source,...(password===undefined?{}:{password})})};
    const extract=async(entry,password)=>await call('extract',{entryId:entry.id,...(password===undefined?{}:{password})});
    const started=performance.now();
    try {
      if(fixture.expectedError) {
        let rejected=false;
        try { await open(); }
        catch(cause) { events.push({stage:'unsafe-metadata-open',outcome:cause.code??'UNEXPECTED_TEST_ERROR'});if(cause.code!==fixture.expectedError)throw cause;rejected=true; }
        if(!rejected)throw error('UNSAFE_METADATA_ACCEPTED');
        return {status:'PASS',expectedRejection:fixture.expectedError,inputBytes:source.size,events,selected,
          elapsedMs:performance.now()-started,peakWasmBytes,lastNative,heartbeatCount,maxHeartbeatGapMs};
      }
      let opened;
      try { opened=await open();events.push({stage:'open-missing',outcome:'success'}); }
      catch(cause) {
        if(!fixture.publicTestPassword||!credentialError(cause.code))throw cause;
        events.push({stage:'open-missing',outcome:cause.code});
        await attempt('open-wrong',()=>open('wrong-public-fixture-value'),true);
        opened=await attempt('open-correct',()=>open(fixture.publicTestPassword),false);
      }
      if(opened.type!=='ready')throw error('INVALID_OPEN_RESPONSE');
      const entries=opened.result.entries;
      const unknowns={size:entries.filter(e=>e.size===null).length,packedSize:entries.filter(e=>e.packedSize===null).length,
        encrypted:entries.filter(e=>e.encrypted===null).length,dictionary:entries.filter(e=>e.dictionaryBytes===null).length};
      if(fixture.publicTestPassword&&events[0].outcome==='success') {
        const target=entries.find(e=>e.normalizedPath===fixture.expected[0].path);
        if(!target)throw error('EXPECTED_ENTRY_MISSING');
        await attempt('extract-missing',()=>extract(target),true);
        await attempt('extract-wrong',()=>extract(target,'wrong-public-fixture-value'),true);
      }
      for(const expected of fixture.expected) {
        const entry=entries.find(e=>e.normalizedPath===expected.path);
        if(!entry)throw error('EXPECTED_ENTRY_MISSING');
        if(expected.bytes>4*1024*1024) {
          try{await extract(entry,fixture.publicTestPassword);throw error('OVERSIZED_ENTRY_ACCEPTED')}
          catch(cause){if(cause.code!=='ARCHIVE_LIMIT_EXCEEDED')throw cause;}
          selected.push({id:entry.id,publicFixturePath:expected.path,outcome:'expected-output-limit'});continue;
        }
        const result=await extract(entry,fixture.publicTestPassword);
        if(result.type!=='extracted'||result.result.data.byteLength!==expected.bytes)throw error('OUTPUT_SIZE_MISMATCH');
        const hash=await digest(result.result.data);
        if(hash!==expected.sha256)throw error('OUTPUT_HASH_MISMATCH');
        selected.push({id:entry.id,publicFixturePath:expected.path,bytes:result.result.data.byteLength,sha256:hash,
          dictionaryBytes:entry.dictionaryBytes,encrypted:entry.encrypted,solid:entry.solid,method:entry.method});
      }
      const listed=await call('list');
      if(listed.type!=='listed'||listed.entries.length!==entries.length)throw error('LISTING_CHANGED');
      return {status:'PASS',inputBytes:source.size,entries:entries.length,unknowns,events,selected,
        elapsedMs:performance.now()-started,peakWasmBytes,lastNative,heartbeatCount,maxHeartbeatGapMs};
    } catch(cause) {
      return {status:'FAIL',error:cause.code??'UNEXPECTED_TEST_ERROR',events,selected,
        elapsedMs:performance.now()-started,peakWasmBytes,lastNative,heartbeatCount,maxHeartbeatGapMs};
    } finally {
      clearInterval(beat);stop('CLOSED');
      window.__lastExtendedCompatibilityCleanup={workersCreated:created,workersTerminated:terminated,
        activeWorkers:created-terminated,pendingRequests:pending.size,activeObjectUrls:0};
    }
  }`)
  for (const item of cases) {
    const result = await browser.evaluate(`window.__extendedCompatibility(${JSON.stringify(item)},${JSON.stringify(workerPath)})`, 300000)
    const cleanup = await browser.evaluate('window.__lastExtendedCompatibilityCleanup')
    report.rows.push({ case: item.name, iteration: item.iteration, ...result, cleanup })
    await writeFile(join(output, 'compatibility-progress.json'), JSON.stringify(report, null, 2) + '\n')
    assert.equal(result.status, 'PASS', item.name + ': ' + JSON.stringify(result))
    assert.equal(cleanup.workersCreated, cleanup.workersTerminated)
    assert.equal(cleanup.activeWorkers, 0); assert.equal(cleanup.pendingRequests, 0)
    assert(result.peakWasmBytes <= 64 * 1024 ** 2)
    console.log(item.name + ' #' + item.iteration + ': PASS (' + result.selected.length + ' hashes)')
  }
  report.secureContext = await browser.evaluate('isSecureContext')
  report.hmr = await browser.evaluate('performance.getEntriesByType("resource").some(e=>e.name.includes("/@vite/client"))')
  report.browser = await browser.evaluate('navigator.userAgent')
  report.ownership = await browser.evaluate('window.__creationProbe')
  assert.equal(report.hmr, false)
  assert.equal(report.ownership.activeWorkers, 0)
  assert.equal(report.ownership.workersCreated, report.ownership.workersTerminated)
  assert.deepEqual(browser.errors, [])
  report.passed = true
  report.maxObservedLinearMemoryBytes = Math.max(...report.rows.map(row => row.peakWasmBytes))
  report.hashChecks = report.rows.reduce((sum, row) => sum + row.selected.filter(item => item.sha256).length, 0)
  report.note = 'Observed linear memory is sampled after successful Worker operations, not whole-tab/native/OS memory. LastNative.outputBytes can be zero after native release; independent selected byte/hash checks use transferred output.'
  await writeFile(join(output, 'compatibility-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, cases: report.rows.length, hashes: report.hashChecks,
    maxObservedLinearMemoryBytes: report.maxObservedLinearMemoryBytes, report: join(output, 'compatibility-report.json') }))
} catch (error) {
  await writeFile(join(output, 'compatibility-failure.json'), JSON.stringify({ ...report, passed: false,
    error: error.stack, browserErrors: browser.errors }, null, 2) + '\n')
  throw error
} finally { await browser.close() }
