// Engineering-only source-composition conformance. No product import or deployment.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import omggif from 'omggif'
import { launchBrowser, sleep } from './browser.mjs'

const output = resolve('.tools/conversion'), port = '4212'
const url = `http://127.0.0.1:${port}/AniView/experiments/conversion/?debug=1`
const report = { scope: 'Installed desktop Edge source-composition evidence; not Android acceptance', generatedAtUTC: new Date().toISOString(), cases: [], equivalence: [] }
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['tools/conversion/preview.mjs', '--port', port], { windowsHide: true, stdio: 'ignore' })
let browser
const hash = bytes => { let value = 2166136261; for (const byte of bytes) value = Math.imul(value ^ byte, 16777619); return value >>> 0 }

// Reuse compressed pixels from AniView's original, committed tiny fixture;
// this builds only RIFF/ANMF metadata, not an image codec.
function partialWebP(original) {
  const headers = [], frames = []
  for (let offset = 12; offset < original.length;) {
    const length = original.readUInt32LE(offset + 4), next = offset + 8 + length + length % 2
    const chunk = Buffer.from(original.subarray(offset, next)), name = chunk.toString('ascii', 0, 4)
    if (name === 'ANMF') frames.push(chunk)
    else {
      if (name === 'VP8X') { chunk.writeUIntLE(3, 12, 3); chunk.writeUIntLE(1, 15, 3) }
      if (name === 'ANIM') chunk.writeUInt16LE(2, 12)
      headers.push(chunk)
    }
    offset = next
  }
  assert.equal(frames.length, 2)
  const spec = [[0, 0, 2, 20], [1, 1, 1, 27], [1, 0, 0, 100], [0, 1, 2, 250]]
  const combined = spec.map(([frame, xHalf, flags, duration]) => {
    const bytes = Buffer.from(frames[frame]); bytes.writeUIntLE(xHalf, 8, 3); bytes.writeUIntLE(duration, 20, 3); bytes[23] = flags
    return bytes
  })
  const body = Buffer.concat([Buffer.from('WEBP'), ...headers, ...combined]), riff = Buffer.alloc(8)
  riff.write('RIFF'); riff.writeUInt32LE(body.length, 4)
  return Buffer.concat([riff, body])
}

