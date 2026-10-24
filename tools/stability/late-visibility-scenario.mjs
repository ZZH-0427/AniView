// Hold one real Worker response; deterministic timing without a production test hook.
export async function runLateVisibilityCheck({ evaluate, waitFor, click, pick, close, assert }) {
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const frame = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.match(/Frame (\\d+)/)?.[1])"
  await close()
  await evaluate(`(()=>{
    const original=Worker.prototype.postMessage;
    window.__lateVisibility={original,armed:true,held:null,hidden:true};
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__lateVisibility.hidden?'hidden':'visible'});
    Worker.prototype.postMessage=function(message,...args){
      const gate=window.__lateVisibility;
      if(message.type==='open'&&gate.armed){
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
  try {
    await pick(['tests/fixtures/validation/viewer/long.webp'])
    await waitFor('!!window.__lateVisibility.held')
    assert(await evaluate(state) === 'loading', 'Hidden first decode lost Loading state')
    await evaluate("window.__lateVisibility.hidden=false;document.dispatchEvent(new Event('visibilitychange'))")
    assert(await evaluate(state) === 'loading', 'Visibility before first frame enabled incomplete media')
    assert(await evaluate("[...document.querySelectorAll('.playback-controls button')].every(b=>b.disabled)"), 'Loading playback controls enabled')
    await evaluate("window.__lateVisibility.hidden=true;document.dispatchEvent(new Event('visibilitychange'));const h=window.__lateVisibility.held;h.handler.call(h.worker,h.event);window.__lateVisibility.held=null")
    await waitFor(`${state}==='paused'`)
    const unpainted = await evaluate(`(()=>{const c=document.querySelector('.viewer canvas');return c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data[3]===0})()`)
    assert(unpainted, 'Hidden first frame painted before foreground')
    await evaluate("window.__lateVisibility.hidden=false;document.dispatchEvent(new Event('visibilitychange'))")
    await waitFor("(()=>{const c=document.querySelector('.viewer canvas');return c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data[3]>0})()")
    await click('Next Frame'); await waitFor(`${frame}===2`)
    await close()
    return { loadingPreserved: true, controlsDisabledBeforeFirstFrame: true, hiddenFirstFrameDeferred: true, foregroundPaintAndStep: true }
  } finally {
    await evaluate("Worker.prototype.postMessage=window.__lateVisibility.original;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));delete window.__lateVisibility")
  }
}
