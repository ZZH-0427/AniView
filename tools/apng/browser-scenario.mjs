// Real APNG Worker/Canvas integration through the production Viewer and native CDP.
// Only tiny generated fixtures have their pixels retained for exact assertions.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function runAPNGCheck({ send, evaluate, waitFor, click, fixture, url, capture }) {
  const fixtures = resolve('tests/fixtures/apng')
  const expectations = JSON.parse(await readFile(join(fixtures, 'expectations.json'), 'utf8'))
  const output = resolve('.tools/browser-results')
  await mkdir(output, { recursive: true })
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const current = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])"
  const events = () => evaluate('window.__decoderEvents')
  let selectionStarted = 0
  const initialViewport = await evaluate('({width:innerWidth,height:innerHeight,deviceScaleFactor:devicePixelRatio,mobile:false})')
  const canvasHash = () => evaluate(`(() => {
    const canvas=document.querySelector('canvas');
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let hash=2166136261; for(const value of data)hash=Math.imul(hash^value,16777619);
    return hash>>>0;
  })()`)
  const select = async (path, expectedState = 'paused') => {
    await waitFor("!!document.querySelector('input[type=file]')")
    await evaluate('window.__decoderEvents=[]')
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
    const started = await evaluate('performance.now()')
    selectionStarted = started
    await send('DOM.setFileInputFiles', { nodeId, files: [path] })
    await waitFor(`${state}===${JSON.stringify(expectedState)}`)
    return (await evaluate('performance.now()')) - started
  }
  const close = async () => {
    await click('Close')
    await waitFor(`!(${state})`)
  }
  const validateEvents = (records, width, height) => {
    const ready = records.find(event => event.type === 'ready')
    const frames = records.filter(event => event.type === 'frame')
    if (!ready || !Number.isFinite(ready.readyMs) || !frames.length) throw new Error('APNG instrumentation is missing')
    for (const frame of frames) {
      if (!Number.isFinite(frame.decodeMs) || frame.liveBitmaps !== 0 || !Number.isFinite(frame.backupBytes)) throw new Error('Missing decode/bitmap ownership observation')
      if (frame.backupBytes < 0 || frame.backupBytes > width * height * 4) throw new Error('PREVIOUS backup exceeded one canvas')
    }
    return { readyMs: ready.readyMs, frameCountObserved: frames.length,
      decodeCompositionMs: { min: Math.min(...frames.map(frame => frame.decodeMs)),
        mean: frames.reduce((sum, frame) => sum + frame.decodeMs, 0) / frames.length,
        max: Math.max(...frames.map(frame => frame.decodeMs)) },
      liveBitmapsAfterEmit: Math.max(...frames.map(frame => frame.liveBitmaps)),
      peakBackupBytes: Math.max(...frames.map(frame => frame.backupBytes)) }
  }

  // An actual external animation, not the generated semantic fixtures below.
  const timeToFirstFrameMs = await select(fixture)
  const timeToDecoderReadyMs = (await events()).find(event => event.type === 'ready')?.receivedAt - selectionStarted
  if (!Number.isFinite(timeToDecoderReadyMs)) throw new Error('Missing decoder ready receipt timing')
  const metadata = await evaluate("document.querySelector('header').innerText")
  if (!metadata.includes('APNG')) throw new Error('Real sample was not detected as APNG')
  const ready = (await events()).find(event => event.type === 'ready')?.metadata
  if (!ready || ready.frameCount <= 3 || ready.loopCount !== 0) throw new Error('Real-world fixture must be a multi-frame infinite APNG')
  const firstHash = await canvasHash()
  await click('Play')
  await waitFor(`${current}>3`)
  await click('Pause')
  if (await canvasHash() === firstHash) throw new Error('APNG presentation did not change')
  const paused = await evaluate(current)
  await pause(250)
  if (await evaluate(current) !== paused) throw new Error('APNG Pause did not hold the current frame')
  await click('Play')
  await waitFor(`${current}!==${paused}`)
  await click('Replay')
  await waitFor(`${state}==='playing'&&${current}<=2`)
  const observation = await evaluate(`(async()=>{
    const started=performance.now();let previous=0,maximum=0,loops=0,peakFrames=0,peakBytes=0,maxBytes=0;
    while(performance.now()-started<25000){
      if(${state}==='error')throw new Error(document.querySelector('[role=alert]').textContent);
      const frame=${current};const metrics=JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent);
      if(metrics.cacheBytes>metrics.maxBytes||metrics.cachedFrames>6)throw new Error('APNG cache exceeded its limits');
      peakFrames=Math.max(peakFrames,metrics.peakFrames,metrics.cachedFrames);peakBytes=Math.max(peakBytes,metrics.peakBytes,metrics.cacheBytes);maxBytes=metrics.maxBytes;
      if(frame<previous&&maximum>=${ready.frameCount}-1)loops++;
      maximum=Math.max(maximum,frame);previous=frame;
      if(loops>=2&&performance.now()-started>=8000)break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    return {loops,maximum,peakFrames,peakBytes,maxBytes,observedMs:performance.now()-started,
      metrics:JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)};
  })()`)
  if (observation.loops < 2) throw new Error('Two complete APNG loops were not observed: ' + JSON.stringify(observation))
  const performance = validateEvents(await events(), ready.width, ready.height)
  await click('Pause')
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 2, mobile: width < 600 })
    await waitFor('document.querySelector("canvas").width>=document.querySelector("canvas").clientWidth*1.9')
    if (await evaluate('document.documentElement.scrollWidth>innerWidth')) throw new Error('APNG Viewer horizontal overflow')
    if (!await evaluate('document.querySelector("canvas").width>=document.querySelector("canvas").clientWidth*1.9')) throw new Error('APNG Viewer DPR sizing failed')
    await capture?.(width)
  }
  await send('Emulation.setDeviceMetricsOverride', initialViewport)
  await waitFor(`Math.abs(document.querySelector('canvas').width-document.querySelector('canvas').clientWidth*${initialViewport.deviceScaleFactor})<2`)
  await close()
  await select(fixture)
  if (await canvasHash() !== firstHash) throw new Error('Close/reopen did not reproduce the first frame')
  await click('Play')
  await waitFor(`${current}>2`)
  await close()

  // Actual browser PNG decoding and OffscreenCanvas pixels, not mocked Canvas.
  const pixelCases = []
  for (const name of ['full-infinite.png', 'full-finite.png', 'composition.png', 'hidden-default.png', 'first-previous.png', 'delays.png']) {
    const expected = expectations[name]
    if (!expected?.frames?.length) throw new Error('Missing pixel expectation for ' + name)
    await select(join(fixtures, name))
    await click('Play')
    await waitFor(`window.__decoderEvents.filter(event=>event.type==='frame').length>=${expected.frames.length}`)
    await click('Pause')
    const records = await events()
    const info = records.find(event => event.type === 'ready')?.metadata
    if (!info || info.frameCount !== expected.frames.length || info.loopCount !== expected.loopCount) throw new Error('APNG frame/default-image metadata mismatch for ' + name)
    const frames = records.filter(event => event.type === 'frame').slice(0, expected.frames.length)
    frames.forEach((frame, index) => {
      if (frame.frameIndex !== index || JSON.stringify(frame.pixels) !== JSON.stringify(expected.frames[index].rgba)) {
        throw new Error(`${name} frame ${index} pixel mismatch: ${JSON.stringify(frame.pixels)} vs ${JSON.stringify(expected.frames[index].rgba)}`)
      }
      if (frame.durationMs !== expected.frames[index].durationMs) throw new Error(`${name} frame ${index} duration changed`)
    })
    pixelCases.push({ fixture: name, framesAsserted: frames.length,
      ...validateEvents(records, expected.width, expected.height) })
    if (name === 'full-finite.png') {
      if (await evaluate(state) === 'paused') await click('Play')
      await waitFor(`${state}==='ended'`)
      if (await evaluate(current) !== expected.frames.length) throw new Error('Finite loop ended before its last frame')
      await click('Replay')
      await waitFor(`${state}==='playing'&&${current}<=2`)
      await waitFor(`${state}==='ended'`)
    }
    await close()
  }

  // A longer generated stream exercises eviction beyond a six-frame prefill.
  await select(join(fixtures, 'long-bounded.png'))
  await click('Play')
  const longObservation = await evaluate(`(async()=>{
    const started=performance.now();let previous=0,maximum=0,wrapped=false;
    while(performance.now()-started<25000){
      if(${state}==='error')throw new Error(document.querySelector('[role=alert]').textContent);
      const frame=${current};const metrics=JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent);
      if(metrics.cacheBytes>metrics.maxBytes||metrics.cachedFrames>6)throw new Error('Long APNG cache exceeded its limits');
      maximum=Math.max(maximum,frame);
      if(frame<previous&&maximum>=100){wrapped=true;break;}
      previous=frame;await new Promise(resolve=>setTimeout(resolve,20));
    }
    return {completeLoopObserved:wrapped,maximumFrame:maximum,observedMs:performance.now()-started};
  })()`)
  if (!longObservation.completeLoopObserved) throw new Error('Long APNG did not complete all 100 frames')
  await click('Pause')
  const longCache = { ...await evaluate("JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)"), ...longObservation }
  if (longCache.peakFrames > 6 || longCache.peakBytes > longCache.maxBytes) throw new Error('Long APNG cache grew past budget')
  await close()

  await select(join(fixtures, 'static.png'), 'error')
  const staticMessage = await evaluate("document.querySelector('[role=alert]').textContent")
  if (!/static PNG/i.test(staticMessage)) throw new Error('Static PNG was not distinguished from APNG')
  await close()
  const damaged = join(output, 'truncated-apng.png')
  const bytes = await readFile(fixture)
  await writeFile(damaged, bytes.subarray(0, bytes.length - 30))
  await select(damaged, 'error')
  const corruptMessage = await evaluate("document.querySelector('[role=alert]').textContent")
  if (!/damaged|decode/i.test(corruptMessage)) throw new Error('Corrupt APNG was not normalized')
  await close()
  await select(fixture)
  await click('Play')
  await waitFor(`${current}>2`)
  await close()

  return { url, userAgent: await evaluate('navigator.userAgent'), fixtureBytes: bytes.length,
    metadata, timeToDecoderReadyMs, timeToFirstFrameMs, timeToFirstFrameMeasurement: 'file selection to paused Viewer; includes CDP polling',
    performance, observation, pixelCases, longCache, staticMessage, corruptMessage,
    passed: ['real APNG continuous playback', 'changing Canvas', 'pause/resume', 'replay', 'infinite loop',
      'finite end and replay', 'exact SOURCE/OVER/NONE/BACKGROUND/PREVIOUS pixels', 'hidden default and first PREVIOUS',
      'bounded cache', 'ImageBitmap closed after each frame', 'bounded PREVIOUS backup', 'DPR and responsive layout',
      'static PNG distinction', 'corrupt input', 'close/reopen and recovery'] }
}
