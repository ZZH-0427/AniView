// Real browser stress, separate from the fast unit suite. Uses local files only.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'

export async function runStabilityCheck({ send, evaluate, waitFor, click, url, mode }) {
  const started = performance.now(), checks = []
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const runtime = "JSON.parse(document.querySelector('[data-testid=runtime-metrics]').textContent)"
  const cache = "JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)"
  const viewport = "JSON.parse(document.querySelector('[data-testid=viewport-metrics]').textContent)"
  const archive = "JSON.parse(document.querySelector('[data-testid=archive-metrics]').textContent)"
  const frame = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.match(/Frame (\\d+)/)?.[1])"
  const ready = `(${state}==='ready'||${state}==='paused')`
  const pick = async (paths, kind = 'image') => {
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-testid=${kind}-input]` })
    await send('DOM.setFileInputFiles', { nodeId, files: paths.map(path => resolve(path)) })
  }
  const close = async () => {
    if (await evaluate("!!document.querySelector('.viewer')")) await click('Close')
    else if (await evaluate("!!document.querySelector('.archive-summary')")) await click('Close archive')
    await waitFor(`!document.querySelector('.viewer')&&!document.querySelector('.archive-summary')&&${runtime}.activeWorkers===0&&${runtime}.activeBitmaps===0&&${runtime}.activeArchiveSessions===0`)
  }
  const heap = async label => {
    const result = await send('Performance.getMetrics')
    return { label, ...Object.fromEntries(result.metrics.filter(metric => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents'].includes(metric.name)).map(metric => [metric.name, metric.value])) }
  }
  await send('Performance.enable')
  await waitFor(`document.querySelector('h1')?.textContent==='AniView'&&!!document.querySelector('[data-testid=runtime-metrics]')`)
  await evaluate(`window.__stabilityLongTasks=[];if(typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){window.__stabilityObserver=new PerformanceObserver(list=>{for(const e of list.getEntries())window.__stabilityLongTasks.push({start:e.startTime,duration:e.duration})});window.__stabilityObserver.observe({type:'longtask',buffered:true})}`)
  const heaps = [await heap('initial')]
  const mixed = [
    ['tests/fixtures/static/quadrants.jpg', 'ready'],
    ['tests/fixtures/gif/previous.gif', 'paused'],
    ['tests/fixtures/static/quadrants.png', 'ready'],
    ['tests/fixtures/apng/full-infinite.png', 'paused'],
    ['tests/fixtures/static/quadrants.webp', 'ready'],
    ['public/validation/viewer/long.webp', 'paused'],
  ]
  await pick(mixed.map(item => item[0]))
  const formats = []
  for (let index = 0; index < mixed.length; index++) {
    if (index) await click('Next File')
    await waitFor(`${state}===${JSON.stringify(mixed[index][1])}&&document.querySelector('.viewer h1')?.textContent===${JSON.stringify(basename(mixed[index][0]))}`)
    await waitFor(`${viewport}?.mode==='fit'`)
    const animated = mixed[index][1] === 'paused'
    assert(await evaluate("!!document.querySelector('.playback-controls')") === animated, 'Static/animated control mismatch')
    await click('100%')
    await waitFor(`${viewport}.mode==='actual'`)
    if (animated) {
      await click('Play'); await waitFor(`${state}==='playing'`)
      await click('Zoom In')
      await waitFor(`${viewport}.mode==='custom'`)
      const before = await evaluate(viewport)
      await click('Pause'); await waitFor(`${state}==='paused'`)
      const current = await evaluate(frame)
      if (current < 2) { await click('Next Frame'); await waitFor(`${frame}>=2`) }
      await click('Previous Frame'); await waitFor(`${state}==='paused'&&!document.querySelector('.playback-controls button')?.disabled||${frame}===1`)
      const after = await evaluate(viewport)
      assert(after.mode === before.mode && after.scale === before.scale && after.offsetX === before.offsetX && after.offsetY === before.offsetY, 'Stepping changed viewport')
    }
    formats.push({ file: basename(mixed[index][0]), state: await evaluate(state), cache: await evaluate(cache) })
  }
  checks.push('six formats, Play/Pause, step+zoom, file Fit reset, static controls')
  await close()

  await pick(['public/validation/viewer/mixed-media.zip'], 'archive')
  const entries = []
  for (let index = 0; index < 6; index++) {
    if (index) await click('Next File')
    await waitFor(`${ready}&&document.querySelector('[data-testid=session-position]')?.textContent==='${index + 1} / 6'&&${archive}.extractions===${index + 1}`)
    entries.push(await evaluate(archive))
  }
  await close()
  checks.push('six-format ZIP: metadata first, current-only extraction, close')

  const temporary = resolve('.tools/fixtures/stability-errors')
  await mkdir(temporary, { recursive: true })
  const corruptFiles = []
  for (const [name, source, cut] of [
    ['damaged.webp', 'public/validation/viewer/long.webp', 40],
    ['damaged.png', 'tests/fixtures/apng/full-infinite.png', 48],
    ['damaged.gif', 'tests/fixtures/gif/previous.gif', 20],
    ['damaged.jpg', 'tests/fixtures/static/quadrants.jpg', 12],
  ]) {
    const path = join(temporary, name)
    await writeFile(path, (await readFile(source)).subarray(0, cut))
    corruptFiles.push(path)
  }
  await writeFile(join(temporary, 'random.png'), 'local test bytes, not an image')
  corruptFiles.push(join(temporary, 'random.png'))
  const recovery = []
  for (const damaged of corruptFiles) {
    await pick([damaged, mixed[0][0]])
    await waitFor(`${state}==='error'`)
    const message = await evaluate("document.querySelector('.viewer [role=alert]').textContent")
    assert(message.length > 0 && !message.includes('Error:'), 'Missing or raw error')
    await click('Next File'); await waitFor(`${state}==='ready'`)
    recovery.push({ name: basename(damaged), message }); await close()
  }
  checks.push('five corrupt/unsupported inputs recover by Next without reload')

  // Synthetic visibility integration is explicit; genuine Android backgrounding is a separate gate.
  await pick(['public/validation/viewer/long.webp'])
  await waitFor(`${state}==='paused'`)
  await click('Play'); await waitFor(`${frame}>=8`)
  await evaluate(`window.__stabilityHidden=true;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__stabilityHidden?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'))`)
  const hiddenAt = await evaluate(frame)
  await new Promise(resolve => setTimeout(resolve, 350))
  assert(await evaluate(frame) === hiddenAt, 'Hidden animation advanced')
  await evaluate("window.__stabilityHidden=false;document.dispatchEvent(new Event('visibilitychange'))")
  await waitFor(`${state}==='playing'&&${frame}>${hiddenAt}`)
  await click('Pause'); const pausedAt = await evaluate(frame)
  await evaluate("window.__stabilityHidden=true;document.dispatchEvent(new Event('visibilitychange'))")
  await new Promise(resolve => setTimeout(resolve, 100))
  await evaluate("window.__stabilityHidden=false;document.dispatchEvent(new Event('visibilitychange'))")
  assert(await evaluate(state) === 'paused' && await evaluate(frame) === pausedAt, 'Paused visibility intent changed')
  await evaluate("delete document.visibilityState")
  checks.push('synthetic visibility: suspend, resume intent, paused stays paused, no hidden advancement')

  await click('Play'); await waitFor(`${state}==='playing'`)
  const otherTab = await send('Target.createTarget', { url: 'about:blank', background: false })
  await send('Target.activateTarget', { targetId: otherTab.targetId })
  const hiddenRead = async () => {
    const result = await send('Runtime.evaluate', { expression: `({visibility:document.visibilityState,frame:${frame},state:${state}})`, returnByValue: true })
    return result.result.value
  }
  const genuineHidden = await hiddenRead()
  await new Promise(resolve => setTimeout(resolve, 300))
  const hiddenLater = await hiddenRead()
  if (genuineHidden.visibility === 'hidden') {
    assert(genuineHidden.state === 'paused' && genuineHidden.frame === hiddenLater.frame, 'Real background tab advanced')
  }
  await send('Target.closeTarget', { targetId: otherTab.targetId }); await send('Page.bringToFront')
  await waitFor(`${state}==='playing'`)
  await click('Pause')
  checks.push('real desktop tab visibility observed and previous playback intent restored')

  const fullscreenAvailable = await evaluate("[...document.querySelectorAll('button')].some(b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent.trim())==='Fullscreen')")
  const fullscreenRounds = mode === 'core' ? 1 : 5
  if (fullscreenAvailable) for (let round = 0; round < fullscreenRounds; round++) {
    const result = await send('Runtime.evaluate', { expression: "document.querySelector('.viewer').requestFullscreen()", userGesture: true, awaitPromise: true, returnByValue: true })
    assert(!result.exceptionDetails, 'Fullscreen rejected trusted entry')
    await waitFor("!!document.fullscreenElement")
    await send('Emulation.setDeviceMetricsOverride', { width: round % 2 ? 390 : 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await evaluate('document.exitFullscreen()'); await waitFor('!document.fullscreenElement')
  }
  await click('Play')
  for (const width of [320, 390, 768, 1280, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await waitFor(`${viewport}.viewportWidth>10`)
    assert(!await evaluate('document.documentElement.scrollWidth>innerWidth'), 'Resize overflow')
  }
  await click('Pause')
  await evaluate("document.querySelector('[data-testid=media-surface]').focus()")
  await evaluate("for(let i=0;i<20;i++)window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))")
  await waitFor(`${state}==='paused'`)
  await close()
  checks.push('fullscreen repetition when supported, five viewport resizes while playing, rapid keyboard steps')

  const { runLateVisibilityCheck } = await import('./late-visibility-scenario.mjs')
  const lateVisibility = await runLateVisibilityCheck({ evaluate, waitFor, click, pick, close, assert })
  checks.push('delayed real first frame: visibility preserves Loading, hidden commit deferred')

  let rapidSwitches = 0, closeOpenCycles = 0
  if (mode !== 'core') {
    const selection = Array.from({ length: 192 }, (_, index) => mixed[index % 6][0])
    await pick(selection); await waitFor(`${state}==='ready'`)
    await evaluate("for(let i=0;i<100;i++)[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent.trim())==='Next File').click()")
    await waitFor(`document.querySelector('[data-testid=session-position]')?.textContent==='101 / 192'&&${state}==='ready'`)
    assert(await evaluate("document.querySelector('.viewer h1').textContent") === 'quadrants.webp', 'Stale rapid-switch media committed')
    rapidSwitches = 100; await close()
    for (let round = 0; round < 24; round++) {
      await pick([mixed[round % 6][0]])
      await waitFor("!!document.querySelector('.viewer')")
      await close(); closeOpenCycles++
    }
    checks.push('100 rapid mixed-file switches, 24 immediate open/close lifecycles')
  }
  const extended = mode === 'core' ? undefined : await runExtended({ send, evaluate, waitFor, click, pick, close, assert, ready, state, runtime, cache, viewport, frame, archive, mixed, heap, mode })
  heaps.push(await heap('after-close'))
  const workers = await evaluate('window.__workerLifetime'), bitmaps = await evaluate('window.__staticBitmaps')
  const diagnostics = await evaluate(runtime), longTasks = await evaluate('window.__stabilityLongTasks')
  assert(workers.active === 0 && workers.created === workers.terminated, 'Actual Worker leak')
  assert(bitmaps.live === 0 && bitmaps.created === bitmaps.closed, 'Actual native bitmap leak')
  assert(diagnostics.activeWorkers === 0 && diagnostics.activeBitmaps === 0 && diagnostics.activeArchiveSessions === 0, 'Runtime diagnostics resources leaked')
  assert(diagnostics.workersCreated === workers.created && diagnostics.bitmapsCreated === bitmaps.created, 'Ownership counters differ from independent instrumentation')
  return { mode, url, userAgent: await evaluate('navigator.userAgent'), elapsedMs: performance.now() - started,
    formats, entries, recovery, hiddenAt, pausedAt, genuineHidden, hiddenLater, lateVisibility, fullscreenAvailable, fullscreenRounds, rapidSwitches, closeOpenCycles,
    extended, heaps, workers, bitmaps, diagnostics, longTasks, passed: checks }
}

async function runExtended(context) {
  const { runStressMatrix } = await import('./stress-matrix.mjs')
  return runStressMatrix(context)
}
