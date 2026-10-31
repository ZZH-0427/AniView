// Installed-Edge product acceptance. All generated/downloaded media stay ignored.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { GifWriter, GifReader } from 'omggif'
import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js'
import { launchBrowser, sleep } from '../creation/browser.mjs'
import { encodePNG } from '../apng/generate-fixtures.mjs'

const output=resolve('.tools/conversion-product'),port='4217',url=`http://127.0.0.1:${port}/AniView/`
await mkdir(output,{recursive:true})
function makeGif(width,height,count,paired=false){
  const out=Buffer.alloc(4*1024*1024),writer=new GifWriter(out,width,height,{loop:1,palette:[0xff0000,0x00ff00,0x0000ff,0]})
  const pixels=new Uint8Array(width*height)
  for(let i=0;i<count;i++){pixels.fill((paired?Math.floor(i/2):i)%3);writer.addFrame(0,0,width,height,pixels,{delay:[2,3,10,25,50,100][i%6],disposal:2})}
  return out.subarray(0,writer.end())
}
const smallGif=makeGif(64,48,6),mediumGif=makeGif(320,240,40)
const paths={gif:join(output,'small.gif'),webp:resolve('tests/fixtures/zip/original-two-frame.webp'),apng:resolve('tests/fixtures/apng/composition.png')}
await writeFile(paths.gif,smallGif)
await writeFile(join(output,'wrong-extension.webp'),smallGif)
await writeFile(join(output,'medium.gif'),mediumGif)
await writeFile(join(output,'merged.gif'),makeGif(32,24,6,true))
await writeFile(join(output,'near-limit.gif'),makeGif(320,240,200))
await writeFile(join(output,'too-many.gif'),makeGif(2,2,201))
await writeFile(join(output,'short-timing.png'),encodePNG({width:1,height:1,loopCount:3,frames:[1,10,27].map((ms,i)=>({width:1,height:1,rgba:[[255,0,0,255],[0,255,0,128],[0,0,255,255]][i],delayNum:ms,delayDen:1000}))}))
const longName='animation-with-a-very-long-name-'.repeat(5)+'.gif'
await writeFile(join(output,longName),smallGif)
const server=spawn(process.execPath,['tools/conversion/product-preview.mjs','--port',port],{windowsHide:true,stdio:'ignore'})
let browser
const report={scope:'Actual desktop product UI; not Android acceptance',checks:[],matrix:[],resources:[],errors:[]}
const test=id=>`[data-testid="${id}"]`
try{
  let ready=false
  for(let i=0;i<100;i++){try{ready=(await fetch(url)).ok}catch{/* startup */}if(ready)break;await sleep(100)}assert(ready)
  browser=await launchBrowser(output)
  const {evaluate,waitFor,click,clickLabel,inputFiles,send}=browser
  const check=name=>{report.checks.push(name);console.log(name)}
  const debug=()=>evaluate(`JSON.parse(document.querySelector('${test('conversion-debug')}').textContent)`)
  const state=()=>evaluate(`document.querySelector('${test('conversion-status')}')?.textContent`)
  const open=async files=>{
    if(await evaluate("!!document.querySelector('[aria-label=Close]')"))await clickLabel('Close')
    await inputFiles('input[type=file][accept="image/*"]',files)
    await waitFor("['paused','ready'].includes(document.querySelector('[data-testid=playback-state]')?.textContent)")
  }
  const enter=async()=>{
    await clickLabel('More');await clickLabel('Convert animation')
    await waitFor(`['ready','error'].includes(JSON.parse(document.querySelector('${test('conversion-debug')}')?.textContent??'{}').status)`)
    const d=await debug();assert.equal(d.status,'ready');assert.equal(d.activeWorkers,d.activeArchiveSessions);assert.equal(d.activeDecoderWorkers,0);assert.equal(d.activeEncoderWorkers,0)
  }
  const choose=async target=>click(`input[name=conversion-target][value=${target}]`)
  const start=async()=>{
    await evaluate(`window.__conversionProgress=[];window.__conversionBeat={count:0,maxGapMs:0,last:performance.now()};window.__conversionTimer=setInterval(()=>{const b=window.__conversionBeat,n=performance.now();b.maxGapMs=Math.max(b.maxGapMs,n-b.last);b.last=n;b.count++},16);window.__conversionObserver=new MutationObserver(()=>{const p=document.querySelector('progress[aria-label="Animation conversion progress"]');if(p&&p.hasAttribute('value'))window.__conversionProgress.push({value:p.value,max:p.max})});window.__conversionObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['value']});`)
    await click(test('conversion-start'))
    await waitFor(`['success','error'].includes(JSON.parse(document.querySelector('${test('conversion-debug')}').textContent).status)`,120000)
    const d=await debug();assert.equal(d.status,'success',await state())
    assert.equal(d.activeWorkers,d.activeArchiveSessions);assert.equal(d.activeDecoderWorkers,0);assert.equal(d.activeEncoderWorkers,0);assert.equal(d.activeBitmaps,0);assert.equal(d.cleanupErrors,0);assert.equal(d.peakRgbaFrames,1)
    const progress=await evaluate('window.__conversionObserver.disconnect();clearInterval(window.__conversionTimer);window.__conversionProgress')
    assert(progress.every((p,i)=>p.value<=p.max&&(!i||p.value>=progress[i-1].value)),'Nonmonotonic frame progress')
    return {diagnostics:d,progress,heartbeat:await evaluate('({count:window.__conversionBeat.count,maxGapMs:window.__conversionBeat.maxGapMs})'),metadata:await evaluate(`Array.from(document.querySelectorAll('${test('conversion-result')} dd')).map(x=>x.textContent)`) }
  }
  const save=async path=>{
    const data=await evaluate(`(async()=>{const b=await(await fetch(document.querySelector('${test('conversion-download')}').href)).blob();return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(String(f.result).split(',')[1]);f.readAsDataURL(b)})})()`)
    const bytes=Buffer.from(data,'base64');await writeFile(path,bytes);return bytes
  }
  const preview=async()=>{
    const original=await evaluate(`document.querySelector('${test('conversion-download')}').href`)
    await click(test('conversion-preview'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
    await clickLabel('Play');await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='playing'");await clickLabel('Pause')
    await clickLabel('Next Frame');await clickLabel('Previous Frame');await clickLabel('Fit')
    await clickLabel('Close');await waitFor(`!!document.querySelector('${test('conversion-result')}')`)
    assert.equal(await evaluate(`document.querySelector('${test('conversion-download')}').href`),original)
  }
  await browser.navigate(url);await waitFor("!!document.querySelector('input[accept=\"image/*\"]')")
  report.startupAssets=[...browser.assets];assert(!report.startupAssets.some(x=>/ConversionWorkspace|encoder.worker|wasm/.test(x.url)))
  check('ordinary startup has no conversion coordinator/encoder/WASM requests')
  await open([paths.gif]);await clickLabel('More');await clickLabel('Convert animation')
  await waitFor(`!!document.querySelector('${test('conversion-start')}')&&!document.querySelector('${test('conversion-start')}').disabled`)
  assert.equal(await evaluate(`!!document.querySelector('${test('conversion-debug')}')`),false)
  check('ordinary conversion page has no diagnostics')
  await browser.navigate(url+'?debug=1');await waitFor("!!document.querySelector('input[accept=\"image/*\"]')")
  for(const path of ['tests/fixtures/static/quadrants.jpg','tests/fixtures/static/quadrants.png','tests/fixtures/static/quadrants.webp']){
    await open([resolve(path)]);await clickLabel('More');assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Convert animation\"]')"),false)
    await clickLabel('More')
  }
  check('JPEG/PNG/static WebP never expose Convert animation')
  await open([join(output,'wrong-extension.webp')]);await enter()
  assert.equal(await evaluate('document.querySelector("input[value=gif]").disabled'),true)
  await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  check('GIF signature overrides misleading WebP filename in Viewer and conversion')
  for(const source of ['gif','webp','apng'])for(const target of ['gif','webp','apng'].filter(x=>x!==source)){
    await open([paths[source]]);await enter()
    assert.equal(await evaluate(`document.querySelector('input[value=${source}]').disabled`),true)
    await choose(target);const row=await start();const bytes=await save(join(output,`${source}-to-${target}.${target==='apng'?'png':target}`))
    if(target==='gif'){const gif=new GifReader(bytes);assert.equal(gif.numFrames(),Number(row.metadata[1]))}
    const expected=source==='gif'?{dims:'64 × 48',frames:'6',duration:'1.900 s',plays:'2 plays'}:source==='webp'?{dims:'2 × 2',frames:'2',duration:'0.200 s',plays:'Loop forever'}:{dims:'3 × 2',frames:'8',duration:'0.800 s',plays:'Loop forever'}
    assert.deepEqual(row.metadata.slice(0,4),[expected.dims,expected.frames,expected.duration,expected.plays])
    await preview();await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
    report.matrix.push({source,target,...row,outputBytes:bytes.length})
    check(`product ${source} -> ${target}: conversion, actual metadata, existing Viewer preview, Close preview, Back to source`)
  }
  await open([join(output,'short-timing.png')]);await enter();await choose('gif')
  const gifTiming=await start();assert.equal(gifTiming.metadata[2],'0.230 s');assert.equal(gifTiming.metadata[3],'3 plays')
  await choose('webp');const webpTiming=await start();assert.equal(webpTiming.metadata[2],'0.038 s');assert.equal(webpTiming.metadata[3],'3 plays')
  await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  check('1/10/27ms finite-loop source: GIF230ms vs WebP38ms; actual decode-back timing/loop')
  await open([join(output,longName)]);await clickLabel('More')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35})
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Remove from list')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36})
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Convert animation')
  await clickLabel('Convert animation');await waitFor(`JSON.parse(document.querySelector('${test('conversion-debug')}')?.textContent??'{}').status==='ready'`)
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true})
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await click(test('conversion-back'));await send('Emulation.clearDeviceMetricsOverride')
  await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  check('menu Home/End keyboard access and long filename at320px')
  if(await evaluate("!!document.querySelector('[aria-label=Fullscreen]')")){
    await send('Runtime.evaluate',{expression:"document.querySelector('[aria-label=Fullscreen]').click()",userGesture:true})
    await sleep(80)
    const entered=await evaluate('!!document.fullscreenElement')
    if(entered){await enter();assert.equal(await evaluate('!!document.fullscreenElement'),false);await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'");check('fullscreen exits before opening converter')}
    else report.fullscreen='Request not granted by installed headless browser'
  }
  await open([join(output,'merged.gif')]);await enter();const merged=await start()
  assert.equal(merged.metadata[1],'3');assert.equal(merged.diagnostics.source.frameCount,6)
  check('WebP identical-frame merge displays actual three output frames for six source frames')
  for(const width of [320,390,768,1280]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow '+width)
    const image=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,`conversion-${width}.png`),Buffer.from(image.data,'base64'))
  }
  await send('Emulation.clearDeviceMetricsOverride')
  check('320/390/768/1280 responsive target/result layouts')
  const downloadDir=join(output,'downloads');await mkdir(downloadDir,{recursive:true})
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir,eventsEnabled:true})
  const suggestions=[]
  for(let i=0;i<2;i++){await click(test('conversion-download'));suggestions.push(await evaluate(`document.querySelector('${test('conversion-download')}').download`))}
  await waitFor('true');await sleep(250)
  const expectedDownload=await save(join(output,'repeated-expected.webp'))
  assert.notEqual(suggestions[0],suggestions[1]);for(const name of suggestions)assert.deepEqual(await readFile(join(downloadDir,name)),expectedDownload)
  check('two actual download names differ and both saved files remain')
  await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  await open(suggestions.map(name=>join(downloadDir,name)));await clickLabel('Next File')
  await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'&&document.querySelector('[data-testid=session-position]')?.textContent==='2 / 2'")
  check('both saved files reopen through the ordinary Viewer')
  await open([join(output,'medium.gif')]);await enter();await start();await save(join(output,'medium.webp'))
  await choose('apng');await start();await save(join(output,'medium.png'))
  await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  await open([join(output,'near-limit.gif')]);await enter()
  await click(test('conversion-start'));await waitFor(`!!document.querySelector('${test('conversion-cancel')}')`);await click(test('conversion-cancel'))
  await waitFor(`JSON.parse(document.querySelector('${test('conversion-debug')}').textContent).status==='cancelled'`)
  const near=await start();assert.equal(near.diagnostics.source.framePixels,15360000)
  check('near-limit200x320x240: Cancel -> rerun succeeds; monotonic progress and cleanup')
  await click(test('conversion-start'));await waitFor(`!!document.querySelector('${test('conversion-cancel')}')`)
  await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  assert.equal(await evaluate('window.__creationProbe.activeWorkers'),1)
  check('Back during conversion joins Worker teardown and reopens original source')
  await open([join(output,'too-many.gif')]);await clickLabel('More');await clickLabel('Convert animation')
  await waitFor(`JSON.parse(document.querySelector('${test('conversion-debug')}').textContent).status==='error'`)
  assert.equal((await debug()).error,'RESOURCE_LIMIT');assert.equal((await debug()).activeWorkers,0)
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true})
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await send('Emulation.clearDeviceMetricsOverride')
  check('201frames rejected safely before encoder; no Worker leak')
  await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'");await clickLabel('Close')
  const zipFiles={small:[['source.gif',smallGif],['source.webp',await readFile(paths.webp)],['source.png',await readFile(paths.apng)]],medium:[['medium.gif',mediumGif],['medium.webp',await readFile(join(output,'medium.webp'))],['medium.png',await readFile(join(output,'medium.png'))]]}
  for(const [name,entries]of Object.entries(zipFiles)){const zip=new ZipWriter(new BlobWriter('application/zip'));for(const [entry,bytes]of entries)await zip.add(entry,new BlobReader(new Blob([bytes])));await writeFile(join(output,name+'.zip'),Buffer.from(await(await zip.close()).arrayBuffer()))}
  await inputFiles('input[accept=".zip,application/zip,application/x-zip-compressed"]',[join(output,'small.zip')])
  await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  await enter();await start();await click(test('conversion-back'));await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'")
  await clickLabel('Next File');await waitFor("document.querySelector('h1')?.textContent==='source.webp'")
  check('ArchiveEntryVirtualFile conversion preserves archive and Next navigation')
  await clickLabel('Close');await open([paths.gif,paths.webp]);await enter();await start();await click(test('conversion-back'))
  await waitFor("document.querySelector('[data-testid=playback-state]')?.textContent==='paused'");await clickLabel('Next File');await waitFor("document.querySelector('h1')?.textContent.includes('original-two-frame')")
  check('loose multi-file MediaSession preserved across conversion')
  await clickLabel('Close');await waitFor("window.__creationProbe.activeWorkers===0")
  report.ownership=await evaluate('window.__creationProbe')
  assert.equal(report.ownership.urlsCreated.length,report.ownership.urlsRevoked.length)
  report.errors=browser.errors;assert.deepEqual(report.errors,[])
  report.assets=browser.assets;report.passed=true
  await writeFile(join(output,'manifest.json'),JSON.stringify({originalProgrammaticSources:true,small:'small.zip',medium:'medium.zip',mediumFrames:40,width:320,height:240},null,2))
  console.log(JSON.stringify({passed:true,matrix:report.matrix.length,checks:report.checks.length}))
}finally{await writeFile(join(output,'product-report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();server.kill()}
