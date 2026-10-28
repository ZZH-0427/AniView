// Real desktop Worker/conversion checks. This never deploys or changes product navigation.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { launchBrowser, sleep } from './browser.mjs'

const output = resolve('.tools/conversion'), port = '4211'
const smoke = process.argv.includes('--smoke')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['tools/conversion/preview.mjs', '--port', port], { windowsHide: true, stdio: 'ignore' })
const url = `http://127.0.0.1:${port}/AniView/experiments/conversion/?debug=1`
const report = { scope: 'Installed desktop Edge; not Android acceptance', generatedAtUTC: new Date().toISOString(), mode: smoke ? 'smoke' : 'full', cases: [], oracles: [] }
let browser

// Independent test parser uses Node's zlib, not the APNG writer/CRC implementation.
function pngOracle(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10])
  const crc = data => { let value = 0xffffffff; for (const byte of data) { value ^= byte; for (let b = 0; b < 8; b++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0) } return (value ^ 0xffffffff) >>> 0 }
  let offset = 8, width, height, count, plays, seq = 0
  const frames = [], types = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), name = bytes.toString('ascii', offset + 4, offset + 8)
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    assert.equal(crc(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length))
    types.push(name)
    if (name === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 6) }
    if (name === 'acTL') { count = data.readUInt32BE(0); plays = data.readUInt32BE(4) }
    if (name === 'fcTL') {
      assert.equal(data.readUInt32BE(0), seq++); assert.equal(data.readUInt32BE(4), width); assert.equal(data.readUInt32BE(8), height)
      assert.equal(data.readUInt32BE(12), 0); assert.equal(data.readUInt32BE(16), 0); assert.equal(data[24], 0); assert.equal(data[25], 0)
      frames.push({ compressed: [], duration: 1000 * data.readUInt16BE(20) / (data.readUInt16BE(22) || 100) })
    }
    if (name === 'IDAT') { assert.equal(frames.length, 1); frames.at(-1).compressed.push(data) }
    if (name === 'fdAT') { assert(frames.length > 1); assert.equal(data.readUInt32BE(0), seq++); frames.at(-1).compressed.push(data.subarray(4)) }
    offset += length + 12
  }
  assert.equal(offset, bytes.length); assert.equal(types.at(-1), 'IEND'); assert.equal(frames.length, count)
  const rgbaHashes = []
  for (const frame of frames) {
    const raw = inflateSync(Buffer.concat(frame.compressed)); assert.equal(raw.length, height * (width * 4 + 1))
    for (let y = 0; y < height; y++) assert.equal(raw[y * (width * 4 + 1)], 0)
    let hash = 2166136261
    for (let y = 0; y < height; y++) for (let x = 0; x < width * 4; x++) hash = Math.imul(hash ^ raw[y * (width * 4 + 1) + 1 + x], 16777619)
    rgbaHashes.push(hash >>> 0)
  }
  return { width, height, count, plays, bytes: bytes.length, durations: frames.map(f => f.duration), rgbaHashes, chunkTypes: [...new Set(types)], crcAndZlibValid: true }
}

