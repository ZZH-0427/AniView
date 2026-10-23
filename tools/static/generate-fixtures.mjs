// Original colored quadrants, encoded by the installed browser; no downloads/deps.
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const folder = resolve('tests/fixtures/static')
const output = resolve('.tools/browser-results')
await mkdir(folder, { recursive: true }); await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(output, 'static-generator-'))
const browser = spawn(process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let port
  for (let i = 0; i < 200; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break }
    catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  if (!port) throw new Error('Installed Edge did not start')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  const requests = new Map(); let next = 0
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data)
    if (response.id) { const pending = requests.get(response.id); requests.delete(response.id); response.error ? pending.reject(response.error) : pending.resolve(response.result) }
  }
  const send = (method, params) => new Promise((resolve, reject) => { const id = ++next; requests.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const response = await send('Runtime.evaluate', { expression: `(() => {
    const canvas = document.createElement('canvas'); canvas.width=40; canvas.height=20;
    const ctx=canvas.getContext('2d');
    ['#ff0000','#00ff00','#0000ff','#ffff00'].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect((i%2)*20,Math.floor(i/2)*10,20,10)});
    return ['image/jpeg','image/png','image/webp'].map(type=>({type,url:canvas.toDataURL(type,1)}));
  })()`, returnByValue: true })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  const images = response.result.value
  for (const { type, url } of images) {
    if (!url.startsWith(`data:${type};`)) throw new Error(`Encoder unavailable: ${type}`)
    const data = Buffer.from(url.split(',')[1], 'base64')
    const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1]
    await writeFile(join(folder, `quadrants.${extension}`), data)
    if (extension === 'jpg') {
      // One minimal APP1/TIFF Orientation entry. Native browser applies it; app has no EXIF parser.
      for (const orientation of [2, 3, 6, 8]) {
        const exif = Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000', 'hex')
        exif.writeUInt16LE(orientation, 24)
        const marker = Buffer.alloc(4); marker.writeUInt16BE(0xffe1); marker.writeUInt16BE(exif.length + 2, 2)
        await writeFile(join(folder, `orientation-${orientation}.jpg`), Buffer.concat([data.subarray(0, 2), marker, exif, data.subarray(2)]))
      }
    }
  }
  await writeFile(join(folder, 'corrupt.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0]))
  const samples = []
  const expected = {
    'quadrants.jpg': [40, 20, [0, 1, 2, 3]], 'quadrants.png': [40, 20, [0, 1, 2, 3]],
    'quadrants.webp': [40, 20, [0, 1, 2, 3]], 'orientation-2.jpg': [40, 20, [1, 0, 3, 2]],
    'orientation-3.jpg': [40, 20, [3, 2, 1, 0]], 'orientation-6.jpg': [20, 40, [2, 0, 3, 1]],
    'orientation-8.jpg': [20, 40, [1, 3, 0, 2]],
  }
  for (const [name, expectation] of Object.entries(expected))
    samples.push({ name, expectation, data: (await readFile(join(folder, name))).toString('base64') })
  const checked = await send('Runtime.evaluate', { expression: `(async () => {
    const results=[];const palette=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
    for(const sample of ${JSON.stringify(samples)}) {
      const bytes=Uint8Array.from(atob(sample.data),c=>c.charCodeAt(0));
      const started=performance.now();const bitmap=await createImageBitmap(new Blob([bytes]),{imageOrientation:'from-image'});
      const elapsedMs=performance.now()-started,width=bitmap.width,height=bitmap.height;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
      const colors=[0,1,2,3].map(i=>Array.from(ctx.getImageData(Math.floor((i%2+.5)*width/2),Math.floor((Math.floor(i/2)+.5)*height/2),1,1).data).slice(0,3));
      const [w,h,indices]=sample.expectation;
      const pixelsCorrect=colors.every((rgb,i)=>rgb.every((channel,c)=>Math.abs(channel-palette[indices[i]][c])<30));
      bitmap.close();const released=bitmap.width===0&&bitmap.height===0;
      results.push({name:sample.name,width,height,colors,elapsedMs,released,passed:width===w&&height===h&&pixelsCorrect&&released});
    }
    return {browser:navigator.userAgent,orientation:'from-image',results};
  })()`, returnByValue: true, awaitPromise: true })
  if (checked.exceptionDetails) throw new Error(JSON.stringify(checked.exceptionDetails))
  const report = checked.result.value
  await writeFile(join(output, 'static-native-orientation-report.json'), JSON.stringify(report, null, 2) + '\n')
  if (report.results.some(result => !result.passed)) throw new Error('Native orientation/color/resource-release verification failed; see ignored report')
  console.log('Generated original 40×20 static fixtures and EXIF orientations 2/3/6/8 with installed Edge.')
  console.log('Native decode, oriented dimensions, all quadrant colors and ImageBitmap.close: seven samples passed.')
} finally { socket?.close(); browser.kill() }
