// Real browser integration, separate from Vitest. No browser/package downloads.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const url = process.argv[2]
const fixture = resolve(process.argv[3] ?? '.tools/fixtures/animated.webp')
if (!url) throw new Error('Usage: node tools/webp-wasm/browser-check.mjs <spike-url> [animated.webp]')
const output = join(root, '.tools', 'browser-results')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(output, 'profile-'))
const browser = spawn(process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let port
  for (let i = 0; i < 200; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break }
    catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  if (!port) throw new Error('Edge debugger did not start')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 0
  const requests = new Map()
  const errors = []
  const assets = []
  const frameTransfers = []
  const bitmapCounts = []
  let workerTargets = 0
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(data)
    if (event.method === 'Target.attachedToTarget') {
      workerTargets++
      const session = event.params.sessionId
      void send('Network.enable', {}, session)
        .then(() => send('Runtime.enable', {}, session))
        .then(() => send('Runtime.evaluate', { expression: `
          const liveBitmaps=new Set();let peakBitmaps=0;
          if(typeof createImageBitmap==='function'&&typeof ImageBitmap!=='undefined'){
            const create=globalThis.createImageBitmap;
            globalThis.createImageBitmap=async function(...args){
              const bitmap=await create.apply(this,args);liveBitmaps.add(bitmap);peakBitmaps=Math.max(peakBitmaps,liveBitmaps.size);return bitmap;
            };
            const close=ImageBitmap.prototype.close;
            ImageBitmap.prototype.close=function(){liveBitmaps.delete(this);return close.call(this);};
          }
          const originalPostMessage=globalThis.postMessage;
          globalThis.postMessage=function(message,options){
            const result=originalPostMessage.call(this,message,options);
            if(message.type==='frame') console.debug('ANIVIEW_FRAME_DETACHED:'+message.rgba.byteLength);
            if(message.type==='frame'&&message.liveBitmaps!==undefined)console.debug('ANIVIEW_BITMAP_COUNTS:'+liveBitmaps.size+':'+peakBitmaps);
            return result;
          };
        ` }, session))
        .then(() => send('Runtime.runIfWaitingForDebugger', {}, session))
        .catch(error => errors.push(error.message))
    }
    if (event.id) {
      const pending = requests.get(event.id)
      requests.delete(event.id)
      if (event.error) pending.reject(new Error(JSON.stringify(event.error)))
      else pending.resolve(event.result)
    }
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text)
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') errors.push('console.error')
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'debug') {
      const text = event.params.args[0]?.value
      if (typeof text === 'string' && text.startsWith('ANIVIEW_FRAME_DETACHED:')) frameTransfers.push(text === 'ANIVIEW_FRAME_DETACHED:0')
      if (typeof text === 'string' && text.startsWith('ANIVIEW_BITMAP_COUNTS:')) {
        const [, live, peak] = text.split(':')
        bitmapCounts.push({ live: Number(live), peak: Number(peak) })
      }
    }
    if (event.method === 'Network.responseReceived') {
      const response = event.params.response
      if (response.status >= 400) errors.push(`${response.status} ${response.url}`)
      if (/wasm|worker/i.test(response.url)) assets.push({ url: response.url, status: response.status })
    }
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId
    requests.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 250; i++) {
      if (await evaluate(expression)) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out: ${expression}; ${await evaluate('document.body.innerText')}`)
  }
  const click = label => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)})?.click()`)
  const select = async path => {
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
    await send('DOM.setFileInputFiles', { nodeId, files: [path] })
    await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Open File'&&!b.disabled)`)
  }
  await send('Page.enable')
  await send('Page.bringToFront')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
  // Observe actual input ownership transfer without exposing file content remotely.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__inputTransfers=[];
    window.__decoderEvents=[];
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,transfer){
      if(!this.__aniviewObserved){
        this.__aniviewObserved=true;
        this.addEventListener('message',event=>{
          const m=event.data;
          if(m.type==='ready'||m.type==='frame') window.__decoderEvents.push({
            receivedAt:performance.now(),
            type:m.type,frameIndex:m.frameIndex,readyMs:m.readyMs,decodeMs:m.decodeMs,durationMs:m.durationMs,
            liveBitmaps:m.liveBitmaps,backupBytes:m.backupBytes,metadata:m.metadata,
            pixels:m.rgba?.byteLength<=512?Array.from(new Uint8Array(m.rgba)):undefined
          });
        });
      }
      const result=original.call(this,message,transfer);
      if(message.type==='open') window.__inputTransfers.push(message.data.byteLength===0);
      return result;
    };
  ` })
  await send('Page.navigate', { url })
  if (new URL(url).searchParams.get('spike') !== 'webp') {
    const largeMode = process.argv[4] === 'apng-large'
    const apngMode = largeMode || process.argv[4] === 'apng'
    const gifMode = process.argv[4] === 'gif'
    const run = gifMode ? (await import('../gif-scenario.mjs')).runGIFCheck : largeMode ? (await import('../apng/large-frame-scenario.mjs')).runLargeAPNGCheck
      : apngMode ? (await import('../apng/browser-scenario.mjs')).runAPNGCheck : (await import('../playback/browser-scenario.mjs')).runViewerCheck
    const report = await run({ send, evaluate, waitFor, click, fixture, url, capture: async width => {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(output, `${gifMode ? 'gif' : largeMode ? 'apng-large' : apngMode ? 'apng' : 'viewer'}-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    } })
    if (frameTransfers.length < 10 || frameTransfers.some(detached => !detached)) throw new Error('Viewer RGBA ownership was not transferred')
    if (!(await evaluate('window.__inputTransfers')).every(Boolean)) throw new Error('Viewer input ownership was not transferred')
    if (!apngMode && !gifMode && !assets.some(asset => new URL(asset.url).pathname.endsWith('.wasm') && asset.status === 200)) throw new Error('Viewer WASM did not load')
    if (gifMode && !assets.some(asset => /gif-decoder\.worker/.test(asset.url) && asset.status === 200)) throw new Error('GIF Worker did not load')
    if (apngMode && (!bitmapCounts.length || bitmapCounts.some(count => count.live !== 0 || count.peak !== 1))) throw new Error('APNG ImageBitmaps accumulated')
    if (errors.length) throw new Error(JSON.stringify(errors))
    const ownership = { framesObserved: bitmapCounts.length, peakLiveBitmaps: Math.max(0, ...bitmapCounts.map(count => count.peak)), liveBitmapsAfterEmit: Math.max(0, ...bitmapCounts.map(count => count.live)) }
    await writeFile(join(output, gifMode ? 'gif-report.json' : largeMode ? 'apng-large-report.json' : apngMode ? 'apng-report.json' : 'viewer-report.json'), JSON.stringify({ ...report, assets, frameTransfers: frameTransfers.length, ownership }, null, 2))
    console.log(JSON.stringify({ ...report, assets, frameTransfers: frameTransfers.length, ownership }, null, 2))
    await send('Browser.close')
  } else {
  await waitFor("document.querySelector('h1')?.textContent==='Animated WebP technical spike'")
  await select(fixture)
  await click('Open File')
  await waitFor("document.querySelector('[data-testid=worker-status]')?.textContent==='Worker status: ready'")
  const diagnostic = async () => evaluate(`(() => {
    const read=id=>document.querySelector('[data-testid='+id+']').textContent;
    return Object.fromEntries(['dimensions','frame-count','loop-count','frame-index','duration','ready-ms','wasm-ms','decode-ms','delivery-ms','heap-bytes'].map(id=>[id,read(id)]));
  })()`)
  const metadata = await diagnostic()
  if (Number(metadata['frame-count']) <= 1) throw new Error('Fixture is not animated')
  const canvasHash = () => evaluate(`(() => {
    const c=document.querySelector('canvas'), pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let hash=2166136261;
    for(const byte of pixels) hash=Math.imul(hash^byte,16777619);
    return hash>>>0;
  })()`)
  const frameMetrics = [] // Only tiny numeric metrics/hashes, never decoded frames.
  for (let i = 1; i <= 5; i++) {
    await click('Start / Decode next')
    await waitFor(`document.querySelector('[data-testid=frame-index]')?.textContent==='${i}'`)
    const info = await diagnostic()
    if (Number(info.duration) <= 0) throw new Error('Unexpected non-positive sample duration')
    frameMetrics.push({ index: i, durationMs: Number(info.duration), decodeMs: Number(info['decode-ms']), deliveryMs: Number(info['delivery-ms']), hash: await canvasHash() })
  }
  if (new Set(frameMetrics.map(frame=>frame.hash)).size < 2) throw new Error('Canvas did not change')
  await click('Reset')
  await waitFor("document.querySelector('[data-testid=frame-index]')?.textContent==='—'")
  await click('Start / Decode next')
  await waitFor("document.querySelector('[data-testid=frame-index]')?.textContent==='1'")
  if (await canvasHash() !== frameMetrics[0].hash) throw new Error('Reset did not reproduce frame 1')
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
    if (await evaluate('document.documentElement.scrollWidth>innerWidth')) throw new Error('Horizontal overflow')
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(output, `webp-${width}.png`), Buffer.from(screenshot.data, 'base64'))
  }
  await click('Close')
  await waitFor("document.querySelector('[data-testid=worker-status]')?.textContent==='Worker status: closed'")
  const corrupt = join(output, 'corrupt.webp')
  await writeFile(corrupt, 'Not a WebP file')
  await select(corrupt)
  await click('Open File')
  await waitFor("document.querySelector('[data-testid=error]')?.textContent.includes('CORRUPTED_FILE')")
  await click('Close')
  await select(fixture)
  await click('Open File')
  await waitFor("document.querySelector('[data-testid=worker-status]')?.textContent==='Worker status: ready'")
  await click('Start / Decode next')
  await waitFor("document.querySelector('[data-testid=frame-index]')?.textContent==='1'")
  await click('Close')
  await waitFor("document.querySelector('[data-testid=worker-status]')?.textContent==='Worker status: closed'")
  const transferred = await evaluate('window.__inputTransfers')
  if (transferred.length < 3 || transferred.some(detached=>!detached)) throw new Error('Input ownership was not transferred')
  if (workerTargets < 3 || frameTransfers.length < 7 || frameTransfers.some(detached=>!detached)) throw new Error('Worker RGBA ownership was not transferred')
  if (!assets.some(asset=>new URL(asset.url).pathname.endsWith('.wasm')&&!asset.url.includes('import')&&asset.status===200)) throw new Error('No successful WASM network response observed')
  if (errors.length) throw new Error(JSON.stringify(errors))
  const report = { url, userAgent: await evaluate('navigator.userAgent'), fixtureBytes: (await readFile(fixture)).length, metadata, frameMetrics, transferred, frameTransfers, workerTargets, assets,
    passed: ['real animated decoding', 'changing canvas', 'reset equals frame 1', 'close', 'corrupt input', 'reopen after failure', 'phone/desktop layout', 'input transfer', 'no page errors'] }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await send('Browser.close')
  }
} finally {
  socket?.close()
  browser.kill()
}
