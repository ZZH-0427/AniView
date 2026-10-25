// Local acceptance tools use the installed browser and Node CDP; no downloads.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function launchBrowser(output = resolve('.tools/creation')) {
  await mkdir(output, { recursive: true })
  const profile = await mkdtemp(join(output, 'edge-profile-'))
  const browser = spawn(process.env.BROWSER_PATH ?? (process.platform === 'win32'
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/google-chrome'), [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })
  let launchError, socket, sequence = 0
  browser.on('error', error => { launchError = error })
  const pending = new Map(), errors = [], assets = [], workerEvidence = [], downloads = []
  const send = (method, params = {}, sessionId, timeoutMs = 30_000) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, timeoutMs)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const close = async () => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Browser closed')) }
    pending.clear()
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); await sleep(150); socket.close()
    }
    browser.kill()
  }
  try {
    let port
    for (let i = 0; i < 200; i++) {
      if (launchError) throw launchError
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break }
      catch { await sleep(100) }
    }
    if (!port) throw new Error('Installed browser did not expose CDP')
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    socket.onmessage = ({ data }) => {
      const event = JSON.parse(data)
      if (event.id) {
        const item = pending.get(event.id); if (!item) return
        pending.delete(event.id); clearTimeout(item.timer)
        event.error ? item.reject(new Error(JSON.stringify(event.error))) : item.resolve(event.result)
      }
      if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text)
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') errors.push(event.params.args.map(arg => arg.value).join(' '))
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'debug') {
        const text = event.params.args[0]?.value
        if (typeof text === 'string' && text.startsWith('CREATION_BITMAP_EVIDENCE:')) workerEvidence.push(JSON.parse(text.slice('CREATION_BITMAP_EVIDENCE:'.length)))
      }
      if (event.method === 'Network.responseReceived') {
        const response = event.params.response
        if (response.status >= 400) errors.push(`${response.status} ${response.url}`)
        if (/\/assets\//.test(response.url)) assets.push({ url: response.url, status: response.status })
      }
      if (event.method === 'Browser.downloadWillBegin' || event.method === 'Browser.downloadProgress') downloads.push({ type: event.method, ...event.params })
      if (event.method === 'Target.attachedToTarget') {
        const session = event.params.sessionId
        void send('Runtime.enable', {}, session)
          .then(() => send('Runtime.evaluate', { expression: `
            const evidence={created:0,closed:0,live:0,peak:0,detached:false};const live=new WeakSet();
            if(typeof createImageBitmap==='function'&&typeof ImageBitmap!=='undefined'){
              const create=createImageBitmap;globalThis.createImageBitmap=async(...args)=>{const b=await create(...args);live.add(b);evidence.created++;evidence.live++;evidence.peak=Math.max(evidence.peak,evidence.live);return b};
              const close=ImageBitmap.prototype.close;ImageBitmap.prototype.close=function(){if(live.has(this)){live.delete(this);evidence.closed++;evidence.live--}return close.call(this)};
            }
            const post=globalThis.postMessage;globalThis.postMessage=function(message,transfer){const value=post.call(this,message,transfer);if(message.type==='result'){evidence.detached=message.result.data.byteLength===0;console.debug('CREATION_BITMAP_EVIDENCE:'+JSON.stringify(evidence))}if(message.type==='error')console.debug('CREATION_BITMAP_EVIDENCE:'+JSON.stringify({...evidence,error:message.code}));return value};
          ` }, session))
          .then(() => send('Runtime.runIfWaitingForDebugger', {}, session)).catch(error => errors.push(error.message))
      }
    }
    const evaluate = async (expression, timeoutMs = 30_000) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, undefined, timeoutMs)
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    const waitFor = async (expression, timeoutMs = 30_000) => {
      const until = Date.now() + timeoutMs
      while (Date.now() < until) { if (await evaluate(expression)) return; await sleep(30) }
      throw new Error(`Timed out: ${expression}; ${await evaluate('document.body.innerText.slice(0,2500)')}`)
    }
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__creationProbe={workersCreated:0,workersTerminated:0,activeWorkers:0,peakWorkers:0,sourceTransfers:0,detachedTransfers:0,jobs:[],urlsCreated:[],urlsRevoked:[],heartbeatCount:0,maxHeartbeatGapMs:0};
      const NativeWorker=Worker;window.Worker=class extends NativeWorker{
        constructor(...args){super(...args);this.__done=false;this.__encoding=String(args[0]).includes('encoder');const t=window.__creationProbe;t.workersCreated++;t.activeWorkers++;t.peakWorkers=Math.max(t.peakWorkers,t.activeWorkers);if(this.__encoding){this.__job={progress:[],started:performance.now()};t.jobs.push(this.__job);this.addEventListener('message',e=>{const m=e.data;if(m.type==='progress')this.__job.progress.push(m.progress);if(m.type==='result')this.__job.result=m.result.metrics;if(m.type==='error')this.__job.error={code:m.code,details:m.details};});}}
        postMessage(message,...rest){const value=super.postMessage(message,...rest);if(message.type==='source'){window.__creationProbe.sourceTransfers++;if(message.data.byteLength===0)window.__creationProbe.detachedTransfers++}return value}
        terminate(){if(!this.__done){this.__done=true;window.__creationProbe.activeWorkers--;window.__creationProbe.workersTerminated++}return super.terminate()}
      };
      const createURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL;
      URL.createObjectURL=function(blob){const url=createURL.call(this,blob);window.__creationProbe.urlsCreated.push({url,bytes:blob.size,type:blob.type});return url};
      URL.revokeObjectURL=function(url){window.__creationProbe.urlsRevoked.push(url);return revokeURL.call(this,url)};
    ` })
    const inputFiles = async (selector, files) => {
      const document = await send('DOM.getDocument')
      const node = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector })
      if (!node.nodeId) throw new Error('Missing file input ' + selector)
      await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: files.map(path => resolve(path)) })
    }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`)
    const clickLabel = label => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.title||b.textContent.trim())===${JSON.stringify(label)})?.click()`)
    const navigate = async url => { await send('Page.navigate', { url }); await send('Page.bringToFront') }
    return { send, evaluate, waitFor, inputFiles, click, clickLabel, navigate, close, errors, assets, workerEvidence, downloads, profile }
  } catch (error) { await close(); throw error }
}
