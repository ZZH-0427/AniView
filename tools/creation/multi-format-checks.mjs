// Product acceptance only. Pixel arrays below are bounded fixture oracles, never product storage.
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdtemp, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { GifReader } from 'omggif'
import { sleep } from './browser.mjs'

export async function multiFormatChecks({ browser, output, manifest, fixtureURL, clear, choose, edit, generate, check }) {
  const { evaluate, click, waitFor, inputFiles, send } = browser
  const q = id => `[data-testid="${id}"]`, group = key => manifest.groups[key].files
  const report = { outputs: [], quality: [], cancellation: [], equivalence: [], downloads: [], orientation: [], workloads: [] }
  const select = target => click(`input[name="creation-target"][value="${target}"]`)
  const state = () => evaluate(`JSON.parse(document.querySelector('${q('creation-debug')}').textContent)`)
  const href = () => evaluate(`document.querySelector('${q('creation-download')}')?.href`)
  const assetNames = await readdir(resolve('dist/assets'))
  const workerPaths = Object.fromEntries(['gif','webp','apng'].map(format => [format, '/AniView/assets/' + assetNames.find(name => name.startsWith(format + '-decoder.worker-') && name.endsWith('.js'))]))
  // Decode with AniView's real, unchanged format Workers, not native animated <img>.
  async function decode(format, location) {
    return evaluate(`(async()=>{
      const data=await(await fetch(${JSON.stringify(location)})).arrayBuffer(),worker=new Worker(${JSON.stringify(workerPaths[format])},{type:'module'});
      let id=0;const pending=new Map();worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.type==='error'?p.reject(Error(e.data.code)):p.resolve(e.data)};
      worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear()};
      const request=(type,extra={},transfer=[])=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});worker.postMessage({id:n,type,...extra},transfer)});
      try{const ready=await request('open',{data,canonicalRGBA:true},[data]),frames=[];
        for(let i=0;i<ready.metadata.frameCount;i++){const frame=await request('next');if(frame.type!=='frame')throw Error('Missing frame');frames.push({durationMs:frame.durationMs,rgba:Array.from(new Uint8Array(frame.rgba))})}
        await request('close');return{metadata:ready.metadata,frames};
      }finally{worker.terminate()}
    })()`, 120000)
  }
  async function resultBytes() {
    return Buffer.from(await evaluate(`(async()=>{const data=new Uint8Array(await(await fetch(document.querySelector('${q('creation-download')}').href)).arrayBuffer());let text='';for(let i=0;i<data.length;i+=32768)text+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(text)})()`), 'base64')
  }
  const downloads = await mkdtemp(join(output, 'multi-downloads-'))
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true })
  async function download(format, bytes) {
    const start = browser.downloads.length
    await click(q('creation-download'))
    let first
    for (let i = 0; i < 200; i++) {
      const events = browser.downloads.slice(start); first = events.find(e => e.type === 'Browser.downloadWillBegin')
      if (first && events.some(e => e.guid === first.guid && e.state === 'completed')) break
      await sleep(50)
    }
    assert(first && browser.downloads.slice(start).some(e => e.guid === first.guid && e.state === 'completed'), 'Download incomplete')
    const name = first.suggestedFilename, extension = format === 'apng' ? 'png' : format
    assert(name.endsWith('.' + extension)); assert(!report.downloads.some(row => row.name === name))
    const path = join(downloads, name); assert.deepEqual(await readFile(path), bytes)
    // Reopen the saved file's bytes in the real decoder as well.
    const reopened = await decode(format, 'data:application/octet-stream;base64,' + bytes.toString('base64'))
    assert(reopened.metadata.frameCount > 0)
    report.downloads.push({ format, name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  async function preview() {
    const original = await href()
    await click(q('creation-preview')); await waitFor("['paused','ready'].includes(document.querySelector('[data-testid=playback-state]')?.dataset.state)")
    await browser.clickLabel('Play'); await waitFor("document.querySelector('[data-testid=playback-state]').dataset.state==='playing'")
    await browser.clickLabel('Pause'); await waitFor("document.querySelector('[data-testid=playback-state]').dataset.state==='paused'")
    await browser.clickLabel('Close'); await waitFor(`!!document.querySelector('${q('creator-page')}')`)
    assert.equal(await href(), original)
    assert(await evaluate(`document.activeElement===document.querySelector('${q('creation-preview')}')`))
    assert(await evaluate(`(()=>{const r=document.querySelector('${q('creation-download')}').getBoundingClientRect();return r.top>=48&&r.bottom<=innerHeight})()`))
  }
  // True prepared-pixel reference: native orientation -> transparent max-sized canvas -> getImageData.
  async function prepared(paths) {
    return evaluate(`(async()=>{const bitmaps=[];try{
      for(const url of ${JSON.stringify(paths.map(fixtureURL))})bitmaps.push(await createImageBitmap(await(await fetch(url)).blob(),{imageOrientation:'from-image'}));
      const width=Math.max(...bitmaps.map(b=>b.width)),height=Math.max(...bitmaps.map(b=>b.height)),canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
      return{width,height,frames:bitmaps.map(bitmap=>{ctx.clearRect(0,0,width,height);ctx.drawImage(bitmap,Math.floor((width-bitmap.width)/2),Math.floor((height-bitmap.height)/2));return Array.from(ctx.getImageData(0,0,width,height).data)})};
    }finally{for(const b of bitmaps)b.close()}})()`)
  }
  function compare(actual, expected, lossless) {
    assert.equal(actual.length, expected.length)
    let total = 0, max = 0, mismatches = 0, alphaMismatches = 0, rgb = 0, semi = 0
    const histogram = new Uint32Array(256)
    for (let i = 0; i < expected.length; i += 4) {
      if (expected[i + 3] > 0 && expected[i + 3] < 255) semi++
      if (actual[i + 3] !== expected[i + 3]) alphaMismatches++
      for (let k = 0; k < 4; k++) if (actual[i + k] !== expected[i + k]) mismatches++
      for (let k = 0; k < 3; k++) { const error = Math.abs(expected[i + k] - actual[i + k]); total += error; max = Math.max(max, error); histogram[error]++; rgb++ }
    }
    let n = 0, p95 = 0; for (; p95 < 256; p95++) { n += histogram[p95]; if (n >= rgb * .95) break }
    if (lossless) { assert.equal(alphaMismatches, 0); assert.equal(mismatches, 0, 'Prepared RGBA changed') }
    return { rgbaMismatches: mismatches, alphaMismatches, semiTransparentPixels: semi, meanRgbError: total / rgb, p95RgbError: p95, maxRgbError: max }
  }
  await clear(); await choose([group('mixed-jpeg')[0], group('mixed-png')[0], group('mixed-webp')[0]], 3)
  await edit('creation-duration', 30)
  if (await evaluate("document.getElementById('creation-loop-forever').checked")) await click('#creation-loop-forever')
  await edit('creation-play-count', 2)
  const mixedPrepared = await prepared([group('mixed-jpeg')[0],group('mixed-png')[0],group('mixed-webp')[0]])
  let previous, previousBytes
  for (const format of ['gif','webp','apng']) {
    await select(format)
    if (previous) { assert.equal(await href(), previous); await download(report.outputs.at(-1).format, previousBytes) }
    const evidence = await generate(), bytes = await resultBytes(), decoded = await decode(format, await href()), snapshot = await state()
    assert.deepEqual([decoded.metadata.width,decoded.metadata.height], [32,24]); assert.equal(decoded.frames.length, 3)
    assert(decoded.frames.every(f => f.durationMs === 30)); assert.equal(decoded.metadata.loopCount, 2)
    if (format !== 'gif') decoded.frames.forEach((f,i) => compare(f.rgba, mixedPrepared.frames[i], true))
    assert.equal(snapshot.resultFormat, format); assert.equal(snapshot.inputFrames, 3); assert.equal(snapshot.outputFrames, 3)
    await preview(); await download(format, bytes); await download(format, bytes)
    report.outputs.push({ format, bytes: bytes.length, metadata: decoded.metadata, durations: decoded.frames.map(f => f.durationMs), metrics: evidence.metrics })
    previous = await href(); previousBytes = bytes
  }
  check('all three actual targets: binary readback, mixed source order/canvas/alpha, finite timing, Preview focus, distinct real saved/reopened downloads, idle target retains prior result')

  // Frozen V0.2 Worker is an independent legacy preparation/quantization/encoding reference.
  const baselineRoot = resolve(process.env.ANIVIEW_V02_SITE ?? '.tools/rc-audit/site-a1876c6')
  const baselineName = (await readdir(join(baselineRoot,'assets'))).find(n => n === 'encoder.worker-4zFLx0Cr.js')
  assert(baselineName, 'Retained V0.2 RC artifact required for legacy parity')
  const baselineBytes = await readFile(join(baselineRoot,'assets',baselineName))
  const baselineManifest = JSON.parse(await readFile('docs/research/v0.2-rc-build-manifest.json','utf8'))
  const manifestRow = baselineManifest.assets.find(row => row.path === 'assets/' + baselineName)
  assert(manifestRow); assert.equal(createHash('sha256').update(baselineBytes).digest('hex'), manifestRow.sha256)
  const baselineCopy = join(output,'fixtures','baseline-gif.worker.js'); await copyFile(join(baselineRoot,'assets',baselineName),baselineCopy)
  for (const [name, paths] of [['mixed', [group('mixed-jpeg')[0],group('mixed-png')[0],group('mixed-webp')[0]]], ['duplicates-reordered',[group('mixed-webp')[0],group('mixed-jpeg')[0],group('mixed-webp')[0],group('mixed-png')[0]]], ['EXIF-oriented',[manifest.orientation,group('mixed-png')[0]]]]) {
    await clear(); await choose(paths, paths.length); await select('gif'); await generate()
    const current = new GifReader(await resultBytes())
    const old = Buffer.from(await evaluate(`(async()=>{const data=await Promise.all(${JSON.stringify(paths.map(fixtureURL))}.map(async url=>await(await fetch(url)).arrayBuffer())),worker=new Worker(${JSON.stringify(fixtureURL(baselineCopy))},{type:'module'});
      try{return await new Promise((resolve,reject)=>{worker.onerror=e=>reject(Error(e.message));worker.onmessage=e=>{const m=e.data;if(m.type==='read'){const b=data[m.index].slice(0);worker.postMessage({id:1,type:'source',index:m.index,data:b},[b])}else if(m.type==='error')reject(Error(m.code));else if(m.type==='result'){let text='';const b=new Uint8Array(m.result.data,0,m.result.byteLength);for(let i=0;i<b.length;i+=32768)text+=String.fromCharCode(...b.subarray(i,i+32768));resolve(btoa(text))}};worker.postMessage({id:1,type:'start',sizes:data.map(d=>d.byteLength),options:{colors:256,alphaThreshold:127,frameDurationMs:30,loop:{kind:'repeat',repeats:1}},limits:{minFrames:2,maxFrames:200,maxSourceBytes:16777216,maxOutputSide:2048,maxOutputPixels:4194304,maxFramePixelWork:15360000}})})}finally{worker.terminate()}})()`), 'base64')
    const legacy = new GifReader(old)
    assert.deepEqual([current.width,current.height,current.numFrames(),current.loopCount()], [legacy.width,legacy.height,legacy.numFrames(),legacy.loopCount()])
    for (let i=0;i<legacy.numFrames();i++) { const a=new Uint8Array(current.width*current.height*4),b=new Uint8Array(a.length);current.decodeAndBlitFrameRGBA(i,a);legacy.decodeAndBlitFrameRGBA(i,b);assert.deepEqual(a,b);assert.equal(current.frameInfo(i).delay,legacy.frameInfo(i).delay) }
    report.equivalence.push({ name, frames:current.numFrames(), preparedDecodedPixelsEqual:true, legacyWorkerSha256:manifestRow.sha256 })
  }
  check('frozen V0.2 legacy Worker vs canonical GIF: decoded canvas/order/duplicates/padding/disposal/timing/loop equivalent')

  const orientedPaths=[manifest.orientation,group('mixed-png')[0]],oriented=await prepared(orientedPaths)
  assert.deepEqual([oriented.width,oriented.height],[20,40])
  await clear();await choose(orientedPaths,2)
  for(const format of ['gif','webp','apng']){
    await select(format);await generate();const decoded=await decode(format,await href())
    assert.deepEqual([decoded.metadata.width,decoded.metadata.height],[20,40])
    if(format!=='gif')decoded.frames.forEach((frame,i)=>compare(frame.rgba,oriented.frames[i],true))
    report.orientation.push({format,width:20,height:40,nativeOrientation:true,losslessPreparedPixels:format!=='gif'})
  }
  check('real EXIF orientation with mixed dimensions: all targets use the oriented maximum canvas; WebP/APNG prepared pixels exact')

  for (const kind of ['flat','gradient','high-color','semi-edge']) {
    const paths=group('quality-'+kind), reference=await prepared(paths)
    await clear(); await choose(paths,3); await edit('creation-duration',500)
    for (const format of ['gif','webp','apng']) {
      await select(format); await generate(); const decoded=await decode(format,await href())
      assert.equal(decoded.frames.reduce((n,f)=>n+f.durationMs,0),1500)
      assert(format==='webp'?decoded.frames.length>=1&&decoded.frames.length<=3:decoded.frames.length===3)
      let time=0
      const samples=[]
      for (const frame of decoded.frames) {
        const end=time+frame.durationMs
        for(let index=Math.floor(time/500);index<Math.ceil(end/500);index++)samples.push(compare(frame.rgba,reference.frames[index],format!=='gif'))
        time=end
      }
      report.quality.push({kind,format,inputFrames:3,outputFrames:decoded.frames.length,totalMs:time,scope:'all prepared pixels in every covered source frame',samples})
      await writeFile(join(output,`quality-${kind}.${format==='apng'?'png':format}`),await resultBytes())
    }
  }
  check('full prepared-pixel quality: flat/gradient/photo-like/true semi-transparent edges, direct WebP/APNG exact, WebP merge timeline retained')

  // Test-only Worker transport delays make real cancellation phases deterministic without product hooks.
  await evaluate(`(()=>{const Base=Worker;window.__multiDelay=null;window.Worker=class extends Base{
    constructor(...args){super(...args);this.__url=String(args[0]);this.__dead=false;
      if(this.__url.includes('encoder.worker-'))this.addEventListener('message',e=>{if(window.__multiDelay==='encoding'&&e.data.type==='accepted'&&!e.__replayed){e.stopImmediatePropagation();const data=e.data;setTimeout(()=>{if(!this.__dead){const event=new MessageEvent('message',{data});event.__replayed=true;this.dispatchEvent(event)}},300)}})}
    postMessage(message,...rest){if(window.__multiDelay==='verifying'&&this.__url.includes('-decoder.worker-')&&message.type==='next'){setTimeout(()=>{if(!this.__dead)super.postMessage(message,...rest)},300);return}return super.postMessage(message,...rest)}
    terminate(){this.__dead=true;return super.terminate()}
  };const read=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){const b=await read.call(this);if(window.__multiDelay==='preparing')await new Promise(r=>setTimeout(r,300));return b};})()`)
  await clear(); await choose(group('large-10'),10)
  for (const format of ['gif','webp','apng']) for (const phase of ['preparing','encoding','verifying']) {
    await select(format); const old=await href(); await evaluate(`window.__multiDelay=${JSON.stringify(phase)}`)
    await click(q('creation-generate'))
    await waitFor(`JSON.parse(document.querySelector('${q('creation-debug')}').textContent).status===${JSON.stringify(phase)}`,120000)
    await click(q('creation-cancel')); await waitFor(`JSON.parse(document.querySelector('${q('creation-debug')}').textContent).status==='cancelled'`,30000)
    assert.equal(await href(),old);assert.equal(await evaluate(`document.querySelectorAll('${q('creation-source-row')}').length`),10)
    await evaluate('window.__multiDelay=null'); await generate()
    const diagnostic=(await state()).diagnostics
    for(const key of ['activeSourceWorkers','activeEncoderWorkers','activeValidationDecoderWorkers','activeInspectionWorkers','activeBitmaps','activeCanvases','activeImageData','ownedRgba','awaitingAck','cleanupErrors'])assert.equal(diagnostic[key],0,key)
    report.cancellation.push({format,phase,rerun:true,previousResultRetained:true,cleanup:diagnostic})
  }
  check('all targets cancel during preparing/encoder acceptance/real decoder checking, joined cleanup, previous result and inputs retained, rerun succeeds')

  for(const format of ['webp','apng'])for(const [name,paths,reject] of [
    ['200x320x240',group('small-200'),false],['10x1024x1024',group('large-10'),false],
    ['3x2048x2048',group('boundary-4').slice(0,3),false],['4x2048x2048',group('boundary-4'),true],
  ]){
    await clear();await choose(paths,paths.length);await select(format)
    const evidence=await generate({expectError:reject})
    if(reject){assert.equal(await href(),undefined);assert.equal(evidence.job,undefined)}
    else{assert.equal(evidence.metrics.frameCount,paths.length);assert.equal(evidence.metrics.peakRgbaFrames,1)}
    report.workloads.push({format,name,rejected:reject,...evidence})
  }
  check('WebP/APNG preserve 200-frame and combined canvas workload limits, including rejection of four 2048-square inputs before encoder creation')
  await clear();await choose(group('mixed-png').concat(group('mixed-webp')),2);await select('webp');await generate()
  await select('webp'); const original=await href()
  await evaluate(`(()=>{const n=document.querySelector('[data-testid=locale-switcher]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(n,'zh-CN');n.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  assert.equal(await href(),original);assert(await evaluate("document.body.innerText.includes('输出格式')"))
  await evaluate(`(()=>{const n=document.querySelector('[data-testid=locale-switcher]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(n,'en');n.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  assert.equal(await href(),original)
  check('live EN/ZH target UI changes preserve existing result, settings and sources')
  for(const row of report.downloads)assert.equal(createHash('sha256').update(await readFile(join(downloads,row.name))).digest('hex'),row.sha256)
  return report
}
