// Real decoder/Worker integration for the format-independent stepping API.
// Diagnostic response gating is confined to this CDP test, never application code.
import { resolve } from 'node:path'

export async function runFrameStepCheck({ evaluate, waitFor, click, pick, close, url }) {
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const frame = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.match(/Frame (\\d+)/)?.[1])"
  const total = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.match(/\\/ (\\d+)/)?.[1])"
  const steps = "JSON.parse(document.querySelector('[data-testid=step-metrics]').textContent)"
  const cache = "JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)"
  const viewport = "JSON.parse(document.querySelector('[data-testid=viewport-metrics]').textContent)"
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const records = [], passed = []
  const cases = [
    { format: 'WebP', path: resolve('.tools/fixtures/viewer-long.webp'), count: 200, pauseAfter: 150 },
    { format: 'APNG', path: resolve('tests/fixtures/apng/long-bounded.png'), count: 100, pauseAfter: 55 },
    { format: 'GIF', path: resolve('tests/fixtures/gif/long.gif'), count: 100, pauseAfter: 55 },
  ]

  await close()
  await evaluate(`window.__viewerStep = async function(label) {
    const read = id => document.querySelector('[data-testid='+id+']')?.textContent;
    const index = () => Number(read('current-frame').match(/Frame (\\d+)/)[1]);
    const button = Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label);
    if (!button || button.disabled) throw new Error('Unavailable step button: '+label);
    const before=index(), target=before+(label==='Previous Frame'?-1:1);
    const beforeMetrics=JSON.parse(read('step-metrics'));
    const beforeViewport=JSON.parse(read('viewport-metrics'));
    const started=performance.now();button.click();
    while(performance.now()-started<12000) {
      if(read('playback-state')==='error')throw new Error(document.querySelector('[role=alert]').textContent);
      const busy=/Reconstructing|Decoding/.test(read('viewer-operation'));
      if(index()===target && read('playback-state')==='paused' && !busy) {
        const metrics=JSON.parse(read('playback-metrics'));
        if(metrics.cacheBytes>metrics.maxBytes||metrics.cachedFrames>6)throw new Error('Step exceeded cache budget');
        return {before,after:index(),elapsedMs:performance.now()-started,beforeMetrics,
          metrics:JSON.parse(read('step-metrics')),cache:metrics,beforeViewport,
          viewport:JSON.parse(read('viewport-metrics'))};
      }
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    throw new Error('Timed out stepping '+label+' from '+before+'; frame='+index()+'; state='+read('playback-state'));
  }`)

  const step = label => evaluate(`window.__viewerStep(${JSON.stringify(label)})`)
  const isDisabled = label => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)})?.disabled`)
  const hash = () => evaluate(`(() => {
    const canvas=document.querySelector('canvas');
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let hash=2166136261;for(const byte of data)hash=Math.imul(hash^byte,16777619);return hash>>>0;
  })()`)
  const select = async entry => {
    await pick([entry.path])
    await waitFor(`${state}==='paused'&&${frame}===1&&${total}===${entry.count}`)
    assert(await evaluate("document.querySelector('.viewer header p').textContent.startsWith(" + JSON.stringify(entry.format.toUpperCase() + ' ·') + ')'), 'Unexpected format for stepping ' + entry.format)
  }
  try {
    for (const entry of cases) {
      await select(entry)
      assert(await isDisabled('Previous Frame'), entry.format + ': previous frame enabled at first boundary')
      await click('Previous Frame')
      assert(await evaluate(frame) === 1, entry.format + ': previous wrapped at frame 1')
      // A frame switch must preserve Actual/Custom viewport, not reset to Fit.
      await click('100%')
      await waitFor(`${viewport}.mode==='actual'`)
      const firstHash = await hash()
      const initialViewport = await evaluate(viewport)
      await click('Play')
      await waitFor(`${state}==='playing'&&${frame}>=${entry.pauseAfter}&&${frame}<${entry.count - 1}`)
      const whilePlaying = await step('Next Frame')
      assert(whilePlaying.after === whilePlaying.before + 1, entry.format + ': playing step skipped frames')
      assert(JSON.stringify(whilePlaying.viewport) === JSON.stringify(initialViewport), entry.format + ': step reset viewport')
      const paused = await evaluate(frame)
      await evaluate('new Promise(resolve=>setTimeout(resolve,80))')
      assert(await evaluate(frame) === paused && await evaluate(state) === 'paused', entry.format + ': stepped frame resumed automatically')

      const hit = await step('Previous Frame')
      assert(hit.metrics.cacheHits === hit.beforeMetrics.cacheHits + 1 && hit.metrics.reconstructions === hit.beforeMetrics.reconstructions,
        entry.format + ': previous cached frame reset decoder')
      const backward = [hit]
      for (let index = 0; index < 8; index++) backward.push(await step('Previous Frame'))
      assert(backward.some(record => record.metrics.reconstructions > record.beforeMetrics.reconstructions), entry.format + ': evicted target never reconstructed')
      const reconstructed = backward.find(record => record.metrics.reconstructions > record.beforeMetrics.reconstructions)
      const afterReconstruction = backward[backward.indexOf(reconstructed) + 1]
      assert(afterReconstruction && afterReconstruction.metrics.reconstructions === afterReconstruction.beforeMetrics.reconstructions,
        entry.format + ': immediate previous after reconstruction failed neighboring-cache path')
      const target = entry.format === 'WebP' ? 20 : 1
      while (await evaluate(frame) > target) backward.push(await step('Previous Frame'))
      if (target === 1) assert(await hash() === firstHash, entry.format + ': reconstructed first frame differs from original')
      const bounded = await evaluate(cache)
      assert(bounded.peakBytes <= bounded.maxBytes && bounded.peakFrames <= 6, entry.format + ': retained unbounded history')
      assert(backward.every(record => JSON.stringify(record.viewport) === JSON.stringify(initialViewport)), entry.format + ': rewind reset viewport')

      // End boundary is a finite index even when the source loops infinitely.
      await click('Replay')
      await waitFor(`${state}==='playing'&&${frame}<6`)
      await click('Pause')
      while (await evaluate(frame) < entry.count) await step('Next Frame')
      assert(await isDisabled('Next Frame'), entry.format + ': next frame enabled at last boundary')
      await click('Next Frame')
      assert(await evaluate(frame) === entry.count && await evaluate(state) === 'paused', entry.format + ': last step wrapped')
      await step('Previous Frame')
      const finalSteps = await evaluate(steps)
      records.push({ format: entry.format, frameCount: entry.count, steppedFromPlayingAt: whilePlaying.before,
        firstBackwardCacheHitMs: hit.elapsedMs, firstReconstructionMs: reconstructed.elapsedMs,
        rewindTarget: target, rewindSteps: backward.length, cache: bounded, stepMetrics: finalSteps,
        viewportPreserved: true, timings: 'Browser UI commit latency; includes requestAnimationFrame observation.' })
      passed.push(entry.format + ': playing step pauses exactly one frame', entry.format + ': cache hit and bounded evicted-frame rewind',
        entry.format + ': repeated backward neighbor reuse', entry.format + ': first/last clamp and Replay', entry.format + ': viewport retained through steps')
      await close()
    }

    // Hold exactly one real Worker response at the transport boundary. This makes
    // the cancel race reproducible without changing decoder or application code.
    await evaluate(`(() => {
      const original=Worker.prototype.postMessage;
      window.__viewerStepGate={armed:false,held:null,original};
      Worker.prototype.postMessage=function(message,...args){
        const gate=window.__viewerStepGate;
        if(gate.armed&&message.type==='reset'){
          const handler=this.onmessage;
          this.onmessage=function(event){
            if(gate.armed&&event.data.type==='frame'){
              gate.armed=false;gate.held={worker:this,handler,event};return;
            }
            return handler?.call(this,event);
          };
        }
        return original.call(this,message,...args);
      };
    })()`)
    const cancellation = []
    for (const action of ['Next File', 'Close']) {
      await pick([cases[0].path, cases[1].path])
      await waitFor(`${state}==='paused'&&${total}===200&&${frame}===1`)
      // Advance by inspection to force a well-defined evicted target.
      for (let index = 0; index < 24; index++) await step('Next Frame')
      await step('Previous Frame'); await step('Previous Frame')
      await evaluate("window.__viewerStepGate.armed=true;Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Previous Frame').click()")
      await waitFor("!!window.__viewerStepGate.held&&document.querySelector('[data-testid=viewer-operation]')?.textContent==='Reconstructing previous frame…'")
      await click(action)
      if (action === 'Next File') await waitFor(`${state}==='paused'&&${total}===100&&${frame}===1`)
      else await waitFor("document.querySelector('h1')?.textContent==='AniView'")
      await evaluate(`(() => {
        const gate=window.__viewerStepGate,held=gate.held;
        held.handler?.call(held.worker,held.event);gate.held=null;
      })()`)
      await evaluate('new Promise(resolve=>setTimeout(resolve,100))')
      if (action === 'Next File') {
        assert(await evaluate(frame) === 1 && await evaluate(total) === 100 && await evaluate(state) === 'paused', 'Late reconstruction repainted replacement media')
        await close()
      } else assert(!await evaluate("!!document.querySelector('canvas')"), 'Late reconstruction recreated a closed Viewer')
      const workers = await evaluate('window.__workerLifetime')
      if (workers) assert(workers.active === 0, action + ' leaked decoder Worker after cancellation')
      cancellation.push({ action, heldRealResponseReleasedAfterTeardown: true, finalActiveWorkers: workers?.active })
    }
    passed.push('Next File invalidates in-flight real reconstruction', 'Close invalidates in-flight real reconstruction', 'late Worker responses cannot paint into replacement/closed Viewer')
    return { url, formats: records, cancellation, passed }
  } finally {
    await evaluate(`(() => {
      const gate=window.__viewerStepGate;if(gate)Worker.prototype.postMessage=gate.original;
      delete window.__viewerStepGate;delete window.__viewerStep;
    })()`)
  }
}
