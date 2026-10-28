// Installed-browser CDP only. Worker probes observe transfers without copying pixels.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export async function launchBrowser(output) {
  await mkdir(output, { recursive: true })
  const profile = await mkdtemp(join(output, 'edge-profile-'))
  const process = spawn(globalThis.process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })
  let socket, sequence = 0
  const pending = new Map(), errors = [], evidence = [], assets = []
  const send = (method, params = {}, sessionId, timeout = 120000) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)) }, timeout)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const close = async () => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('Browser closed')) }
    pending.clear()
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); await sleep(150); socket.close()
    }
    process.kill()
  }
  try {
    let port
    for (let i = 0; i < 150; i++) {
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break }
      catch { await sleep(100) }
    }
    if (!port) throw Error('Installed Edge unavailable')
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      if (message.id) {
        const item = pending.get(message.id); if (!item) return
        pending.delete(message.id); clearTimeout(item.timer)
        message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result)
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
      if (message.method === 'Runtime.consoleAPICalled') {
        const first = message.params.args[0]?.value
        if (typeof first === 'string' && first.startsWith('CONVERSION_PROBE:')) evidence.push(JSON.parse(first.slice(17)))
        else if (message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value).join(' '))
      }
      if (message.method === 'Network.responseReceived') {
        const response = message.params.response
        if (response.status >= 400) errors.push(`${response.status} ${response.url}`)
        if (/\.(?:wasm|js)(?:\?|$)/.test(response.url)) assets.push({ url: response.url, bytes: response.encodedDataLength, status: response.status })
      }
      if (message.method === 'Target.attachedToTarget') {
        const session = message.params.sessionId, url = message.params.targetInfo.url
        void send('Runtime.enable', {}, session).then(() => send('Runtime.evaluate', { expression: `
          (()=>{const state={created:0,closed:0,live:0,peak:0},live=new WeakSet();
          if(typeof createImageBitmap==='function'&&typeof ImageBitmap!=='undefined'){
            const create=createImageBitmap,close=ImageBitmap.prototype.close;
            self.createImageBitmap=async(...args)=>{const b=await create(...args);live.add(b);state.created++;state.live++;state.peak=Math.max(state.peak,state.live);return b};
            ImageBitmap.prototype.close=function(){if(live.has(this)){live.delete(this);state.closed++;state.live--}return close.call(this)};
          }
          const native=self.postMessage;
          self.postMessage=function(message,transfer){const buffer=message.type==='frame'?message.rgba:message.type==='result'?message.result?.data:undefined;
            const before=buffer instanceof ArrayBuffer?buffer.byteLength:0;const value=native.call(self,message,transfer);
            if(before)console.debug('CONVERSION_PROBE:'+JSON.stringify({url:${JSON.stringify(url)},type:message.type,before,detached:buffer.byteLength===0,bitmaps:{...state}}));return value};})();
        ` }, session)).then(() => send('Runtime.runIfWaitingForDebugger', {}, session)).catch(error => errors.push(error.message))
      }
    }
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__conversionTransfers={sent:0,detached:0};const NativeWorker=Worker;
      window.Worker=class extends NativeWorker{postMessage(message,...args){const b=message.type==='frame'?message.frame?.rgba:undefined;const before=b instanceof ArrayBuffer?b.byteLength:0;const result=super.postMessage(message,...args);if(before){window.__conversionTransfers.sent++;if(b.byteLength===0)window.__conversionTransfers.detached++}return result}};
    ` })
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    const waitFor = async (expression, timeout = 30000) => {
      const until = Date.now() + timeout
      while (Date.now() < until) { if (await evaluate(expression)) return; await sleep(50) }
      throw Error('Timed out: ' + expression)
    }
    return { send, evaluate, waitFor, errors, evidence, assets, close,
      navigate: async url => { await send('Page.navigate', { url }); await send('Page.bringToFront') } }
  } catch (error) { await close(); throw error }
}
