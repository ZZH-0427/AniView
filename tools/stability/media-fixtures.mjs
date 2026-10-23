// Original stress fixtures. No browser downloads, application encoders or copied artwork.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import omggif from 'omggif'
import { encodePNG } from '../apng/generate-fixtures.mjs'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const provenance = {
  source: 'Original AniView colored quadrants and solid pixels; existing original GIF/APNG/WebP fixture patterns only.',
  license: 'CC0-1.0',
  generator: 'node tools/stability/media-fixtures.mjs',
  purpose: 'Ignored Milestone 6 boundary, controlled-rejection, long-animation, duration and corruption stress inputs.',
  encoding: 'Installed Edge canvas static encoders; existing encodePNG helper and omggif writer; original lossless WebP payload reuse.',
}

/** Native encoders are test tooling, isolated in a temporary installed Edge profile. */
async function nativeStaticFixtures(record) {
  const profiles = resolve('.tools/browser-results'); await mkdir(profiles, { recursive: true })
  const profile = await mkdtemp(join(profiles, 'stability-fixtures-'))
  const browser = spawn(process.env.BROWSER_PATH ?? process.env.EDGE_PATH ?? (process.platform === 'win32'
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : '/usr/bin/google-chrome'), [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })
  let socket
  try {
    let port
    for (let attempt = 0; attempt < 200; attempt++) {
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break }
      catch { await delay(100) }
    }
    if (!port) throw new Error('Installed Edge debugger did not start for fixture encoding')
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let id = 0
    const pending = new Map()
    socket.onmessage = ({ data }) => {
      const response = JSON.parse(data)
      if (!response.id) return
      const request = pending.get(response.id); pending.delete(response.id)
      if (response.error) request.reject(new Error(JSON.stringify(response.error)))
      else request.resolve(response.result)
    }
    const send = (method, params) => new Promise((resolve, reject) => {
      const requestId = ++id; pending.set(requestId, { resolve, reject })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
      return response.result.value
    }
    const encoder = await evaluate('navigator.userAgent')
    for (const [prefix, width, height, expected] of [['boundary', 2048, 2048, 'accepted'], ['phone12MP', 4000, 3000, 'RESOURCE_LIMIT_EXCEEDED']]) {
      for (const [format, mime, extension] of [['JPEG', 'image/jpeg', 'jpg'], ['PNG', 'image/png', 'png'], ['WebP', 'image/webp', 'webp']]) {
        const encoded = await evaluate(`(async () => {
          const canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};
          const context=canvas.getContext('2d');
          ['#ff0000','#00ff00','#0000ff','#ffff00'].forEach((color,index)=>{
            context.fillStyle=color;context.fillRect(index%2*canvas.width/2,Math.floor(index/2)*canvas.height/2,canvas.width/2,canvas.height/2);
          });
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,${JSON.stringify(mime)},1));
          if(!blob||blob.type!==${JSON.stringify(mime)})throw new Error('Requested native encoder unavailable');
          const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
          canvas.width=canvas.height=1;return url.split(',')[1];
        })()`)
        await record(prefix + format, `${prefix}-${width}x${height}.${extension}`, Buffer.from(encoded, 'base64'),
          { width, height, pixels: width * height, decodedRGBABytes: width * height * 4, expected, nativeEncoder: encoder })
      }
    }
    return encoder
  } finally { socket?.close(); browser.kill() }
}

