// Run separately from other browser checks: observational, single-run timings.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import { launchBrowser, sleep } from './browser.mjs'

const output = resolve('.tools/conversion'), port = '4213'
const sparse = process.argv.includes('--sparse')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['tools/conversion/preview.mjs', '--port', port], { windowsHide: true, stdio: 'ignore' })
const url = `http://127.0.0.1:${port}/AniView/experiments/conversion/?debug=1`
const report = { scope: 'Single desktop run, no concurrent AniView checks; not Android or whole-process RAM',
  generatedAtUTC: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model, rows: [] }
let browser
try {
  let ready = false
  for (let i = 0; i < 80; i++) { try { ready = (await fetch(url)).ok } catch { /* Startup. */ } if (ready) break; await sleep(100) }
  assert(ready)
  browser = await launchBrowser(output)
  await browser.navigate(url); await browser.waitFor('!!window.__conversionHarness')
  report.browser = await browser.evaluate('navigator.userAgent')
  const cases = []
  if (sparse) {
    for (const target of ['webp', 'apng']) cases.push({ width: 2048, height: 2048, count: 2, source: 'apng', target })
  } else {
    for (const count of [10, 50, 100, 200]) for (const target of ['webp', 'apng']) cases.push({ width: 320, height: 240, count, source: 'apng', target })
    for (const [width, height] of [[1024, 1024], [1920, 1080], [2048, 2048]]) for (const target of ['webp', 'apng']) {
      cases.push({ width, height, count: 2, source: target === 'webp' ? 'apng' : 'webp', target })
    }
  }
  for (const options of cases) {
    const row = await browser.evaluate(`window.__conversionHarness.runCase(${JSON.stringify({ ...options, scene: sparse ? 'sparse' : 'flat', playCount: 2 })})`)
    assert.equal(row.status, 'PASS'); assert.equal(row.conversion.peakRgbaFrames, 1)
    assert.equal(row.resources.activeWorkers, 0); assert.equal(row.resources.activeBitmaps, 0)
    report.rows.push(row)
    console.log(JSON.stringify({ ...options, totalMs: row.conversion.totalMs, outputBytes: row.conversion.byteLength }))
  }
  assert.deepEqual(browser.errors, []); report.errors = browser.errors
  report.status = 'PASS'
} finally {
  await writeFile(resolve(output, sparse ? 'sparse-report.json' : 'benchmark-report.json'), JSON.stringify(report, null, 2))
  if (browser) await browser.close()
  server.kill()
}
