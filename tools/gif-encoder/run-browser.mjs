// Isolated engineering entry with the installed browser; no browser downloads.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const output = resolve('.tools/gif-encoder')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(output, 'edge-profile-'))
const built = process.argv.includes('--built')
const port = process.env.ANIVIEW_SPIKE_PORT ?? '4199'
const host = `http://127.0.0.1:${port}`
const url = `${host}/AniView/experiments/gif-encoder/?debug=1`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(built ? ['preview', '--config', 'tools/gif-encoder/vite.config.mjs'] : []), '--host', '127.0.0.1', '--port', port, '--strictPort'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let serverError = ''
server.stderr.on('data', data => { serverError += data })
const browser = spawn(process.env.BROWSER_PATH ?? (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/google-chrome'), [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let launchError, socket
browser.on('error', error => { launchError = error })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let ready = false
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(`Vite stopped: ${serverError}`)
    try { ready = (await fetch(url)).ok } catch { /* Starting. */ }
    if (ready) break
    await sleep(100)
  }
  if (!ready) throw new Error(`Vite failed: ${serverError}`)
  let debugPort
  for (let i = 0; i < 200; i++) {
    if (launchError) throw launchError
    try { debugPort = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await sleep(100) }
  }
  if (!debugPort) throw new Error('Installed browser did not expose CDP')
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json()
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map(), errors = [], assets = [], workerEvidence = []
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(data)
    if (event.id) {
      const item = pending.get(event.id); if (!item) return
      pending.delete(event.id); clearTimeout(item.timer)
      if (event.error) item.reject(new Error(JSON.stringify(event.error))); else item.resolve(event.result)
    }
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text)
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') errors.push(event.params.args.map(arg => arg.value).join(' '))
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'debug') {
      const message = event.params.args[0]?.value
      if (typeof message === 'string' && message.startsWith('ENCODER_WORKER_EVIDENCE:')) workerEvidence.push(JSON.parse(message.slice('ENCODER_WORKER_EVIDENCE:'.length)))
    }
    if (event.method === 'Network.responseReceived') {
      if (event.params.response.status >= 400) errors.push(`${event.params.response.status} ${event.params.response.url}`)
      if (/worker|gifenc|\/assets\//.test(event.params.response.url)) assets.push({ url: event.params.response.url, status: event.params.response.status })
    }
    if (event.method === 'Target.attachedToTarget') {
      const session = event.params.sessionId
      void send('Runtime.enable', {}, session).then(() => send('Runtime.evaluate', { expression: `
        const evidence={created:0,closed:0,live:0,peak:0,detached:false};const live=new WeakSet();
        const nativeCreate=createImageBitmap;globalThis.createImageBitmap=async(...args)=>{const bitmap=await nativeCreate(...args);live.add(bitmap);evidence.created++;evidence.live++;evidence.peak=Math.max(evidence.peak,evidence.live);return bitmap};
        const nativeClose=ImageBitmap.prototype.close;ImageBitmap.prototype.close=function(){if(live.has(this)){live.delete(this);evidence.closed++;evidence.live--}return nativeClose.call(this)};
        const nativePost=globalThis.postMessage;globalThis.postMessage=function(message,transfer){const value=nativePost.call(this,message,transfer);if(message.type==='result'){evidence.detached=message.result.data.byteLength===0;console.debug('ENCODER_WORKER_EVIDENCE:'+JSON.stringify(evidence))}if(message.type==='error')console.debug('ENCODER_WORKER_EVIDENCE:'+JSON.stringify({...evidence,error:message.code}));return value};
      ` }, session)).then(() => send('Runtime.runIfWaitingForDebugger', {}, session)).catch(error => errors.push(error.message))
    }
  }
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async (expression, timeout = 30000) => {
    const until = Date.now() + timeout
    while (Date.now() < until) { if (await evaluate(expression)) return; await sleep(40) }
    throw new Error(`Timed out: ${expression}`)
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__encoderWorkers={created:0,terminated:0,active:0,peak:0,sourceTransfers:0,detachedTransfers:0};
    const NativeWorker=Worker;window.Worker=class extends NativeWorker{
      constructor(...args){super(...args);this.__done=false;const t=window.__encoderWorkers;t.created++;t.active++;t.peak=Math.max(t.peak,t.active)}
      postMessage(message,...rest){const value=super.postMessage(message,...rest);if(message.type==='source'){window.__encoderWorkers.sourceTransfers++;if(message.data.byteLength===0)window.__encoderWorkers.detachedTransfers++}return value}
      terminate(){if(!this.__done){this.__done=true;window.__encoderWorkers.active--;window.__encoderWorkers.terminated++}return super.terminate()}
    };
  ` })
  await send('Page.navigate', { url }); await send('Page.bringToFront')
  await waitFor('!!window.gifSpike')
  if (built) {
    const workloads = []
    for (const kind of ['many', 'large']) {
      console.log(`built experimental Worker: ${kind}`)
      await evaluate(`window.gifSpike.runMobile(${JSON.stringify(kind)})`)
      const workload = await evaluate("JSON.parse(document.querySelector('#result').textContent)")
      if (workload.status !== 'PASS' || workload.resources.activeWorkers !== 0) throw new Error(JSON.stringify(workload))
      workloads.push(workload)
    }
    const ownership = await evaluate('window.__encoderWorkers')
    const report = { environment: 'Installed desktop browser exercising Android-sized workloads in the separate built artifact; not real Android acceptance', workloads, ownership, workerEvidence, assets, errors }
    await writeFile(join(output, 'built-report.json'), JSON.stringify(report, null, 2))
    if (errors.length || ownership.active !== 0) throw new Error(`Built artifact errors: ${JSON.stringify(errors)}`)
    console.log(JSON.stringify({ passed: true, built: true, workloads: workloads.length, ownership, report: join(output, 'built-report.json') }))
  } else {
  // Store completion asynchronously so progress is visible even during long jobs.
  await evaluate("window.__spikeFailure=null;window.gifSpike.runDesktop().catch(error=>window.__spikeFailure=String(error));true")
  const deadline = Date.now() + 12 * 60_000; let lastPhase
  for (;;) {
    const value = await evaluate('({phase:window.gifSpike.getState().phase,done:window.gifSpike.getState().done,error:window.__spikeFailure})')
    if (value.error) throw new Error(value.error)
    if (value.phase !== lastPhase) { console.log(value.phase); lastPhase = value.phase }
    if (value.done) break
    if (Date.now() > deadline) throw new Error('Full spike exceeded 12 minutes')
    await sleep(500)
  }
  const report = await evaluate('window.gifSpike.getState().report')
  const ownership = await evaluate('window.__encoderWorkers')
  for (const artifact of report.artifacts) await writeFile(join(output, artifact.name), Buffer.from(artifact.base64, 'base64'))
  const names = report.artifacts.map(({ name }) => name)
  report.artifacts = names
  report.ownership = ownership; report.workerEvidence = workerEvidence
  if (ownership.active !== 0 || ownership.created !== ownership.terminated || ownership.sourceTransfers !== ownership.detachedTransfers) throw new Error('Worker/transfer ownership failed')
  if (workerEvidence.filter(value => !value.error).some(value => !value.detached || value.live !== 0 || value.peak > 1 || value.created !== value.closed)) throw new Error('Worker bitmap/output ownership failed')

  // Open the emitted GIF through the untouched application UI, not this harness.
  await send('Page.navigate', { url: `${host}/AniView/?debug=1` }); await send('Page.bringToFront')
  await waitFor("!!document.querySelector('[data-testid=image-input]')")
  const documentNode = await send('DOM.getDocument')
  const input = await send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '[data-testid=image-input]' })
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [join(output, 'viewer-roundtrip.gif')] })
  await waitFor("document.querySelector('[data-testid=current-frame]')?.textContent.includes('Frame 1 / 2')")
  const click = label => evaluate(`Array.from(document.querySelectorAll('button')).find(button=>(button.getAttribute('aria-label')||button.title||button.textContent.trim())===${JSON.stringify(label)})?.click()`)
  await click('Next Frame'); await waitFor("document.querySelector('[data-testid=current-frame]')?.textContent.includes('Frame 2 / 2')")
  await click('Previous Frame'); await waitFor("document.querySelector('[data-testid=current-frame]')?.textContent.includes('Frame 1 / 2')")
  await click('Play')
  const seen = []
  for (let i = 0; i < 80; i++) { seen.push(await evaluate("document.querySelector('[data-testid=current-frame]')?.textContent")); await sleep(15) }
  const compressed = seen.filter((item, index) => index === 0 || item !== seen[index - 1])
  if (compressed.length < 4) throw new Error('Viewer did not loop generated GIF')
  await click('Pause'); await click('Close')
  await waitFor("!document.querySelector('[data-testid=current-frame]')")
  report.viewerRoundtrip = { passed: true, frameChanges: compressed }
  report.errors = errors; report.assets = assets
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  if (errors.length) throw new Error(`Unexpected browser errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({ passed: true, checks: report.checks.length, qualityCases: report.quality.length, benchmarkCases: report.performance.length, ownership, workerEvidenceCount: workerEvidence.length, report: join(output, 'report.json') }))
  }
} finally {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); await sleep(150); socket.close() }
  browser.kill(); server.kill()
}