async function animatedWebP(frameCount, durationMs) {
  const original = await readFile('tests/fixtures/zip/original-two-frame.webp')
  const metadata = [], frames = []
  for (let offset = 12; offset < original.length;) {
    const length = original.readUInt32LE(offset + 4), next = offset + 8 + length + length % 2
    const chunk = Buffer.from(original.subarray(offset, next))
    if (chunk.toString('ascii', 0, 4) === 'ANMF') { chunk.writeUIntLE(durationMs, 20, 3); frames.push(chunk) }
    else metadata.push(chunk)
    offset = next
  }
  if (frames.length !== 2) throw new Error('Original WebP payload fixture changed')
  const body = Buffer.concat([Buffer.from('WEBP'), ...metadata, ...Array.from({ length: frameCount }, (_, index) => frames[index % 2])])
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

function animatedGIF(frameCount, durationMs) {
  const data = new Uint8Array(frameCount * 64 + 1024)
  const writer = new omggif.GifWriter(data, 2, 2, { palette: [0, 0xff0000, 0x00ff00, 0x0000ff], loop: 0 })
  for (let index = 0; index < frameCount; index++) writer.addFrame(0, 0, 2, 2,
    new Uint8Array(4).fill(index % 2 + 1), { delay: durationMs / 10, disposal: 1 })
  return Buffer.from(data.subarray(0, writer.end()))
}

function rgba(width, height, green = false) {
  const pixels = Buffer.alloc(width * height * 4)
  pixels.fill(green ? Buffer.from([0, 255, 0, 255]) : Buffer.from([255, 0, 0, 255]))
  return pixels
}

function animatedPNG(width, height, frameCount, durationMs, partialAfterFirst = false) {
  const red = rgba(width, height), green = partialAfterFirst ? rgba(1, 1, true) : rgba(width, height, true)
  return encodePNG({ width, height, frames: Array.from({ length: frameCount }, (_, index) => ({
    width: index && partialAfterFirst ? 1 : width, height: index && partialAfterFirst ? 1 : height,
    rgba: index % 2 ? green : red, delayNum: durationMs / 10, delayDen: 100,
  })) })
}

/** Generate ignored files; importing this module does not start Edge or write files. */
export async function generateMediaStressFixtures() {
  const directory = resolve('.tools/fixtures/stability'); await mkdir(directory, { recursive: true })
  const files = {}, metadata = {}
  const record = async (key, name, bytes, details = {}) => {
    const path = join(directory, name); await writeFile(path, bytes)
    files[key] = path; metadata[key] = { path, bytes: bytes.length, ...details }
    return bytes
  }
  const nativeEncoder = await nativeStaticFixtures(record)
  for (const [prefix, count, durationMs] of [['long', 1000, 20], ['logical', 60, 20_000]]) {
    const details = { width: 2, height: 2, frameCount: count, durationMs, timelineMs: count * durationMs, loopCount: 0, expected: 'accepted' }
    await record(prefix + 'WebP', `${prefix}-${count}.webp`, await animatedWebP(count, durationMs), details)
    await record(prefix + 'APNG', `${prefix}-${count}.png`, animatedPNG(2, 2, count, durationMs), details)
    await record(prefix + 'GIF', `${prefix}-${count}.gif`, animatedGIF(count, durationMs), details)
  }
  await record('largeAPNG', 'large-2048x2048.png', animatedPNG(2048, 2048, 2, 100),
    { width: 2048, height: 2048, frameCount: 2, durationMs: 100, decodedRGBABytes: 16_777_216, expected: 'accepted' })
  await record('overLimitAPNG', 'over-limit-3000x3000.png', animatedPNG(3000, 3000, 2, 100, true),
    { width: 3000, height: 3000, frameCount: 2, durationMs: 100, decodedRGBABytes: 36_000_000, expected: 'RESOURCE_LIMIT_EXCEEDED' })

  const webp = await readFile(files.longWebP), png = await readFile(files.boundaryPNG)
  const broken = Buffer.from(await readFile(files.longAPNG))
  const acTL = broken.indexOf(Buffer.from('acTL')); broken[acTL + 8] ^= 1 // leave its CRC unchanged
  const corrupt = Buffer.from(webp); corrupt.writeUInt32LE(webp.length + 1024, 4)
  await record('truncatedWebP', 'truncated.webp', webp.subarray(0, webp.length - 17), { expected: 'CORRUPTED_FILE' })
  await record('corruptWebP', 'corrupt.webp', corrupt, { expected: 'CORRUPTED_FILE' })
  await record('brokenAPNG', 'broken-apng.png', broken, { expected: 'CORRUPTED_FILE' })
  await record('truncatedPNG', 'truncated-static.png', png.subarray(0, 30), { expected: 'CORRUPTED_FILE' })
  await record('invalidGIF', 'invalid.gif', Buffer.from('GIF89a\x02\x00\x02\x00\x80\x00\x00'), { expected: 'CORRUPTED_FILE' })
  await record('invalidJPEG', 'invalid.jpg', Buffer.from([255, 216, 255, 192, 0, 17, 8, 0]), { expected: 'CORRUPTED_FILE' })
  await record('renamedRandom', 'random-renamed.png', Buffer.from('AniView: original random text, not image data.\n'), { expected: 'UNSUPPORTED_FORMAT' })
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ provenance, nativeEncoder, metadata }, null, 2) + '\n')
  return { directory, files, metadata, nativeEncoder, provenance }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateMediaStressFixtures()
  console.log(JSON.stringify(result, null, 2))
}
