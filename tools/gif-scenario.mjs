// Test-only native decoding is an independent pixel oracle, never production playback.
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

export async function runGIFCheck({send,evaluate,waitFor,click,fixture,url,capture}) {
  const dir=resolve('tests/fixtures/gif'), state="document.querySelector('[data-testid=playback-state]')?.textContent"
  const current="Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])"
  const metrics=()=>evaluate("JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)")
  const events=()=>evaluate('window.__decoderEvents')
  const close=async()=>{await click('Close');await waitFor(`!(${state})`)}
  const select=async(path,expected='paused')=>{
    await waitFor("!!document.querySelector('input[type=file]')");await evaluate('window.__decoderEvents=[]')
    const {root}=await send('DOM.getDocument'),{nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file]'})
    const start=await evaluate('performance.now()')
    await send('DOM.setFileInputFiles',{nodeId,files:[path]});await waitFor(`${state}===${JSON.stringify(expected)}`)
    return {start,firstPresentationMs:await evaluate('performance.now()')-start}
  }
  const hash=()=>evaluate(`(()=>{const c=document.querySelector('canvas'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=0;for(const b of p)h=Math.imul(h,31)+b|0;return h})()`)
  const first=await select(fixture),ready=(await events()).find(e=>e.type==='ready')
  if(!ready||ready.metadata.frameCount<20||(ready.metadata.loopCount!==0&&ready.metadata.loopCount<3))throw Error('Expected a longer real-world repeating GIF')
  const metadata=ready.metadata,firstHash=await hash()
  if(!await evaluate("document.querySelector('header').innerText.includes('GIF')"))throw Error('GIF format not displayed')
  await click('Play');await waitFor(`${current}>3`);await click('Pause')
  if(await hash()===firstHash)throw Error('GIF Canvas did not change')
  const held=await evaluate(current);await new Promise(r=>setTimeout(r,250))
  if(await evaluate(current)!==held)throw Error('Pause advanced')
  await click('Play');await waitFor(`${current}!==${held}`);await click('Replay')
  await waitFor(`${state}==='playing'&&${current}<=3`)
  const observation=await evaluate(`(async()=>{
    const start=performance.now();let loops=0,previous=0,maximum=0;
    while(performance.now()-start<25000){
      if(${state}==='error')throw Error(document.querySelector('[role=alert]').textContent);
      const f=${current},m=JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent);
      if(m.cacheBytes>m.maxBytes||m.cachedFrames>6)throw Error('GIF cache exceeded budget');
      if(f<previous&&maximum>=${metadata.frameCount}-1)loops++;
      maximum=Math.max(maximum,f);previous=f;
      if(loops>=2&&performance.now()-start>8000)break;
      await new Promise(r=>setTimeout(r,15));
    }return {loops,maximum,observedMs:performance.now()-start};
  })()`)
  if(observation.loops<2)throw Error('Two full GIF loops were not observed')
  await click('Pause')
  const cache=await metrics(),records=(await events()).filter(e=>e.type==='frame')
  const performance={decoderReadyMs:ready.readyMs,readyReceiptMs:ready.receivedAt-first.start,
    firstPresentationMs:first.firstPresentationMs,firstFrameDecodeMs:records[0].decodeMs,
    meanDecodeMs:records.reduce((sum,e)=>sum+e.decodeMs,0)/records.length,maxDecodeMs:Math.max(...records.map(e=>e.decodeMs)),
    peakBackupBytes:Math.max(...records.map(e=>e.backupBytes))}
  for(const width of [390,1280]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:2,mobile:width<600})
    await waitFor('document.querySelector("canvas").width>=document.querySelector("canvas").clientWidth*1.9')
    if(await evaluate('document.documentElement.scrollWidth>innerWidth'))throw Error('Horizontal overflow')
    await capture?.(width)
  }
  await send('Emulation.clearDeviceMetricsOverride');await close();await select(fixture)
  if(await hash()!==firstHash)throw Error('Reopen did not restore first frame')
  await close()

  const pixelCases=[]
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.gif')&&n!=='long.gif')){
    const bytes=await readFile(join(dir,name))
    const native=await evaluate(`(async()=>{
      const decoder=new ImageDecoder({data:Uint8Array.from(${JSON.stringify([...bytes])}),type:'image/gif'});
      try{await decoder.tracks.ready;const frames=[];
        for(let i=0;i<decoder.tracks.selectedTrack.frameCount;i++){
          const {image}=await decoder.decode({frameIndex:i});try{const p=new Uint8Array(image.displayWidth*image.displayHeight*4);await image.copyTo(p,{format:'RGBA'});frames.push([...p])}finally{image.close()}
        }return frames;
      }finally{decoder.close()}
    })()`)
    await select(join(dir,name));if(native.length>1)await click('Play')
    await waitFor(`window.__decoderEvents.filter(e=>e.type==='frame').length>=${native.length}`)
    if(await evaluate(state)==='playing')await click('Pause')
    const records=await events(),frames=records.filter(e=>e.type==='frame').slice(0,native.length),info=records.find(e=>e.type==='ready').metadata
    frames.forEach((f,i)=>{if(JSON.stringify(f.pixels)!==JSON.stringify(native[i]))throw Error(`${name} native pixel mismatch frame ${i}`)})
    const expectedLoop=name==='finite.gif'?3:['previous.gif','short-delay.gif'].includes(name)?0:1
    if(info.loopCount!==expectedLoop)throw Error(`${name} incorrect loop count`)
    if(name==='short-delay.gif'&&JSON.stringify(frames.map(f=>f.durationMs))!=='[100,100,20]')throw Error('Short duration policy changed')
    if(name==='finite.gif'||name==='background-opaque.gif'){
      if(await evaluate(state)==='paused')await click('Play')
      await waitFor(`${state}==='ended'`)
      const count=(await events()).filter(e=>e.type==='frame').length
      if(count!==native.length*expectedLoop)throw Error(`${name} played ${count} frames, expected ${native.length*expectedLoop}`)
      await click('Replay');await waitFor(`${state}==='ended'`)
    }
    pixelCases.push({name,frames:frames.length,loopCount:info.loopCount,durations:frames.map(f=>f.durationMs)})
    await close()
  }
  await select(join(dir,'long.gif'));await click('Play')
  await waitFor("window.__decoderEvents.filter(e=>e.type==='frame'&&e.frameIndex===99).length>=2")
  await click('Pause');const longCache=await metrics()
  if(longCache.peakFrames>6||longCache.peakBytes>longCache.maxBytes)throw Error('100-frame GIF cache exceeded budget')
  await close()
  // Sample native <img> presentation only in test tooling: ImageDecoder exposes raw delays.
  const timingBytes=await readFile(join(dir,'short-delay.gif'))
  await evaluate(`(async()=>{
    const blob=new Blob([Uint8Array.from(${JSON.stringify([...timingBytes])})],{type:'image/gif'}),img=new Image();
    img.id='native-gif-timing';img.src=URL.createObjectURL(blob);img.style='position:fixed;top:0;left:0;width:120px;height:80px;z-index:99999';document.body.append(img);await img.decode();
  })()`)
  const changes=[],started=Date.now()
  while(Date.now()-started<3000){
    const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:5,y:5,width:1,height:1,scale:1}})
    const color=await evaluate(`(async()=>{const b=await createImageBitmap(await(await fetch('data:image/png;base64,${shot.data}')).blob());try{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(b,0,0);const p=ctx.getImageData(0,0,1,1).data;return p[0]?0:p[1]?1:2}finally{b.close()}})()`)
    if(changes.at(-1)?.color!==color)changes.push({color,at:Date.now()})
  }
  await evaluate("(()=>{const i=document.getElementById('native-gif-timing');URL.revokeObjectURL(i.src);i.remove()})()")
  const nativeTiming=changes.slice(1,-1).map((v,i)=>({color:v.color,durationMs:changes[i+2].at-v.at}))
  if(![0,1,2].every(c=>nativeTiming.some(t=>t.color===c)))throw Error('Native GIF timing was not observable')
  const damaged=resolve('.tools/browser-results/truncated.gif'),bytes=await readFile(fixture)
  await writeFile(damaged,bytes.subarray(0,bytes.length-40));await select(damaged,'error')
  const corruptMessage=await evaluate("document.querySelector('[role=alert]').textContent");await close()
  const wrong=resolve('.tools/browser-results/wrong-extension.png');await writeFile(wrong,bytes)
  await select(wrong);if(!await evaluate("document.querySelector('header').innerText.includes('GIF')"))throw Error('Extension overrode signature')
  await click('Play');await waitFor(`${current}>2`);await close()
  return {url,userAgent:await evaluate('navigator.userAgent'),fixtureBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    metadata,cache,observation,performance,pixelCases,longCache,nativeTiming,corruptMessage,
    passed:['real GIF playback','pause/resume/replay/close/reopen','two full loops','native pixel conformance including 17 interlaced heights',
      'finite and absent loop end/replay','short delay policy','bounded cache','RGBA transfer','DPR responsive Canvas','corrupt recovery','binary signature over extension']}
}
