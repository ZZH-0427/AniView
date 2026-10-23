export async function runViewerCheck({ send, evaluate, waitFor, click, fixture, url, capture }) {
  const canvasHash = () => evaluate(`(() => {
    const canvas=document.querySelector('canvas');
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let hash=2166136261;
    for(const byte of pixels) hash=Math.imul(hash^byte,16777619);
    return hash>>>0;
  })()`)
  const select = async path => {
    await waitFor("!!document.querySelector('input[type=file]')")
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
    await send('DOM.setFileInputFiles', { nodeId, files: [path] })
    await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  }
  await select(fixture)
  const metadata = await evaluate("document.querySelector('header').innerText")
  const firstHash = await canvasHash()
  await click('Play')
  await waitFor("Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])>3")
  await click('Pause')
  if (await canvasHash() === firstHash) throw new Error('Viewer canvas did not change')
  const paused = await evaluate("document.querySelector('[data-testid=current-frame]').textContent")
  await new Promise(resolve => setTimeout(resolve, 350))
  if (await evaluate("document.querySelector('[data-testid=current-frame]').textContent") !== paused) throw new Error('Pause did not freeze presentation')
  await click('Play')
  await waitFor(`document.querySelector('[data-testid=current-frame]')?.textContent!==${JSON.stringify(paused)}`)
  await click('Replay')
  await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='playing'&&Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])<=2")
  const frameCount = Number(metadata.match(/· (\d+) frames/)[1])
  const observation = await evaluate(`(async()=>{
    const start=performance.now(); let previous=0, maximum=0, wrapped=false, peakBytes=0, peakFrames=0;
    while(performance.now()-start<25000){
      const state=document.querySelector('[data-testid=playback-state]').textContent;
      if(state==='error') throw new Error(document.querySelector('[role=alert]').textContent);
      const current=Number(document.querySelector('[data-testid=current-frame]').textContent.split(' ')[1]);
      const metrics=JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent);
      peakBytes=Math.max(peakBytes,metrics.cacheBytes,metrics.peakBytes); peakFrames=Math.max(peakFrames,metrics.cachedFrames,metrics.peakFrames);
      if(metrics.cacheBytes>metrics.maxBytes) throw new Error('Unbounded cache');
      if(current<previous&&maximum>=${frameCount}-1){wrapped=true;break;}
      previous=current; maximum=Math.max(maximum,current);
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    return {wrapped,maximum,peakBytes,peakFrames,visibility:document.visibilityState,state:document.querySelector('[data-testid=playback-state]').textContent,metrics:JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)};
  })()`)
  if (!observation.wrapped) throw new Error('No complete animation loop observed: '+JSON.stringify(observation))
  await click('Pause')
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 2, mobile: width < 600 })
    await new Promise(resolve => setTimeout(resolve, 100))
    if (await evaluate('document.documentElement.scrollWidth>innerWidth')) throw new Error('Viewer horizontal overflow')
    await waitFor('document.querySelector("canvas").width>=document.querySelector("canvas").clientWidth*1.9')
    await capture?.(width)
  }
  await click('Close')
  await waitFor("!document.querySelector('[data-testid=playback-state]')")
  await select(fixture)
  await click('Play')
  await waitFor("Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])>2")
  await click('Close')
  await waitFor("!document.querySelector('[data-testid=playback-state]')")
  return { url, userAgent: await evaluate('navigator.userAgent'), metadata, observation, passed: ['continuous playback', 'changing canvas', 'pause/resume', 'replay', 'full loop', 'bounded cache', 'DPR and phone/desktop layout', 'close/reopen'] }
}