try {
  let ready = false
  for (let i = 0; i < 80; i++) { try { ready = (await fetch(url)).ok } catch { /* Startup. */ } if (ready) break; await sleep(100) }
  assert(ready, 'Production engineering preview failed')
  browser = await launchBrowser(output)
  await browser.navigate(url)
  await browser.waitFor('!!window.__conversionHarness')
  report.browser = await browser.evaluate('navigator.userAgent')
  const run = async (name, options, strict = true) => {
    const row = await browser.evaluate(`window.__conversionHarness.runCase(${JSON.stringify(options)})`)
    report.cases.push({ name, ...row })
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ name, status: row.status, error: row.error, rgbaExact: row.fidelity?.rgbaExact, visualExact: row.fidelity?.visualExact,
      totalMs: row.conversion?.totalMs, outputBytes: row.conversion?.byteLength }))
    if (strict) assert.equal(row.status, 'PASS', name)
    if (row.conversion) {
      assert.equal(row.conversion.peakRgbaFrames, 1)
      assert.equal(row.conversion.transferredFrames, row.sourceMetadata.frameCount)
      assert.equal(row.conversion.peakFrameBytes, options.width * options.height * 4)
    }
    assert.equal(row.resources.activeWorkers, 0, name + ': Workers leaked')
    assert.equal(row.resources.activeBitmaps, 0, name + ': bitmaps leaked')
    return row
  }
  const base = { width: 32, height: 24, count: 6, scene: 'flat', playCount: 2, durations: [20,27,100,250,500,1000] }
  for (const source of ['gif','webp','apng']) for (const target of ['gif','webp','apng']) {
    await run(`matrix ${source}→${target}`, { ...base, source, target })
    if (target === 'apng') {
      const data = Buffer.from(await browser.evaluate('window.__conversionHarness.outputBase64()'), 'base64')
      report.oracles.push({ name: source + '→APNG', ...pngOracle(data) })
      await writeFile(join(output, source + '-to-apng.png'), data)
    }
  }
  if (!smoke) {
    for (const scene of ['solid','transparent','mixed-alpha','flat','gradient','sparse','full-change']) for (const target of ['webp','apng','gif']) {
      const row = await run(`scene ${scene}→${target}`, { ...base, width: 24, height: 20, count: 4, source: 'webp', target, scene })
      if (target === 'apng') {
        const oracle = pngOracle(Buffer.from(await browser.evaluate('window.__conversionHarness.outputBase64()'), 'base64'))
        assert.deepEqual(oracle.rgbaHashes, row.sourceFrameHashes, 'Independent zlib pixels differ from canonical input')
        report.oracles.push({ name: scene + '→APNG', ...oracle })
      }
    }
    const alphaAPNG = await run('canonical equivalence APNG mixed-alpha', { ...base, width: 24, height: 20, count: 4, source: 'apng', target: 'webp', scene: 'mixed-alpha' })
    assert.deepEqual(alphaAPNG.sourceFrameHashes, report.cases.find(row => row.name === 'scene mixed-alpha→webp').sourceFrameHashes)
    report.canonicalAPNGWebPEquivalence = 'RGBA hashes, frame order, milliseconds and total plays match for the same mixed-alpha procedural source'
    for (const playCount of [0,1,2,3]) for (const target of ['gif','webp','apng']) {
      await run(`loop ${playCount}→${target}`, { ...base, count: 3, source: 'apng', target, playCount })
    }
    for (const target of ['webp','apng','gif']) await run(`timing→${target}`,
      { ...base, source: 'apng', target, count: 8, durations: [1,10,20,27,100,250,500,1000] })
    for (const count of [10,50,100,200]) for (const target of ['webp','apng']) {
      await run(`${count}×320×240→${target}`, { ...base, width: 320, height: 240, count, source: 'apng', target })
    }
    for (const [width,height] of [[1024,1024],[1920,1080],[2048,2048]]) for (const target of ['webp','apng']) {
      await run(`large ${width}×${height}→${target}`, { ...base, width, height, count: 2, source: target === 'webp' ? 'apng' : 'webp', target })
    }
    const cancelled = await run('cancel after one accepted frame', { ...base, source: 'apng', target: 'webp', count: 10, cancelAfterFrames: 1 }, false)
    assert.equal(cancelled.status, 'CANCELLED')
    await run('rerun after cancel', { ...base, source: 'apng', target: 'webp' })
    const stale = await browser.evaluate(`(async()=>{const h=window.__conversionHarness;const a=h.runCase(${JSON.stringify({ ...base, source: 'apng', target: 'webp', count: 200 })});const b=h.runCase(${JSON.stringify({ ...base, source: 'gif', target: 'apng' })});return await Promise.all([a,b])})()`)
    assert.equal(stale[0].status, 'CANCELLED'); assert.equal(stale[1].status, 'PASS'); report.staleJobs = stale
  }
  report.transfers = await browser.evaluate('window.__conversionTransfers')
  assert.equal(report.transfers.sent, report.transfers.detached)
  await sleep(150)
  report.workerProbes = browser.evidence
  assert(report.workerProbes.some(p => /decoder/.test(p.url) && p.type === 'frame'))
  assert(report.workerProbes.every(p => p.detached))
  assert(report.workerProbes.every(p => p.bitmaps.live === 0))
  report.errors = [...browser.errors]; assert.deepEqual(report.errors, [])
  report.status = report.cases.every(row => ['PASS','CANCELLED'].includes(row.status)) ? 'PASS' : 'LIMITATIONS'
  const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(output, 'harness-desktop.png'), Buffer.from(screenshot.data, 'base64'))
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, transferCount: report.transfers.sent, independentPngOracles: report.oracles.length }))
} finally {
  await writeFile(join(output, smoke ? 'smoke-report.json' : 'report.json'), JSON.stringify(report, null, 2))
  if (browser) await browser.close()
  server.kill()
}
