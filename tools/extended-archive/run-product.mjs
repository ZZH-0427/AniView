// Real production UI + actual bounded runtime. Unlike controller-regression,
// this runner refuses to start without a verified completed component package.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchBrowser } from '../creation/browser.mjs'
import { verifyRuntime } from './verify-runtime.mjs'
const root = resolve(process.env.ANIVIEW_EXTENDED_ROOT ?? 'dist')
const base = process.env.ANIVIEW_EXTENDED_URL ?? 'http://127.0.0.1:4295/AniView/'
const output = resolve('.tools/m10c3'), q = id => `[data-testid="${id}"]`
const component = await verifyRuntime(root + '/vendor/sevenzip')
await mkdir(output, { recursive: true })
const report = { component, checks: [], media: [], layouts: [], cleanups: [], requests: [] }
const browser = await launchBrowser(resolve(output, 'product-browser'), { onEvent(event) {
  if (event.method === 'Network.requestWillBeSent') {
    const request = event.params.request
    report.requests.push({ method: request.method, url: request.url.startsWith('blob:') ? 'blob:local' : request.url.startsWith('data:') ? 'data:embedded' : request.url })
  }
} })
const { evaluate: ev, click, inputFiles, send } = browser
const wait = expression => browser.waitFor(expression, 30000)
const check = name => { report.checks.push(name); console.log(name) }
const json = id => ev(`JSON.parse(document.querySelector('${q(id)}').textContent)`)
const ready = () => wait(`['ready','paused','playing','ended'].includes(document.querySelector('${q('playback-state')}')?.dataset.state)`)
const prompt = () => wait(`!!document.querySelector('${q('archive-password-input')}')&&!document.querySelector('${q('archive-password-input')}').disabled`)
const input = value => ev(`(()=>{const input=document.querySelector('${q('archive-password-input')}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
const locale = value => ev(`(()=>{const select=document.querySelector('${q('locale-switcher')}');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
const unlock = async (value = 'aniview-test') => { await prompt(); await input(value); await click(q('archive-password-unlock')) }
const open = async (name, directory = '.tools/m10c3/fixtures') => {
  await inputFiles(q('archive-input'), [resolve(directory, name)])
  await wait(`document.querySelector('${q('archive-name')}')?.textContent===${JSON.stringify(name)}`)
}
const selectedPathExpression = `document.querySelector('${q('archive-entry-picker')}')?.selectedOptions[0]?.textContent.replace(/^\\d+\\. /u,'')`
const position = index => wait(`document.querySelector('${q('archive-entry-picker')}')?.value==='${index}'&&document.querySelector('.viewer-heading h1')?.textContent===(${selectedPathExpression})&&['ready','paused','playing','ended'].includes(document.querySelector('${q('playback-state')}')?.dataset.state)`)
const home = async () => {
  await locale('en'); await browser.clickLabel('Close archive')
  await wait(`!document.querySelector('${q('archive-status')}')&&JSON.parse(document.querySelector('${q('runtime-metrics')}').textContent).activeWorkers===0`)
  const cleanup = await json('runtime-metrics')
  for (const key of ['activeWorkers', 'activeBitmaps', 'activeArchiveSessions', 'cleanupErrors']) assert.equal(cleanup[key], 0, key)
  if (cleanup.lastExtendedArchiveCleanup) for (const key of ['activeExtendedArchiveWorkers', 'activeWasmInstances', 'activeArchiveSessions', 'activeExtraction', 'pendingAccess', 'currentExtractedBytes', 'activeObjectUrls', 'cleanupErrors'])
    assert.equal(cleanup.lastExtendedArchiveCleanup[key], 0, key)
  report.cleanups.push(cleanup)
}
async function conversion(target) {
  await browser.clickLabel('More'); await browser.clickLabel('Convert animation')
  await wait(`!!document.querySelector('${q('conversion-start')}')&&!document.querySelector('${q('conversion-start')}').disabled`)
  await click(`input[value="${target}"]`); await click(q('conversion-start'))
  await wait(`JSON.parse(document.querySelector('${q('conversion-debug')}').textContent).status==='success'`)
  await click(q('conversion-preview')); await ready(); await browser.clickLabel('Close')
  await wait(`!!document.querySelector('${q('conversion-result')}')`)
  await click(q('conversion-back')); await ready()
}
try {
  await browser.navigate(base); await wait('!!document.querySelector(".home")')
  report.homeAssets = [...browser.assets]
  assert(!report.requests.some(request => /vendor\/sevenzip|\/worker-|extended-session/.test(request.url)))
  assert.equal(await ev('!!document.querySelector("[data-testid=runtime-metrics]")'), false)
  check('ordinary Home has no extended Worker/glue/WASM download or diagnostics')
  await browser.navigate(base + '?debug=1'); await wait('!!document.querySelector(".home")')
  await inputFiles(q('archive-input'), [resolve('tests/fixtures/zip/mixed.zip')]); await ready()
  assert(!report.requests.some(request => /vendor\/sevenzip|\/worker-|extended-session/.test(request.url)))
  await home(); check('ordinary ZIP keeps zip.js and does not fetch SevenZip')

  // Solid archives can reorder by extension. Check every known path and the
  // rendered identity rather than assuming fixture creation order.
  const formats = { '01-animation.gif': 'GIF', '02-animation.webp': 'WEBP', '03-animation.png': 'APNG',
    '04-static.jpg': 'JPEG', '05-static.png': 'PNG', '06-static.webp': 'WEBP' }
  for (const archive of ['normal-rar4.rar', 'normal-rar5.rar', 'solid-rar5.rar', 'normal.7z', 'solid.7z']) {
    await open(archive); await ready()
    const paths = await ev(`Array.from(document.querySelector('${q('archive-entry-picker')}').options,option=>option.textContent.replace(/^\\d+\\. /u,''))`)
    assert.equal(new Set(paths).size, 6, archive + ': expected six distinct media paths')
    assert.deepEqual([...paths].sort(), Object.keys(formats).sort(), archive + ': fixture path coverage')
    for (let index = 0; index < 6; index++) {
      await position(index); await ready()
      const path = await ev(selectedPathExpression)
      assert.equal(await ev('document.querySelector(".viewer-heading h1").textContent'), path)
      const metadata = await ev('document.querySelector(".viewer-metadata").textContent')
      assert(metadata.startsWith(formats[path]), `${archive}: ${path}: ${metadata}`)
      report.media.push({ archive, index, path, metadata })
      if (index < 5) await browser.clickLabel('Next File')
    }
    await browser.clickLabel('Previous File'); await position(4); await ready(); await home()
  }
  check('six image formats in RAR4/RAR5/RAR-solid/7z/7z-solid; Next/Previous and cleanup')

  for (const [archive, path, target] of [['unicode-chinese.rar', '中文.gif', 'webp'],
    ['unicode-japanese.rar', '日本語.gif', 'apng']]) {
    await open(archive, '.tools/m10c3/nul-fix/filename-fixtures'); await ready()
    assert.equal(await ev('document.querySelector(".viewer-heading h1").textContent'), path)
    assert((await ev('document.querySelector(".viewer-metadata").textContent')).startsWith('GIF'))
    await conversion(target)
    assert.equal(await ev('document.querySelector(".viewer-heading h1").textContent'), path)
    await home()
  }
  check('Unicode RAR4 list → Viewer → conversion → Preview/Back preserves full Chinese/Japanese identity → Home')

  for (const archive of ['password-rar5.rar', 'password.7z']) {
    await open(archive); await prompt(); await input('wrong'); await click(q('archive-password-unlock'))
    await wait(`!!document.querySelector('${q('archive-password-error')}')`)
    await click(q('archive-password-cancel')); await wait(`!!document.querySelector('${q('archive-password-retry')}')`)
    await click(q('archive-password-retry')); await unlock(); await ready()
    await conversion(archive.endsWith('.rar') ? 'apng' : 'webp')
    await browser.clickLabel('Next File'); await position(1); await ready()
    assert.equal(await ev(`!!document.querySelector('${q('archive-password-prompt')}')`), false)
    await home()
  }
  check('RAR/7z entry passwords wrong→cancel→retry→correct, conversion Preview/Back and reuse')

  for (const archive of ['headers-rar5.rar', 'headers.7z', 'test_read_format_rar4_encrypted_filenames.rar']) {
    await open(archive); await prompt()
    assert((await ev('document.querySelector("[data-testid=archive-password-prompt] h2").textContent')).includes('Archive password'))
    await input('wrong'); await locale('zh-CN')
    assert.equal(await ev(`document.querySelector('${q('archive-password-input')}').value`), 'wrong')
    await locale('en'); await click(q('archive-password-unlock')); await wait(`!!document.querySelector('${q('archive-password-error')}')`)
    for (const width of [1280, 768, 390, 360]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 1, mobile: false })
      const layout = await ev('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})')
      assert.equal(layout.overflow, false); report.layouts.push({ archive, ...layout })
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await writeFile(resolve(output, `password-${archive}-${width}.png`), Buffer.from(shot.data, 'base64'))
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 320, deviceScaleFactor: 1, mobile: false })
    await ev('document.querySelector("[data-testid=archive-password-cancel]").scrollIntoView({block:"center"})')
    assert(await ev('(()=>{const r=document.querySelector("[data-testid=archive-password-cancel]").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()'))
    await send('Emulation.clearDeviceMetricsOverride')
    await click(q('archive-password-cancel')); await wait(`!!document.querySelector('${q('archive-opening-retry')}')`)
    await click(q('archive-opening-retry')); await unlock(archive.startsWith('test_') ? 'password' : 'aniview-test')
    await wait(`document.querySelector('${q('archive-status')}')?.dataset.state==='open'`)
    if (!archive.startsWith('test_')) await ready()
    else assert.equal(await ev('!!document.querySelector(".viewer")'), false) // text-only historical fixture
    await home()
  }
  check('archive-level RAR/7z passwords, legacy RAR4 sequence, keyboard-size layout, EN/ZH and Cancel')
  assert(report.requests.every(request => ['GET', 'HEAD'].includes(request.method)))
  assert(report.requests.every(request => request.url.startsWith(base) || ['blob:local', 'data:embedded', new URL('/favicon.ico', base).href].includes(request.url)))
  assert(!JSON.stringify(report.requests).includes('aniview-test'))
  assert.deepEqual(browser.errors, [])
  report.browser = await send('Browser.getVersion'); report.passed = true
  await writeFile(resolve(output, 'product-browser-report.json'), JSON.stringify(report, null, 2) + '\n')
} catch (error) {
  await writeFile(resolve(output, 'product-browser-failure.json'), JSON.stringify({ ...report, error: error.stack, browserErrors: browser.errors }, null, 2))
  throw error
} finally { await browser.close() }
