import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

export async function runStressMatrix({ send, evaluate, waitFor, click, pick, close, assert, ready, state, runtime, cache, viewport, frame, archive, mixed, heap, mode }) {
  const media = JSON.parse(await readFile('.tools/fixtures/stability/manifest.json', 'utf8'))
  const archives = JSON.parse(await readFile('.tools/fixtures/stability/archive-manifest.json', 'utf8')).archives
  const path = key => media.metadata[key].path
  const results = { largeStatic: [], rejected: [], longAnimations: [], archives: [], recovery: [], soak: {} }

  for (const key of ['boundaryJPEG', 'boundaryPNG', 'boundaryWebP']) {
    const started = performance.now()
    await pick([path(key)]); await waitFor(`${state}==='ready'`)
    await click('100%'); await waitFor(`${viewport}.mode==='actual'`)
    await click('Zoom In'); await waitFor(`${viewport}.mode==='custom'`)
    await evaluate(`(()=>{const s=document.querySelector('[data-testid=media-surface]'),b=s.getBoundingClientRect(),p={pointerId:51,pointerType:'mouse',button:0,bubbles:true};s.dispatchEvent(new PointerEvent('pointerdown',{...p,clientX:b.x+100,clientY:b.y+100}));s.dispatchEvent(new PointerEvent('pointermove',{...p,clientX:b.x+140,clientY:b.y+130}));s.dispatchEvent(new PointerEvent('pointercancel',{...p}))})()`)
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 390, deviceScaleFactor: 2, mobile: true })
    await waitFor(`${viewport}.viewportWidth>500`)
    results.largeStatic.push({ key, ...media.metadata[key], selectionAndInteractionMs: performance.now() - started,
      viewport: await evaluate(viewport), bitmaps: await evaluate('window.__staticBitmaps') })
    await close()
  }
  for (const key of ['phone12MPJPEG', 'phone12MPPNG', 'phone12MPWebP', 'overLimitAPNG']) {
    const before = await evaluate(runtime)
    await pick([path(key), mixed[0][0]]); await waitFor(`${state}==='error'`)
    const message = await evaluate("document.querySelector('.viewer [role=alert]').textContent")
    const rejected = await evaluate(runtime)
    assert(message.includes('limits'), `Uncontrolled resource error: ${key}`)
    assert(rejected.bitmapsCreated === before.bitmapsCreated, 'Oversized media started a native bitmap')
    await click('Next File'); await waitFor(`${state}==='ready'`)
    results.rejected.push({ key, message, before, rejected }); await close()
  }
  await pick([path('largeAPNG')]); await waitFor(`${state}==='paused'&&${cache}.cachedFrames===2`)
  assert(await evaluate(`${cache}.maxBytes`) === 33554432, 'Large-frame exact two-slot budget changed')
  await click('Play'); await waitFor(`${frame}===2`); await click('Pause')
  results.largeAnimation = { ...media.metadata.largeAPNG, cache: await evaluate(cache) }
  await close()

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  for (const key of ['longWebP', 'longAPNG', 'longGIF']) {
    await pick([path(key)]); await waitFor(`${state}==='paused'`)
    const started = performance.now()
    await click('Play'); await waitFor(`${frame}>=805`)
    await click('Pause'); await waitFor(`${state}==='paused'`)
    const from = await evaluate(frame), previousTimes = []
    await click('100%'); await waitFor(`${viewport}.mode==='actual'`)
    for (let step = 0; step < 5; step++) {
      const previous = await evaluate(frame), at = performance.now()
      await click('Previous Frame')
      await waitFor(`${frame}===${previous - 1}&&document.querySelector('[data-testid=viewer-operation]').textContent==='Paused'`)
      previousTimes.push(performance.now() - at)
      assert(await evaluate(`${viewport}.mode`) === 'actual', 'Reconstruction reset zoom')
    }
    const metrics = await evaluate(cache), steps = await evaluate("JSON.parse(document.querySelector('[data-testid=step-metrics]').textContent)")
    assert(metrics.peakFrames <= 6 && metrics.peakBytes <= metrics.maxBytes, '1000-frame cache grew with history')
    assert(steps.reconstructions > 0 && steps.reconstructedFrames > 700, 'No evicted-history reconstruction exercised')
    await click('Replay'); await waitFor(`${state}==='playing'&&${frame}<20`)
    results.longAnimations.push({ key, from, metrics, steps, previousTimes, elapsedMs: performance.now() - started })
    await close()
  }
  for (const key of ['logicalWebP', 'logicalAPNG', 'logicalGIF']) {
    await pick([path(key)]); await waitFor(`${state}==='paused'`)
    await click('Play'); await waitFor(`${state}==='playing'`)
    await new Promise(resolve => setTimeout(resolve, 120))
    assert(await evaluate(frame) === 1, 'Long-duration frame advanced early')
    await close()
  }

  for (const key of ['manyEntries', 'manyMedia', ...(archives.large ? ['large'] : [])]) {
    const started = performance.now()
    await pick([archives[key].path], 'archive')
    await waitFor(`${ready}&&${archive}.extractions===1`)
    const total = Number((await evaluate("document.querySelector('[data-testid=session-position]').textContent")).split('/')[1])
    const visits = key === 'manyMedia' ? total : Math.min(total, 8)
    let maxBytes = 0
    for (let index = 0; index < visits; index++) {
      if (index) await click('Next File')
      await waitFor(`${ready}&&${archive}.extractions===${index + 1}`)
      const metrics = await evaluate(archive)
      maxBytes = Math.max(maxBytes, metrics.currentExtractedBytes)
    }
    results.archives.push({ key, ...archives[key], mediaCount: total, visits, maxCurrentBytes: maxBytes,
      finalMetrics: await evaluate(archive), elapsedMs: performance.now() - started })
    await close()
  }
  await pick([archives.recovery.path], 'archive')
  const expected = ['paused', 'error', 'error', 'ready', 'error', 'paused', 'error', 'ready']
  for (let index = 0; index < expected.length; index++) {
    if (index) await click('Next File')
    await waitFor(`${state}==='${expected[index]}'&&document.querySelector('[data-testid=session-position]')?.textContent==='${index + 1} / 8'`)
    results.recovery.push({ entry: index + 1, state: await evaluate(state), message: await evaluate("document.querySelector('.viewer [role=alert]').textContent") })
  }
  await close()
  for (const key of ['truncated', 'badDirectory']) {
    await pick([archives[key].path], 'archive')
    await waitFor("document.querySelector('[data-testid=archive-status]')?.textContent==='error'")
    results.recovery.push({ archive: key, message: await evaluate("document.querySelector('.archive-summary [role=alert]').textContent") })
    await close(); await pick([mixed[0][0]]); await waitFor(`${state}==='ready'`); await close()
  }
  await pick([archives.unsupportedCompression.path], 'archive')
  await waitFor(`${state}==='error'`); await close()

  const rounds = mode === 'soak' ? 6 : 1, transitionsPerRound = 96
  const beforeSoak = await evaluate(runtime), timings = [], heaps = [await heap('before-soak')]
  for (let round = 0; round < rounds; round++) {
    const started = performance.now()
    await pick(Array.from({ length: transitionsPerRound }, (_, index) => mixed[index % 6][0]))
    for (let index = 0; index < transitionsPerRound; index++) {
      if (index) await click('Next File')
      await waitFor(`${ready}&&document.querySelector('[data-testid=session-position]')?.textContent==='${index + 1} / ${transitionsPerRound}'`)
      if (index % 6 === 5) {
        await click('Play'); await waitFor(`${state}==='playing'`)
        await click('Pause'); await click('Next Frame')
        await waitFor(`${state}==='paused'&&${frame}>=2`)
        await click('100%')
      }
    }
    await close()
    await pick([archives.manyMedia.path], 'archive'); await waitFor(ready)
    for (let index = 0; index < 6; index++) { await click('Next File'); await waitFor(`${ready}&&${archive}.extractions===${index + 2}`) }
    await close()
    timings.push(performance.now() - started)
    heaps.push(await heap(`soak-round-${round + 1}`))
  }
  const afterSoak = await evaluate(runtime)
  results.soak = { rounds, fileTransitions: rounds * (transitionsPerRound - 1), sourceOpenCloseCycles: rounds * 2,
    archiveExtractions: afterSoak.entryExtractionsCompleted - beforeSoak.entryExtractionsCompleted,
    timings, heaps, before: beforeSoak, after: afterSoak }
  // An actual background tab may differ from synthetic events; record what the installed browser exposes.
  const hiddenTarget = await send('Target.createTarget', { url: 'about:blank', background: false })
  await send('Target.activateTarget', { targetId: hiddenTarget.targetId })
  const raw = await send('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true })
  results.desktopTabVisibility = raw.result.value
  await send('Target.closeTarget', { targetId: hiddenTarget.targetId }); await send('Page.bringToFront')
  results.fixtureNames = Object.values(media.metadata).map(item => basename(item.path))
  return results
}
