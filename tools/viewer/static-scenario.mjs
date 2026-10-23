// Static-media integration against the real Viewer and installed Edge/CDP.
// Fixture files never leave the local browser; only numeric pixel/lifecycle results are returned.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

export async function runStaticCheck({ send, evaluate, waitFor, click, pick, close, url }) {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const title = "document.querySelector('.viewer h1')?.textContent"
  const resource = "JSON.parse(document.querySelector('[data-testid=media-resource]')?.textContent||'null')"
  const viewport = "JSON.parse(document.querySelector('[data-testid=viewport-metrics]')?.textContent||'null')"
  const bitmapCounts = () => evaluate('window.__staticBitmaps')
  const workerCounts = () => evaluate('window.__workerLifetime')
  const passed = [], samples = []
  const fixture = name => resolve('tests/fixtures/static', name)
  const expected = [
    ['quadrants.jpg', 'jpeg', 40, 20, [0, 1, 2, 3]],
    ['quadrants.png', 'png', 40, 20, [0, 1, 2, 3]],
    ['quadrants.webp', 'webp', 40, 20, [0, 1, 2, 3]],
    ['orientation-2.jpg', 'jpeg', 40, 20, [1, 0, 3, 2]],
    ['orientation-3.jpg', 'jpeg', 40, 20, [3, 2, 1, 0]],
    ['orientation-6.jpg', 'jpeg', 20, 40, [2, 0, 3, 1]],
    ['orientation-8.jpg', 'jpeg', 20, 40, [1, 3, 0, 2]],
  ]
  const current = async (name, kind, width, height) => {
    await waitFor(`${title}===${JSON.stringify(name)}&&${resource}?.kind===${JSON.stringify(kind)}&&${state}!=="loading"&&${state}!=="error"`)
    if (width) await waitFor(`${resource}?.width===${width}&&${resource}?.height===${height}&&${viewport}?.contentWidth===${width}&&${viewport}?.contentHeight===${height}`)
    await waitFor(`${viewport}?.mode==='fit'`)
  }
  const assertStatic = async () => {
    const controls = await evaluate(`Array.from(document.querySelectorAll('.playback-controls button')).map(b=>b.textContent)`)
    assert(controls.length === 0 && !await evaluate("!!document.querySelector('[data-testid=current-frame]')"), 'Static image has animation controls')
    assert((await workerCounts()).active === 0, 'Static image created/retained animation Worker')
    assert((await bitmapCounts()).live === 1, 'Static image should own exactly one native bitmap')
    const metrics = await evaluate("JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)")
    assert(metrics.cacheBytes === 0 && metrics.cachedFrames === 0 && metrics.maxBytes === 0, 'Static image created an animation frame cache')
  }
  const readQuadrants = () => evaluate(`(() => {
    const view=${viewport},canvas=document.querySelector('.viewer canvas'),ctx=canvas.getContext('2d');
    return [0,1,2,3].map(i=>{
      const x=view.offsetX+(i%2+.5)*view.contentWidth/2*view.scale;
      const y=view.offsetY+(Math.floor(i/2)+.5)*view.contentHeight/2*view.scale;
      return Array.from(ctx.getImageData(Math.floor(x*canvas.width/view.viewportWidth),Math.floor(y*canvas.height/view.viewportHeight),1,1).data).slice(0,3);
    });
  })()`)
  const assertPixels = (colors, order, name) => {
    const palette = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]
    assert(colors.every((rgb, i) => rgb.every((channel, c) => Math.abs(channel - palette[order[i]][c]) < 35)), 'Wrong displayed/oriented quadrant pixels: ' + name + ' ' + JSON.stringify(colors))
  }
  const noResources = async () => {
    await waitFor('window.__staticBitmaps.live===0&&window.__workerLifetime.active===0')
    assert(!await evaluate('!!document.querySelector(".viewer canvas")'), 'Close retained static Canvas')
  }

  await close()
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
  await pick(expected.map(([name]) => fixture(name)))
  for (let i = 0; i < expected.length; i++) {
    const [name, format, width, height, order] = expected[i]
    if (i) await click('Next File')
    await current(name, 'static', width, height)
    await assertStatic()
    const info = await evaluate("document.querySelector('.viewer-heading p').textContent")
    assert(info.startsWith(format.toUpperCase() + ' ·') && info.includes(`${width} × ${height}`), 'Static format/dimensions missing')
    const colors = await readQuadrants(); assertPixels(colors, order, name)
    samples.push({ name, width, height, colors, bitmapCounts: await bitmapCounts() })
    await click('100%'); await waitFor(`${viewport}?.mode==='actual'&&${viewport}?.scale===1`)
  }
  passed.push('JPEG/PNG/static WebP use Canvas without Player, animation controls, cache or Worker',
    'EXIF 2/3/6/8 actual Viewer pixels and oriented dimensions', 'static switch closes previous bitmap and resets Fit')
  await close(); await noResources()
  await pick([fixture('quadrants.jpg')]); await current('quadrants.jpg', 'static', 40, 20)
  await close(); await noResources()
  passed.push('static close and same-file reopen release bitmap resources')

  await pick([fixture('quadrants.jpg'), resolve('tests/fixtures/gif/previous.gif'), fixture('quadrants.png')])
  await current('quadrants.jpg', 'static', 40, 20)
  await click('100%')
  await click('Next File'); await current('previous.gif', 'animation')
  await waitFor('window.__staticBitmaps.live===0&&window.__workerLifetime.active===1')
  assert(await evaluate("!!document.querySelector('.playback-controls')"), 'Animation controls missing after static image')
  await click('Next File'); await current('quadrants.png', 'static', 40, 20); await assertStatic()
  await click('Previous File'); await current('previous.gif', 'animation')
  await close(); await noResources()
  passed.push('static ↔ animated navigation replaces controls and ownership, resets Fit')

  await pick([fixture('quadrants.jpg'), fixture('quadrants.png'), fixture('quadrants.webp')])
  await current('quadrants.jpg', 'static', 40, 20)
  await click('Remove from list'); await current('quadrants.png', 'static', 40, 20); await assertStatic()
  await click('Clear session'); await noResources()
  passed.push('remove current and clear session close native static resources')

  await evaluate('window.__nativeStaticCreate=window.createImageBitmap;window.createImageBitmap=undefined')
  try {
    await pick([fixture('quadrants.jpg')])
    await waitFor(`${state}==='error'&&document.body.innerText.includes('Static-image viewing requires ImageBitmap support')`)
    assert((await workerCounts()).active === 0 && (await bitmapCounts()).live === 0, 'Capability error leaked native resources')
  } finally { await evaluate('window.createImageBitmap=window.__nativeStaticCreate;delete window.__nativeStaticCreate') }
  await close(); await noResources()
  passed.push('missing ImageBitmap capability gives a stable recoverable error')

  const temporary = resolve('.tools/fixtures'); await mkdir(temporary, { recursive: true })
  const huge = Buffer.from(await readFile(fixture('quadrants.jpg'))), sof = huge.indexOf(Buffer.from([0xff, 0xc0]))
  assert(sof >= 0, 'Generated JPEG has no baseline SOF')
  huge.writeUInt16BE(50_000, sof + 5); huge.writeUInt16BE(50_000, sof + 7)
  const hugePath = resolve(temporary, 'viewer-static-excessive.jpg'); await writeFile(hugePath, huge)
  for (const [path, message] of [[hugePath, 'supported processing limits'], [fixture('corrupt.jpg'), 'appears to be damaged']]) {
    const before = await bitmapCounts()
    await pick([path, fixture('quadrants.png')])
    await waitFor(`${title}===${JSON.stringify(basename(path))}&&${state}==='error'&&document.body.innerText.includes(${JSON.stringify(message)})`)
    assert((await bitmapCounts()).created === before.created, 'Invalid static metadata reached native decoding')
    await click('Next File'); await current('quadrants.png', 'static', 40, 20)
    await assertStatic(); await close(); await noResources()
  }
  passed.push('50000×50000 JPEG rejected before native decode', 'corrupt static file can navigate to good sibling')

  // Delay the real native result, then close during decoding. This verifies the
  // unavoidable late ImageBitmap is closed rather than rendering after teardown.
  await evaluate(`(() => {
    window.__staticOriginalCreate=window.createImageBitmap;
    window.createImageBitmap=async function(...args){
      const image=await window.__staticOriginalCreate.apply(this,args);
      return new Promise(resolve=>{window.__releaseStaticDecode=()=>resolve(image)});
    };
  })()`)
  try {
    await pick([fixture('quadrants.jpg')])
    await waitFor("typeof window.__releaseStaticDecode==='function'")
    assert((await bitmapCounts()).live === 1, 'Late-result test did not allocate a real bitmap')
    await click('Close')
    await evaluate('window.__releaseStaticDecode()')
    await noResources()
  } finally {
    await evaluate('window.__releaseStaticDecode?.();window.createImageBitmap=window.__staticOriginalCreate;delete window.__staticOriginalCreate;delete window.__releaseStaticDecode')
  }
  passed.push('close during native decode disposes the late bitmap without stale render')
  return { url, passed, samples, finalBitmaps: await bitmapCounts(), finalWorkers: await workerCounts() }
}
