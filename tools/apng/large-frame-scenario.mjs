// Real Worker/Canvas/Viewer regression for generated high-resolution APNGs.
// Does not retain decoded frames or claim to exercise the user's private file.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function runLargeAPNGCheck({ send, evaluate, waitFor, click, fixture, url }) {
  const width = 1280, height = 1910, frameCount = 12
  const fullRGBABytes = width * height * 4
  const expectedBudget = fullRGBABytes * 2
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const current = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])"
  const metrics = "JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)"
  const events = () => evaluate('window.__decoderEvents')
  const select = async (path, expectedState = 'paused') => {
    await waitFor("!!document.querySelector('input[type=file]')")
    await evaluate('window.__decoderEvents=[]')
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
    await send('DOM.setFileInputFiles', { nodeId, files: [path] })
    await waitFor(`${state}===${JSON.stringify(expectedState)}`)
  }
  const close = async () => {
    await click('Close')
    await waitFor(`!(${state})`)
  }
  const hash = () => evaluate(`(() => {
    const canvas=document.querySelector('canvas');
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let value=2166136261;for(const byte of pixels)value=Math.imul(value^byte,16777619);
    return value>>>0;
  })()`)

  await select(fixture)
  const ready = (await events()).find(event => event.type === 'ready')
  if (!ready || ready.metadata.width !== width || ready.metadata.height !== height ||
      ready.metadata.frameCount !== frameCount || ready.metadata.loopCount !== 0) {
    throw new Error('Expected generated 1280×1910, 12-frame infinite APNG: ' + JSON.stringify(ready))
  }
  if (!await evaluate("document.querySelector('header').innerText.includes('APNG')")) {
    throw new Error('Large fixture was not detected as APNG')
  }
  const initialHash = await hash()
  await click('Play')
  await waitFor(`${current}>3`)
  await click('Pause')
  const pausedAt = await evaluate(current)
  if (await hash() === initialHash) throw new Error('Large APNG Canvas did not change')
  await pause(250)
  if (await evaluate(current) !== pausedAt) throw new Error('Large APNG Pause did not hold')
  await click('Play')
  await waitFor(`${current}!==${pausedAt}`)
  await click('Replay')
  await waitFor(`${state}==='playing'&&${current}<=2`)

  const observation = await evaluate(`(async()=>{
    const started=performance.now();let previous=0,maximum=0,loops=0;
    let minFrames=Infinity,maxFrames=0,peakFrames=0,peakBytes=0,maxBytes=0;
    while(performance.now()-started<15000){
      if(${state}==='error')throw new Error(document.querySelector('[role=alert]').textContent);
      const frame=${current};const metrics=${metrics};
      if(metrics.maxBytes!==${expectedBudget}||metrics.maxBytes>33554432||
        metrics.cacheBytes>metrics.maxBytes||metrics.peakBytes>metrics.maxBytes||metrics.cachedFrames>2||metrics.peakFrames>2){
        throw new Error('Large APNG cache exceeded its frame-derived budget: '+JSON.stringify(metrics));
      }
      minFrames=Math.min(minFrames,metrics.cachedFrames);maxFrames=Math.max(maxFrames,metrics.cachedFrames);
      peakFrames=Math.max(peakFrames,metrics.peakFrames);peakBytes=Math.max(peakBytes,metrics.peakBytes);maxBytes=metrics.maxBytes;
      if(frame<previous&&maximum>=${frameCount})loops++;
      maximum=Math.max(maximum,frame);previous=frame;
      if(loops>=2&&performance.now()-started>=3000)break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    return {loops,maximumFrame:maximum,minCachedFrames:minFrames,maxCachedFrames:maxFrames,
      peakFrames,peakBytes,maxBytes,observedMs:performance.now()-started,finalMetrics:${metrics}};
  })()`)
  if (observation.loops < 2 || observation.peakFrames !== 2 || observation.peakBytes !== expectedBudget) {
    throw new Error('Two full loops and two-frame bounded cache were not observed: ' + JSON.stringify(observation))
  }
  await click('Pause')
  const frames = (await events()).filter(event => event.type === 'frame')
  if (frames.length < frameCount * 2 || frames.some(frame => frame.liveBitmaps !== 0 ||
      frame.backupBytes < 0 || frame.backupBytes > fullRGBABytes || !Number.isFinite(frame.decodeMs))) {
    throw new Error('Large APNG bitmap/PREVIOUS/decode observations are invalid')
  }
  const peakBackupBytes = Math.max(...frames.map(frame => frame.backupBytes))
  if (peakBackupBytes !== 128 * 192 * 4) throw new Error('Large partial-frame PREVIOUS backup was not observed')
  const decodeCompositionMs = { min: Math.min(...frames.map(frame => frame.decodeMs)),
    mean: frames.reduce((sum, frame) => sum + frame.decodeMs, 0) / frames.length,
    max: Math.max(...frames.map(frame => frame.decodeMs)) }
  await close()
  await select(fixture)
  if (await hash() !== initialHash) throw new Error('Large APNG Close/reopen changed the first frame')
  await click('Play')
  await waitFor(`${current}>2`)
  await close()

  // A different generated canvas crosses the supported-frame policy by 16 KiB.
  // An explicit limit response must not be reported as actual browser exhaustion.
  const overLimitFixture = join(dirname(fixture), 'over-limit-apng-4096x1025.png')
  await select(overLimitFixture, 'error')
  const resourceLimitMessage = await evaluate("document.querySelector('[role=alert]').textContent")
  if (!/limit/i.test(resourceLimitMessage) || /not enough memory/i.test(resourceLimitMessage)) {
    throw new Error('Resource policy was not clearly distinguished from actual OOM: ' + resourceLimitMessage)
  }
  if ((await events()).some(event => event.type === 'ready' || event.type === 'frame')) {
    throw new Error('Over-limit image reached canvas initialization/frame decode')
  }
  await close()
  await select(fixture)
  await click('Play')
  await waitFor(`${current}>2`)
  await close()

  return { url, userAgent: await evaluate('navigator.userAgent'),
    fixtureSource: 'Generated original regression image; not the private 13.56 MB Android file.',
    fixtureBytes: (await readFile(fixture)).length, dimensions: { width, height }, frameCount,
    fullRGBABytes, expectedBudget, hardCacheCeilingBytes: 32 * 1024 * 1024,
    observation, workerFramesObserved: frames.length, peakBackupBytes, decodeCompositionMs,
    resourceLimitMessage,
    passed: ['1280×1910 animation opens', 'changing Canvas', 'pause/resume', 'replay',
      'two complete loops', 'exact two-frame cache budget below 32 MiB ceiling',
      'ImageBitmap closed before frame output', 'partial-frame PREVIOUS bounded backup',
      'close/reopen', 'explicit policy rejection above supported frame size', 'recovery after policy rejection'] }
}
