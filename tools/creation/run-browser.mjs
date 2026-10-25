// Exercises the actual product UI and saved GIFs with an installed Edge browser.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { GifReader } from 'omggif'
import { launchBrowser, sleep } from './browser.mjs'
import { generateFixtures } from './generate-fixtures.mjs'

const output = resolve('.tools/creation'), port = process.env.ANIVIEW_CREATION_PORT ?? '4201'
const host = `http://127.0.0.1:${port}`, url = `${host}/AniView/`
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['tools/creation/preview.mjs', '--host', '127.0.0.1', '--port', port], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let serverError = '', browser
server.stderr.on('data', value => { serverError += value })
const checks = [], workloads = [], quality = []
const check = (name, detail) => { checks.push({ name, ...(detail === undefined ? {} : { detail }) }); console.log(name) }
const selector = name => `[data-testid="${name}"]`
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Product preview stopped: ' + serverError)
    try { ready = (await fetch(url)).ok } catch { /* Starting only. */ }
    if (ready) break
    await sleep(100)
  }
  assert(ready, 'Product preview failed')
  browser = await launchBrowser(output)
  const { evaluate, waitFor, click, clickLabel, inputFiles, send } = browser
  const rowCount = () => evaluate(`document.querySelectorAll('${selector('creation-source-row')}').length`)
  const rows = () => evaluate(`Array.from(document.querySelectorAll('${selector('creation-source-row')}')).map(row=>({id:row.dataset.sourceId,name:row.querySelector('[title]')?.title,text:row.textContent}))`)
  const debug = () => evaluate(`JSON.parse(document.querySelector('${selector('creation-debug')}').textContent)`)
  const resultUrl = () => evaluate(`document.querySelector('${selector('creation-download')}')?.href??null`)
  const edit = (id, value) => evaluate(`(()=>{const field=document.getElementById(${JSON.stringify(id)});field.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(String(value))});field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));field.blur();})()`)
  const settled = () => waitFor(`!document.querySelector('${selector('creation-input')}').disabled`, 60_000)
  const choose = async (paths, expectedCount) => {
    await inputFiles(selector('creation-input'), paths); await settled()
    if (expectedCount !== undefined) assert.equal(await rowCount(), expectedCount)
  }
  const clear = async () => {
    if (!await rowCount()) return
    await evaluate("document.querySelector('.creator-more').open=true")
    await click(selector('creation-clear')); await waitFor(`document.querySelectorAll('${selector('creation-source-row')}').length===0`)
    assert.equal(await resultUrl(), null)
  }
  const generate = async ({ expectError = false } = {}) => {
    const old = await resultUrl(), start = performance.now()
    await evaluate(`window.__creationProbe.heartbeatCount=0;window.__creationProbe.maxHeartbeatGapMs=0;window.__creationBeat=performance.now();window.__creationTimer=setInterval(()=>{const now=performance.now();window.__creationProbe.heartbeatCount++;window.__creationProbe.maxHeartbeatGapMs=Math.max(window.__creationProbe.maxHeartbeatGapMs,now-window.__creationBeat);window.__creationBeat=now;},16)`)
    await click(selector('creation-generate'))
    if (expectError) await waitFor(`!!document.querySelector('${selector('creation-error')}')`, 60_000)
    else await waitFor(`document.querySelector('${selector('creation-status')}')?.textContent==='GIF generated'&&document.querySelector('${selector('creation-download')}')?.href!==${JSON.stringify(old)}`, 60_000)
    await evaluate('clearInterval(window.__creationTimer)')
    await settled()
    const evidence = await evaluate('({heartbeatCount:window.__creationProbe.heartbeatCount,maxHeartbeatGapMs:window.__creationProbe.maxHeartbeatGapMs,job:window.__creationProbe.jobs.at(-1),activeWorkers:window.__creationProbe.activeWorkers})')
    evidence.wallMs = performance.now() - start
    assert.equal(evidence.activeWorkers, 0)
    if (expectError) evidence.error = await evaluate(`document.querySelector('${selector('creation-error')}').textContent`)
    else {
      const state = await debug(); evidence.metrics = state.metrics
      assert.equal(state.metrics.peakRgbaFrames, 1); assert.equal(state.metrics.peakBitmaps, 1)
      const progress = evidence.job.progress
      assert(progress.length, 'No Worker progress reached product')
      assert(progress.every((p, i) => p.currentFrame <= p.totalFrames && (i === 0 || p.completedWork >= progress[i - 1].completedWork)), 'Progress regressed')
    }
    return evidence
  }
  const saveResult = async name => {
    const base64 = await evaluate(`(async()=>{const blob=await(await fetch(document.querySelector('${selector('creation-download')}').href)).blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)})})()`)
    const bytes = Buffer.from(base64, 'base64'); await writeFile(join(output, name), bytes)
    assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a')
    const gif = new GifReader(bytes)
    return { bytes, gif, width: gif.width, height: gif.height, frames: gif.numFrames(), delays: Array.from({ length: gif.numFrames() }, (_, i) => gif.frameInfo(i).delay * 10), repeat: gif.loopCount() }
  }
  const preview = async expected => {
    await click(selector('creation-preview')); await waitFor(`document.querySelector('[data-testid=current-frame]')?.textContent.includes('Frame 1 / ${expected}')`)
    await clickLabel('Next Frame'); await waitFor("document.querySelector('[data-testid=current-frame]')?.textContent.includes('Frame 2 /')")
    await clickLabel('Previous Frame'); await waitFor("document.querySelector('[data-testid=current-frame]')?.textContent.includes('Frame 1 /')")
    await clickLabel('Play'); await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='playing'")
    await clickLabel('Pause'); await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
    await clickLabel('Close')
    await waitFor(`!!document.querySelector('${selector('creator-page')}')`)
  }

  await browser.navigate(url); await waitFor(`!!document.querySelector('${selector('create-gif-entry')}')`)
  const initialAssets = [...browser.assets]
  assert(!initialAssets.some(asset => /creator|create.?gif|encoder/i.test(asset.url)), 'Creator downloaded during ordinary startup')
  await click(selector('create-gif-entry')); await waitFor(`!!document.querySelector('${selector('creator-page')}')`)
  assert.equal(await evaluate("document.querySelectorAll('[data-testid=diagnostics-panel]').length"), 0)
  assert.equal(await evaluate(`document.querySelector('${selector('creation-generate')}').disabled`), true)
  assert.deepEqual(await evaluate(`(()=>{const f=document.querySelector('${selector('creation-input')}');return{accept:f.accept,multiple:f.multiple,capture:f.hasAttribute('capture')}})()`), { accept: 'image/*', multiple: true, capture: false })
  check('normal startup lazy loading, secondary Creator entry, empty state and input policy')

  await browser.navigate(url + '?debug=1'); await waitFor(`!!document.querySelector('${selector('create-gif-entry')}')`)
  await click(selector('create-gif-entry')); await waitFor(`!!document.querySelector('${selector('creator-page')}')`)
  assert(await evaluate("Array.from(document.querySelectorAll('details')).filter(d=>d.querySelector('[data-testid=creation-debug]')).every(d=>!d.open)"))
  const manifest = await generateFixtures(evaluate, output)
  const group = key => manifest.groups[key].files
  const jpeg = group('mixed-jpeg')[0], png = group('mixed-png')[0], webp = group('mixed-webp')[0]
  await choose([jpeg], 1); assert.equal(await evaluate(`document.querySelector('${selector('creation-generate')}').disabled`), true)
  await choose([png], 2); await choose([jpeg], 3); await choose([webp], 4)
  assert.equal(new Set((await rows()).map(row => row.id)).size, 4)
  await click(`${selector('creation-source-row')}:nth-child(1) [data-action=down]`)
  await click(`${selector('creation-source-row')}:nth-child(3) [data-action=remove]`)
  await click(`${selector('creation-source-row')}:nth-child(2) [data-action=up]`)
  assert.deepEqual((await rows()).map(row => row.name), [jpeg,png,webp].map(path => path.split(/[\\/]/).at(-1)))
  check('append, add more, duplicate frames, Move Up/Down and Remove preserve exact order')

  const fixtureURL = path => host + '/AniView/validation/creation/' + relative(output, path).split('\\').join('/')
  await evaluate(`(async()=>{const blob=await(await fetch(${JSON.stringify(fixtureURL(jpeg))})).blob();const dt=new DataTransfer();dt.items.add(new File([blob],'dropped-original.jpg',{type:'image/jpeg'}));window.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`)
  await settled(); assert.equal(await rowCount(), 4)
  await click(`${selector('creation-source-row')}:nth-child(4) [data-action=remove]`)
  await evaluate("(()=>{const dt=new DataTransfer();dt.setData('text/uri-list','https://example.invalid/not-a-source');window.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()")
  assert.equal(await rowCount(), 3)
  check('desktop file-only drop appends; URL/text drops do not navigate or add frames')

  assert.equal(await evaluate("document.getElementById('creation-duration').value"), '500')
  await edit('creation-duration', 27); assert.equal(await evaluate("document.getElementById('creation-duration').value"), '30')
  await click('#creation-loop-forever'); await edit('creation-play-count', 2)
  assert(await evaluate("Array.from(document.querySelectorAll('.creator-fields input')).every(input=>input.labels?.length>0)"), 'Creation fields need associated labels')
  const firstEvidence = await generate(), first = await saveResult('mixed-product.gif')
  assert.deepEqual([first.width, first.height, first.frames], [32,24,3]); assert(first.delays.every(ms => ms === 30)); assert.equal(first.repeat, 1)
  const solidPixels = new Uint8Array(32 * 24 * 4); first.gif.decodeAndBlitFrameRGBA(0, solidPixels)
  assert(solidPixels[0] > 180 && solidPixels[1] < 80 && solidPixels[3] === 255, 'Source order: JPEG first')
  const transparentPixels = new Uint8Array(32 * 24 * 4); first.gif.decodeAndBlitFrameRGBA(1, transparentPixels)
  const alphaAt = (x, y) => transparentPixels[(y * 32 + x) * 4 + 3]
  assert.equal(alphaAt(0,0), 0); assert.equal(alphaAt(9,6), 0); assert.equal(alphaAt(10,6), 255)
  assert(transparentPixels[(6 * 32 + 10) * 4 + 1] > 150, 'Source order: centered transparent PNG second')
  assert.equal(first.gif.frameInfo(1).disposal, 2)
  const firstURL = await resultUrl()
  await preview(3); assert.equal(await rowCount(), 3); assert.equal(await resultUrl(), firstURL)
  assert.equal(await evaluate("document.getElementById('creation-duration').value"), '30')
  assert.equal(await evaluate("document.getElementById('creation-play-count').value"), '2')
  check('Generate real progress/result metadata; Preview uses existing Viewer and preserves creation state', firstEvidence)

  const downloads = await mkdtemp(join(output, 'downloads-'))
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true })
  await click(selector('creation-download'))
  const until = Date.now() + 10_000
  while (Date.now() < until && !browser.downloads.some(event => event.state === 'completed')) await sleep(50)
  const downloaded = await readFile(join(downloads, 'aniview-animation.gif'))
  assert.deepEqual(downloaded, first.bytes)
  check('actual browser Download GIF saves aniview-animation.gif with exact generated bytes')

  await edit('creation-play-count', 1); await edit('creation-duration', 20)
  await generate(); const once = await saveResult('play-once.gif'); assert.equal(once.repeat, null); assert(once.delays.every(ms => ms === 20))
  assert(await evaluate(`window.__creationProbe.urlsRevoked.includes(${JSON.stringify(firstURL)})`))
  await click('#creation-loop-forever'); await edit('creation-duration', 10000)
  await generate(); const forever = await saveResult('forever.gif'); assert.equal(forever.repeat, 0); assert(forever.delays.every(ms => ms === 10000))
  await edit('creation-duration', 19); assert.equal(await evaluate(`document.querySelector('${selector('creation-generate')}').disabled`), true)
  await edit('creation-duration', 100)
  check('20/10000 ms boundaries, 10 ms normalization, invalid duration, once/finite/infinite loops and replacement URL revocation')

  await clear(); await choose([manifest.longFilename, png], 2)
  for (const width of [320,390,768,1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: false })
    await sleep(50)
    const layout = await evaluate(`(()=>{const root=document.querySelector('${selector('creator-page')}');return{overflow:document.documentElement.scrollWidth>innerWidth,targets:Array.from(root.querySelectorAll('button,a.creator-download,summary')).filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return{label:n.getAttribute('aria-label')||n.title||n.textContent.trim(),width:r.width,height:r.height}}),rows:Array.from(root.querySelectorAll('.creator-source-row')).map(row=>{const f=row.querySelector('.creator-filename').getBoundingClientRect(),a=row.querySelector('.creator-row-actions').getBoundingClientRect();return{overlap:f.right>a.left+.5}})}})()`)
    assert.equal(layout.overflow, false, `Horizontal overflow ${width}`)
    assert(!layout.rows.some(row => row.overlap), `Filename/action overlap ${width}`)
    assert(!layout.targets.some(target => target.width < 43.9 || target.height < 43.9), `Small touch target ${width}: ${JSON.stringify(layout.targets)}`)
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(join(output, `creation-${width}.png`), Buffer.from(screenshot.data, 'base64'))
  }
  await send('Emulation.clearDeviceMetricsOverride')
  check('320/390/768/1280 layouts, long filenames, associated labels and 44px targets')

  await clear(); await choose(group('small-201'), 200)
  assert.match(await evaluate(`document.querySelector('${selector('creation-notice')}').textContent`), /1 image.*not added|200/i)
  assert(await evaluate("(()=>{const n=document.querySelector('[data-testid=creation-source-list]');return n.scrollHeight>n.clientHeight&&getComputedStyle(n).overflowY!=='visible'})()"))
  check('200-source admission, explicit extra-source rejection and bounded scrolling source list')

  for (const [name, files, expected] of [
    ['200×320×240', group('small-200'), 'success'], ['10×1024²', group('large-10'), 'success'],
    ['2×2048²', group('boundary-4').slice(0,2), 'success'], ['3×2048²', group('boundary-4').slice(0,3), 'success'],
    ['4×2048²', group('boundary-4'), 'reject'],
  ]) {
    await clear(); await choose(files, files.length)
    const evidence = await generate({ expectError: expected === 'reject' })
    if (expected === 'reject') {
      assert.match(evidence.error, /too large|15,360,000|smaller images/i)
      assert(!evidence.job.progress.some(progress => ['quantizing','encoding'].includes(progress.phase)), 'Workload rejection began encoding')
      assert.equal(await resultUrl(), null)
    } else {
      assert.equal(evidence.metrics.frameCount, files.length)
      assert(evidence.heartbeatCount > 0 && evidence.maxHeartbeatGapMs < 250, 'Main thread stopped responding')
    }
    workloads.push({ name, outcome: expected, ...evidence }); check(`product workload ${name}: ${expected}`)
  }

  await clear(); await choose(group('side-too-large'), 2)
  const side = await generate({ expectError: true }); assert.match(side.error, /2048|2049/)
  assert(!side.job.progress.some(p => ['quantizing','encoding'].includes(p.phase)))
  await clear(); await choose([manifest.corruptPNG, jpeg], 2)
  const corrupt = await generate({ expectError: true }); assert.match(corrupt.error, /corrupt|decode/i)
  await clear(); await choose([manifest.oversizedSource,jpeg], 1)
  assert.match(await evaluate(`document.querySelector('${selector('creation-notice')}').textContent`), /16 MiB/i)
  await clear(); await choose([resolve('tests/fixtures/gif/previous.gif'), resolve('tests/fixtures/apng/full-infinite.png'), resolve('tests/fixtures/validation/viewer/long.webp')], 0)
  assert.match(await evaluate(`document.querySelector('${selector('creation-notice')}').textContent`), /static JPEG, PNG and WebP/i)
  await choose([manifest.wrongExtension, jpeg], 2); await generate()
  check('controlled side/workload/corrupt/animated-source errors, wrong extension and later successful recovery')

  // Hold the actual Blob source read, so the real product UI has time to cancel.
  await clear(); await choose(group('large-10'), 10)
  await evaluate(`(()=>{window.__holdCreationSource=true;const read=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){const value=await read.call(this);if(window.__holdCreationSource){await new Promise(resolve=>setTimeout(resolve,250));}return value};})()`)
  await click(selector('creation-generate')); await waitFor(`!!document.querySelector('${selector('creation-cancel')}')`)
  await click(selector('creation-cancel')); await waitFor(`document.querySelector('${selector('creation-status')}').textContent==='Generation cancelled'`)
  assert.equal(await rowCount(), 10); assert.equal(await resultUrl(), null)
  await evaluate('window.__holdCreationSource=false')
  await generate(); check('real UI Generate → Cancel → Generate again succeeds without losing sources/settings')

  for (const kind of ['flat','gradient','high-color']) {
    await clear(); await choose(group('quality-' + kind), 3)
    const evidence = await generate(), encoded = await saveResult(`quality-${kind}.gif`)
    const rgba = new Uint8Array(encoded.width * encoded.height * 4); encoded.gif.decodeAndBlitFrameRGBA(0, rgba)
    const comparison = await evaluate(`(async()=>{const bitmap=await createImageBitmap(await(await fetch(${JSON.stringify(fixtureURL(group('quality-' + kind)[0]))})).blob());const w=bitmap.width,h=bitmap.height,c=new OffscreenCanvas(w*2,h),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const expected=ctx.getImageData(0,0,w,h).data,actual=Uint8Array.from(atob(${JSON.stringify(Buffer.from(rgba).toString('base64'))}),c=>c.charCodeAt(0));let sum=0,max=0,samples=0;const hist=new Uint32Array(256);for(let i=0;i<expected.length;i+=4)for(let k=0;k<3;k++){const e=Math.abs(expected[i+k]-actual[i+k]);sum+=e;max=Math.max(max,e);hist[e]++;samples++}let p95=0,n=0;for(;p95<256;p95++){n+=hist[p95];if(n>=samples*.95)break}ctx.putImageData(new ImageData(new Uint8ClampedArray(actual),w,h),w,0);const blob=await c.convertToBlob({type:'image/png'});const base64=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(blob)});return{mae:sum/samples,p95,max,base64}})()`)
    await writeFile(join(output, `quality-${kind}-source-vs-gif.png`), Buffer.from(comparison.base64, 'base64'))
    delete comparison.base64; quality.push({ kind, ...comparison, metrics: evidence.metrics })
  }
  check('flat/gradient/high-color quality through product path; comparison artifacts saved')

  const finalURL = await resultUrl(); await click(selector('creation-back'))
  await waitFor(`!!document.querySelector('${selector('create-gif-entry')}')`)
  assert(await evaluate(`window.__creationProbe.urlsRevoked.includes(${JSON.stringify(finalURL)})`))
  await click(selector('create-gif-entry')); await waitFor(`!!document.querySelector('${selector('creator-page')}')`)
  await choose(group('large-10'), 10); await evaluate('window.__holdCreationSource=true')
  await click(selector('creation-generate')); await waitFor(`!!document.querySelector('${selector('creation-cancel')}')`)
  await click(selector('creation-back')); await waitFor(`!!document.querySelector('${selector('create-gif-entry')}')`)
  await waitFor('window.__creationProbe.activeWorkers===0'); await evaluate('window.__holdCreationSource=false')
  check('Back during generation cancels Worker and returns to ordinary Viewer input without an overlay')
  const ownership = await evaluate('window.__creationProbe')
  assert.equal(ownership.activeWorkers, 0); assert.equal(ownership.workersCreated, ownership.workersTerminated)
  assert.equal(ownership.sourceTransfers, ownership.detachedTransfers)
  assert(ownership.urlsCreated.every(item => ownership.urlsRevoked.includes(item.url)), 'Result URL leaked')
  for (const evidence of browser.workerEvidence.filter(item => !item.error)) {
    assert.equal(evidence.live, 0); assert.equal(evidence.created, evidence.closed); assert(evidence.peak <= 1); assert.equal(evidence.detached, true)
  }
  check('leaving Creator releases result URLs and all Workers; encoded transfers detached; native bitmaps closed')
  const report = { passed: true, browser: await evaluate('navigator.userAgent'), checks, workloads, quality, ownership, workerEvidence: browser.workerEvidence,
    downloads: browser.downloads, startupAssets: initialAssets, assets: browser.assets, errors: browser.errors, fixtures: manifest.archives }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  assert.deepEqual(browser.errors, [])
  console.log(JSON.stringify({ passed: true, checks: checks.length, workloads: workloads.length, quality: quality.length, report: join(output, 'report.json') }))
} finally { await browser?.close(); server.kill() }