try {
  let ready = false
  for (let i = 0; i < 80; i++) { try { ready = (await fetch(url)).ok } catch { /* Local startup. */ } if (ready) break; await sleep(100) }
  assert(ready, 'Production engineering preview unavailable')
  browser = await launchBrowser(output)
  await browser.navigate(url); await browser.waitFor('!!window.__conversionHarness')
  report.browser = await browser.evaluate('navigator.userAgent')
  const run = async (name, options, encoded, expectedHashes, expectedDurations) => {
    const row = await browser.evaluate(`window.__conversionHarness.runCase(${JSON.stringify(options)}${encoded ? ',' + JSON.stringify([...encoded]) : ''})`)
    report.cases.push({ name, ...row })
    assert.equal(row.status, 'PASS', name)
    assert.equal(row.conversion.peakRgbaFrames, 1)
    assert.equal(row.resources.activeWorkers, 0); assert.equal(row.resources.activeBitmaps, 0)
    if (expectedHashes) assert.deepEqual(row.sourceFrameHashes, expectedHashes, name + ': canonical source differs from independent full-canvas oracle')
    if (expectedDurations) assert.deepEqual(row.sourceDurations, expectedDurations, name + ': source timing')
    assert.equal(row.sourceMetadata.playCount, options.playCount)
    assert.equal(row.sourceMetadata.width, options.width); assert.equal(row.sourceMetadata.height, options.height)
    assert.equal(row.sourceMetadata.frameCount, options.count)
    await writeFile(join(output, 'canonical-report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ name, status: row.status, frames: row.sourceMetadata.frameCount }))
    return row
  }
  // These expected canvases are explicitly declared by the old fixture generator,
  // independently of the source compositor and the new target encoders.
  const apng = JSON.parse(await readFile('tests/fixtures/apng/expectations.json', 'utf8'))
  for (const [name, expected] of Object.entries(apng)) for (const target of ['apng', 'webp']) {
    const bytes = await readFile(join('tests/fixtures/apng', name))
    const row = await run('APNG source ' + name + ' to ' + target,
      { source: 'apng', target, width: expected.width, height: expected.height, count: expected.frameCount, playCount: expected.loopCount },
      bytes, expected.frames.map(frame => hash(frame.rgba)), expected.frames.map(frame => frame.durationMs))
    assert.equal(row.fidelity.rgbaExact, true)
    if (name === 'composition.png' || name === 'hidden-default.png' || name === 'first-previous.png') {
      assert.equal(row.conversion.sourceMetrics.directRgbaFrames, 0, 'Stateful composition must not use the independent-frame optimization')
      assert.equal(row.conversion.sourceMetrics.canvasReadbackFrames, expected.frameCount)
    }
  }
  // Native ImageDecoder is an independent, test-only GIF/WebP oracle. It hashes
  // and closes one VideoFrame at a time; the report never retains pixel arrays.
  const nativeHashes = async (bytes, mime) => browser.evaluate(`(async()=>{
    const decoder=new ImageDecoder({data:Uint8Array.from(${JSON.stringify([...bytes])}),type:${JSON.stringify(mime)}});
    try{await decoder.tracks.ready;const hashes=[];for(let i=0;i<decoder.tracks.selectedTrack.frameCount;i++){
      const {image}=await decoder.decode({frameIndex:i});try{const rgba=new Uint8Array(image.displayWidth*image.displayHeight*4);
      await image.copyTo(rgba,{format:'RGBA'});let h=2166136261;for(const byte of rgba)h=Math.imul(h^byte,16777619);hashes.push(h>>>0)}finally{image.close()}}
      return hashes}finally{decoder.close()}})()`)
  const gifNames = ['previous.gif', 'background-opaque.gif', 'background-transparent.gif', 'transparent-local.gif', 'local-only.gif', 'finite.gif', 'short-delay.gif', 'gif87a.gif', 'interlace.gif', ...Array.from({ length: 17 }, (_, index) => `interlace-${index + 1}.gif`)]
  for (const name of gifNames) {
    const bytes = await readFile(join('tests/fixtures/gif', name)), reader = new omggif.GifReader(bytes)
    const rawLoop = reader.loopCount(), playCount = rawLoop === null ? 1 : rawLoop === 0 ? 0 : rawLoop + 1
    const durations = Array.from({ length: reader.numFrames() }, (_, index) => reader.frameInfo(index).delay < 2 ? 100 : reader.frameInfo(index).delay * 10)
    const expected = await nativeHashes(bytes, 'image/gif')
    for (const target of ['apng', ...(['previous.gif', 'background-opaque.gif', 'transparent-local.gif', 'gif87a.gif'].includes(name) ? ['webp'] : [])]) {
      await run('GIF source ' + name + ' to ' + target, { source: 'gif', target, width: reader.width, height: reader.height, count: reader.numFrames(), playCount }, bytes, expected, durations)
    }
  }
  const originalWebP = await readFile('tests/fixtures/zip/original-two-frame.webp')
  for (const [name, bytes, width, count, playCount, durations] of [
    ['original', originalWebP, 2, 2, 0, [100, 100]],
    ['partial-blend-dispose', partialWebP(originalWebP), 4, 4, 2, [20, 27, 100, 250]],
  ]) {
    const expected = await nativeHashes(bytes, 'image/webp')
    for (const target of ['apng', 'webp']) await run('WebP source ' + name + ' to ' + target,
      { source: 'webp', target, width, height: 2, count, playCount }, bytes, expected, durations)
  }
  // Same procedural animation across lossless sources; GIF comparison uses the
  // already measured quantization result rather than pretending GIF is lossless.
  const baseline = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'))
  assert.equal(baseline.status, 'PASS', 'Run the full desktop conversion suite first')
  const scenes = ['solid', 'transparent', 'mixed-alpha', 'flat', 'gradient', 'sparse', 'full-change']
  for (const scene of scenes) {
    const losslessReference = baseline.cases.find(row => row.options.source === 'webp' && row.options.target === 'webp' && row.options.scene === scene && row.options.width === 24)
    const gifReference = baseline.cases.find(row => row.options.source === 'webp' && row.options.target === 'gif' && row.options.scene === scene && row.options.width === 24)
    assert(losslessReference && gifReference, 'Missing scene baseline')
    const base = { width: 24, height: 20, count: 4, scene, playCount: 2, durations: [20, 27, 100, 250, 500, 1000] }
    const png = await run('Equivalent APNG scene ' + scene, { ...base, source: 'apng', target: 'webp' })
    assert.deepEqual(png.sourceFrameHashes, losslessReference.sourceFrameHashes)
    assert.deepEqual(png.sourceDurations, losslessReference.sourceDurations)
    const gif = await run('Equivalent quantized GIF scene ' + scene, { ...base, source: 'gif', target: 'apng' })
    assert.deepEqual(gif.sourceFrameHashes, gifReference.decodedFrameHashes)
    assert.deepEqual(gif.sourceDurations, gifReference.decodedDurations)
    report.equivalence.push({ scene, apngWebpRGBAExact: true, gifMatchesMeasuredQuantization: true,
      gifQuantization: gifReference.fidelity, playCount: 2, orderAndTimingMatch: true })
  }
  report.transfers = await browser.evaluate('window.__conversionTransfers')
  assert.equal(report.transfers.sent, report.transfers.detached)
  await sleep(150)
  report.workerProbeCount = browser.evidence.length
  assert(browser.evidence.every(row => row.detached && row.bitmaps.live === 0))
  report.errors = [...browser.errors]; assert.deepEqual(report.errors, [])
  report.status = 'PASS'
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, scenes: report.equivalence.length, transfers: report.transfers, workerProbes: report.workerProbeCount }))
} finally {
  await writeFile(join(output, 'canonical-report.json'), JSON.stringify(report, null, 2))
  if (browser) await browser.close()
  server.kill()
}
