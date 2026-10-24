// Full production-Viewer integration using installed Edge, Canvas pixels and native input events.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { runStaticCheck } from './static-scenario.mjs'
import { runFrameStepCheck } from './frame-step-scenario.mjs'
import { runViewportCheck } from './viewport-scenario.mjs'

export async function runViewerUXCheck({ send, evaluate, waitFor, click, url, capture }) {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const viewport = "JSON.parse(document.querySelector('[data-testid=viewport-metrics]').textContent)"
  const archive = "JSON.parse(document.querySelector('[data-testid=archive-metrics]').textContent)"
  const pick = async paths => {
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-testid=image-input]' })
    await send('DOM.setFileInputFiles', { nodeId, files: paths })
  }
  const close = async () => {
    if (await evaluate("!!document.querySelector('.viewer')")) await click('Close')
    else if (await evaluate("!!document.querySelector('.archive-summary')")) await click('Close archive')
    await waitFor("document.querySelector('h1')?.textContent==='AniView'&&!document.querySelector('.viewer')&&window.__workerLifetime.active===0&&window.__staticBitmaps.live===0")
  }
  const context = { send, evaluate, waitFor, click, pick, close, url }
  await waitFor("document.querySelector('h1')?.textContent==='AniView'")
  const initialResources = await evaluate("performance.getEntriesByType('resource').map(r=>r.name)")
  assert(!initialResources.some(name => /archive-session|archive\.worker/.test(name)), 'ZIP loaded before Open ZIP')
  const staticImages = await runStaticCheck(context)
  const frameStepping = await runFrameStepCheck(context)
  const interactions = await runViewportCheck(context)

  await close()
  const { root } = await send('DOM.getDocument')
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-testid=archive-input]' })
  await send('DOM.setFileInputFiles', { nodeId, files: [resolve('.tools/fixtures/viewer-mixed.zip')] })
  const expected = [
    ['photos/sample.jpg', 'static', 'JPEG'], ['animations/sample.gif', 'animation', 'GIF'],
    ['photos/sample.png', 'static', 'PNG'], ['animations/sample.png', 'animation', 'APNG'],
    ['photos/sample.webp', 'static', 'WEBP'], ['animations/sample.webp', 'animation', 'WEBP'],
  ]
  const zipMedia = []
  for (let index = 0; index < expected.length; index++) {
    if (index) await click('Next File')
    const [name, kind, format] = expected[index]
    await waitFor(`document.querySelector('.viewer h1')?.textContent===${JSON.stringify(name)}&&${state}===${JSON.stringify(kind === 'static' ? 'ready' : 'paused')}&&${viewport}?.mode==='fit'`)
    await waitFor(`${archive}.extractions===${index + 1}`)
    assert(await evaluate("document.querySelector('.viewer header p').textContent.startsWith(" + JSON.stringify(format + ' ·') + ')'), 'Wrong format inside ZIP')
    assert(await evaluate("!!document.querySelector('.playback-controls')") === (kind === 'animation'), 'Wrong ZIP media controls')
    assert(await evaluate('window.__staticBitmaps.live') === (kind === 'static' ? 1 : 0), 'ZIP static bitmap ownership incorrect')
    assert(await evaluate('window.__workerLifetime.active') === (kind === 'static' ? 1 : 2), 'ZIP media created extra Workers')
    await click('100%')
    await waitFor(`${viewport}.mode==='actual'&&${viewport}.scale===1`)
    if (kind === 'animation') {
      await click('Next Frame')
      await waitFor("document.querySelector('[data-testid=current-frame]')?.textContent.startsWith('Frame 2 /')")
      assert(await evaluate(`${viewport}.mode`) === 'actual', 'Frame step reset ZIP viewport')
    }
    zipMedia.push({ name, kind, archive: await evaluate(archive) })
  }
  await click('Previous File')
  await waitFor(`${state}==='ready'&&${viewport}.mode==='fit'&&${archive}.extractions===7`)
  await close()

  // Long user-visible names are text; keep Close and every control reachable.
  const longName = 'very-long-local-photo-name-and-details-'.repeat(4) + '.png'
  const fixtureFolder = resolve('.tools/browser-results/viewer-fixtures')
  await mkdir(fixtureFolder, { recursive: true })
  const longPath = join(fixtureFolder, longName)
  await writeFile(longPath, await readFile('tests/fixtures/static/quadrants.png'))
  const layouts = []
  for (const width of [320, 390, 768, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 2, mobile: width < 600 })
    await pick([longPath, resolve('.tools/fixtures/viewer-long.webp')])
    await waitFor(`${state}==='ready'&&${viewport}?.viewportWidth>10`)
    await click('Next File')
    await waitFor(`${state}==='paused'&&${viewport}.mode==='fit'`)
    await new Promise(resolve => setTimeout(resolve, 120))
    const layout = await evaluate(`(() => {
      const buttons=[...document.querySelectorAll('.viewer button')].filter(b=>b.getBoundingClientRect().width);
      const bounds=buttons.map(b=>({label:b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent.trim(),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}));
      const canvas=document.querySelector('.viewer canvas');
      return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,bounds,
        cssWidth:canvas.clientWidth,backingWidth:canvas.width};
    })()`)
    assert(!layout.overflow && layout.bounds.every(b => b.width >= 43 && b.height >= 43), 'Responsive controls failed at ' + width + ': ' + JSON.stringify(layout))
    assert(layout.backingWidth >= layout.cssWidth * 1.9, 'DPR backing store failed at ' + width)
    await capture?.(width)
    await click('Previous File')
    await waitFor(`${state}==='ready'`)
    assert(!await evaluate('document.documentElement.scrollWidth>innerWidth'), 'Long filename overflow at ' + width)
    const header = await evaluate(`(() => {
      const heading=document.querySelector('.viewer h1').getBoundingClientRect();
      const close=[...document.querySelectorAll('.viewer header button')].find(b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent.trim())==='Close').getBoundingClientRect();
      return {headingRight:heading.right,closeLeft:close.left};
    })()`)
    assert(header.headingRight <= header.closeLeft, 'Filename overlaps Close at ' + width)
    await capture?.(`static-${width}`)
    layouts.push(layout)
    await close()
  }
  const workers = await evaluate('window.__workerLifetime')
  const bitmaps = await evaluate('window.__staticBitmaps')
  assert(workers.active === 0 && workers.created === workers.terminated && workers.peakActive <= 2, 'Viewer leaked/overlapped Workers')
  assert(bitmaps.live === 0 && bitmaps.created === bitmaps.closed && bitmaps.peak <= 1, 'Viewer leaked static bitmaps')
  return { url, userAgent: await evaluate('navigator.userAgent'), initialResources,
    staticImages, frameStepping, interactions, zipMedia, layouts, workers, bitmaps,
    passed: ['static pipeline and EXIF', 'three-codec bounded frame stepping', 'viewport and gestures',
      'six-format lazy ZIP navigation', 'static/animated controls and Fit reset', '320/390/768/1280 layouts',
      'long filename and Close accessibility', 'DPR backing store', 'final Worker and bitmap cleanup'] }
}
