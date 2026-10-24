// Presentation acceptance in installed Edge. Existing media/viewport suites keep
// their behavioral assertions; these checks target icon semantics and hierarchy.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function runReleaseUICheck({ send, evaluate, waitFor, click, url, capture }) {
  const assert = (value, message) => { if (!value) throw new Error('Release UI: ' + message) }
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const frame = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.match(/Frame (\\d+)/)?.[1])"
  const position = "document.querySelector('[data-testid=session-position]')?.textContent"
  const menu = "document.querySelector('[data-testid=viewer-more-menu]')"
  const trigger = "document.querySelector('[data-testid=viewer-more-trigger]')"
  const animated = resolve('public/validation/stability/long-1000.webp')
  const photo = resolve('tests/fixtures/static/quadrants.png')
  const checks = [], layouts = [], diagnostics = []
  const button = label => `[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent.trim())===${JSON.stringify(label)})`
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers,
      ...(key === 'Enter' ? { text: '\r' } : key === ' ' ? { text: ' ' } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers })
  }
  const trustedAction = async label => {
    const point = await evaluate(`(() => {const e=${button(label)};e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 })
  }
  const pick = async (paths, kind = 'image') => {
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-testid=${kind}-input]` })
    await send('DOM.setFileInputFiles', { nodeId, files: paths.map(path => resolve(path)) })
  }
  const close = async () => {
    if (await evaluate("!!document.querySelector('.viewer')")) await click('Close')
    else if (await evaluate("!!document.querySelector('.archive-summary')")) await click('Close archive')
    await waitFor("document.querySelector('h1')?.textContent==='AniView'&&window.__workerLifetime.active===0&&window.__staticBitmaps.live===0")
  }
  const normal = new URL(url); normal.searchParams.delete('debug')
  const debug = new URL(url); debug.searchParams.set('debug', '1')
  await send('Page.navigate', { url: normal.href })
  await waitFor("document.querySelector('h1')?.textContent==='AniView'")
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await pick([animated, photo])
  await waitFor(`${state}==='paused'&&${frame}===1&&${position}==='1 / 2'`)
  const absent = await evaluate(`({panels:document.querySelectorAll('[data-testid=diagnostics-panel]').length,
    raw:document.querySelectorAll('[data-testid=diagnostics-raw]').length,
    outputs:document.querySelectorAll('[data-testid=runtime-metrics],[data-testid=playback-metrics],[data-testid=step-metrics],[data-testid=viewport-metrics],[data-testid=media-resource],[data-testid=archive-metrics]').length,
    keys:/cacheBytes|workersCreated|activeBitmaps|reconstructedFrames/.test(document.body.textContent)})`)
  assert(absent.panels === 0 && absent.raw === 0 && absent.outputs === 0 && !absent.keys, 'normal URL rendered developer diagnostics')
  checks.push('normal production URL contains no diagnostics DOM or raw counter names')

  const labels = ['Previous Frame', 'Play', 'Next Frame', 'Replay', 'Previous File', 'Next File', 'Zoom In', 'Zoom Out', 'Fit', '100%', 'Close', 'More']
  for (const label of labels) {
    const control = await evaluate(`(() => {
      const b=${button(label)};if(!b)return null;const svg=b.querySelector('svg');
      return {aria:b.getAttribute('aria-label'),title:b.getAttribute('title'),text:b.textContent.trim(),
        svg:!!svg,hidden:svg?.getAttribute('aria-hidden'),icon:svg?.getAttribute('data-icon')};
    })()`)
    assert(control?.aria === label && !!control.title && control.svg && control.hidden === 'true', 'missing named SVG action: ' + label)
    if (!['Fit', '100%'].includes(label)) assert(control.text === '', label + ' remains a text-heavy action')
  }
  assert(await evaluate(`${button('100%')}.textContent.includes('1:1')`), 'Actual Size lacks visible 1:1 support')
  assert(await evaluate(`${button('Previous Frame')}.querySelector('svg').innerHTML!==${button('Previous File')}.querySelector('svg').innerHTML`), 'frame and file navigation share an indistinguishable icon')
  assert(await evaluate(`${button('Previous Frame')}.disabled&&${button('Previous File')}.disabled`), 'first-frame/file boundaries are not disabled')
  assert(!await evaluate("!!document.querySelector('.viewer-controls [aria-label=\"Remove from list\"]')"), 'Remove remains in core toolbar')
  checks.push('all core icon buttons retain aria labels, titles and hidden uniform SVGs', '1:1 support label and visually distinct frame/file icons', 'initial frame/file disabled boundaries')

  const playIcon = await evaluate(`${button('Play')}.querySelector('svg').getAttribute('data-icon')`)
  await click('Play')
  await waitFor(`${state}==='playing'&&${frame}>=12&&!!(${button('Pause')})`)
  const pauseIcon = await evaluate(`${button('Pause')}.querySelector('svg').getAttribute('data-icon')`)
  assert(playIcon !== pauseIcon, 'play/pause accessible label changed without its icon')
  await click('Pause'); await waitFor(`${state}==='paused'&&!!(${button('Play')})`)
  const before = await evaluate(frame)
  await click('Next Frame'); await waitFor(`${state}==='paused'&&${frame}===${before + 1}`)
  assert(await evaluate(position) === '1 / 2', 'frame icon advanced files')
  await click('Previous Frame'); await waitFor(`${frame}===${before}`)
  await click('Replay'); await waitFor(`${state}==='playing'&&${frame}<6`)
  await click('Pause')
  checks.push('Play/Pause icon follows actual playback state', 'frame icons call frame handlers and Replay retains reset+play')

  await evaluate(`${trigger}.focus()`)
  assert(await evaluate(`document.activeElement===${trigger}`), 'More trigger cannot receive keyboard focus')
  await key('Enter', 'Enter', 13)
  await waitFor(`!!(${menu})&&${menu}.contains(document.activeElement)`)
  assert(await evaluate("document.activeElement.getAttribute('aria-label')==='Remove from list'"), 'More did not focus its first action')
  await key('Escape', 'Escape', 27)
  await waitFor(`!(${menu})&&document.activeElement===${trigger}`)
  await key(' ', 'Space', 32)
  await waitFor(`!!(${menu})`)
  await key('Tab', 'Tab', 9)
  await waitFor(`!(${menu})`)
  assert(await evaluate("document.activeElement.getAttribute('aria-label')==='Close'"), 'More Tab did not move to the next header control')
  await click('More')
  await waitFor(`!!(${menu})`)
  const outside = await evaluate(`(() => {const b=document.querySelector('[data-testid=media-surface]').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...outside, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...outside, button: 'left', buttons: 0, clickCount: 1 })
  await waitFor(`!(${menu})`)
  checks.push('More supports Enter/Space, menu focus, Escape restore and Tab continuation', 'outside pointer dismisses More')
  if (await evaluate(`!!(${button('Fullscreen')})`)) {
    const icon = await evaluate(`${button('Fullscreen')}.querySelector('svg').getAttribute('data-icon')`)
    await trustedAction('Fullscreen')
    await waitFor(`document.fullscreenElement===document.querySelector('.viewer')&&!!(${button('Exit Fullscreen')})`)
    assert(await evaluate(`${button('Exit Fullscreen')}.closest('header')!==null&&${button('Exit Fullscreen')}.querySelector('svg').getAttribute('data-icon')!==${JSON.stringify(icon)}`), 'fullscreen icon/placement does not follow real state')
    await trustedAction('More')
    await waitFor(`!!(${menu})&&${menu}.contains(document.activeElement)`)
    await key('Escape', 'Escape', 27)
    await waitFor(`!(${menu})&&document.activeElement===${trigger}`)
    const surface = await evaluate("(() => {const b=document.querySelector('[data-testid=media-surface]').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()")
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...surface })
    await evaluate('new Promise(resolve=>setTimeout(resolve,2800))')
    assert(await evaluate(`document.fullscreenElement===document.querySelector('.viewer')&&document.activeElement===${trigger}&&!document.querySelector('.viewer').classList.contains('viewer-controls-hidden')`), 'fullscreen Escape-returned More focus lost its visible controls hold')
    await trustedAction('Exit Fullscreen')
    await waitFor(`!document.fullscreenElement&&!!(${button('Fullscreen')})`)
    checks.push('header fullscreen icon and accessible label follow native enter/exit', 'fullscreen More Escape restores focus and keeps controls visible after inactivity')
  }
  await click('Remove from list')
  await waitFor(`${state}==='ready'&&${position}==='1 / 1'`)
  assert(!await evaluate("!!document.querySelector('.playback-controls')||!!document.querySelector('[data-testid=current-frame]')"), 'static image retained animation controls')
  assert(await evaluate(`${button('Previous File')}.disabled&&${button('Next File')}.disabled`), 'single static file navigation is not disabled')
  checks.push('Remove from More preserves session semantics and static controls remain hidden')
  await close()

  for (const width of [320, 390, 768, 1280]) {
    const height = width < 600 ? 844 : 1000
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
    await pick([animated, photo])
    await waitFor(`${state}==='paused'&&${frame}===1`)
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const layout = await evaluate(`(() => {
      const controls=[...document.querySelectorAll('.viewer button')].filter(b=>b.getClientRects().length);
      const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}};
      return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
        buttons:controls.map(b=>({label:b.getAttribute('aria-label'),...rect(b)})),
        surface:rect(document.querySelector('[data-testid=media-surface]')),
        header:rect(document.querySelector('.viewer-header')),controls:rect(document.querySelector('.viewer-bottom')),
        filename:rect(document.querySelector('.viewer h1')),close:rect(document.querySelector('[aria-label=Close]'))};
    })()`)
    assert(!layout.overflow && layout.buttons.every(b => b.width >= 44 && b.height >= 44), 'overflow or small targets at ' + width)
    assert(layout.buttons.every(b => b.y >= 0 && b.bottom <= layout.height + 1), 'normal controls extend beyond the first viewport at ' + width)
    assert(layout.filename.right <= layout.close.x, 'filename overlaps Close at ' + width)
    if (width < 600) assert(layout.surface.height > layout.controls.height && layout.surface.height > layout.header.height, 'media does not dominate mobile layout at ' + width)
    await capture?.('animated-' + width)
    await click('Next File'); await waitFor(`${state}==='ready'&&${position}==='2 / 2'`)
    assert(!await evaluate("!!document.querySelector('.playback-controls')"), 'responsive static controls include animation')
    assert(await evaluate("[...document.querySelectorAll('.viewer button')].every(b=>b.getBoundingClientRect().bottom<=innerHeight+1)"), 'static controls extend beyond the first viewport at ' + width)
    await capture?.('static-' + width)
    layouts.push(layout)
    await close()
  }
  checks.push('320/390/768/1280 normal-mode animated/static full-page screenshots, no overflow and 44px targets', 'mobile media remains larger than each controls/header region')

  const mixed = ['tests/fixtures/static/quadrants.jpg', 'tests/fixtures/gif/previous.gif', photo,
    'tests/fixtures/apng/full-infinite.png', 'tests/fixtures/static/quadrants.webp', animated]
  await pick(Array.from({ length: 192 }, (_, index) => mixed[index % mixed.length]))
  await waitFor(`${state}==='ready'&&${position}==='1 / 192'`)
  await evaluate("for(let i=0;i<100;i++)[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Next File').click()")
  await waitFor(`${state}==='ready'&&${position}==='101 / 192'`)
  assert(await evaluate("document.querySelector('.viewer h1').textContent==='quadrants.webp'"), 'rapid icon navigation committed stale media')
  await evaluate('new Promise(resolve=>setTimeout(resolve,100))')
  assert(await evaluate(`${position}==='101 / 192'&&${state}==='ready'&&document.querySelector('.viewer h1').textContent==='quadrants.webp'`), 'late result replaced rapid navigation destination')
  await close()
  const rapidSwitch = { transitions: 100, itemCount: 192, finalPosition: 101,
    workersAfterClose: await evaluate('window.__workerLifetime.active'), bitmapsAfterClose: await evaluate('window.__staticBitmaps.live') }
  await pick([animated]); await waitFor(`${state}==='paused'&&${frame}===1`)
  await close()
  checks.push('100 rapid mixed-file icon transitions select item101, discard stale work, release all resources and reopen')

  await mkdir('.tools/browser-results', { recursive: true })
  const damaged = resolve('.tools/browser-results/release-ui-damaged.gif')
  await writeFile(damaged, Buffer.from('GIF89a'))
  await pick([damaged, photo]); await waitFor(`${state}==='error'`)
  assert(await evaluate(`${button('Close')}&&!${button('Next File')}.disabled&&!!${button('More')}`), 'error lost recovery controls')
  await click('Next File'); await waitFor(`${state}==='ready'`)
  await close()
  checks.push('error state preserves icon recovery controls and Next opens a good image')
  const normalResources = await evaluate(`({workers:{created:window.__workerLifetime.created,terminated:window.__workerLifetime.terminated,active:window.__workerLifetime.active,peak:window.__workerLifetime.peakActive},bitmaps:window.__staticBitmaps})`)

  await send('Page.navigate', { url: debug.href })
  await waitFor("document.querySelector('h1')?.textContent==='AniView'")
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await pick([animated]); await waitFor(`${state}==='paused'`)
  const panels = await evaluate("[...document.querySelectorAll('[data-testid=diagnostics-panel]')].map(e=>({label:e.querySelector('summary').textContent,open:e.open}))")
  assert(panels.some(panel => /Image/.test(panel.label)) && panels.some(panel => /Resource/.test(panel.label)) && panels.every(panel => !panel.open), 'debug panels are missing or initially open')
  assert(!await evaluate("/cacheBytes|workersCreated/.test(document.body.innerText)"), 'collapsed debug panel leaks raw JSON visually')
  assert(await evaluate("[...document.querySelectorAll('[data-testid=diagnostics-raw]')].every(e=>!e.open)"), 'Raw JSON is not initially collapsed')
  diagnostics.push({ stage: 'default', panels })
  await capture?.('debug-collapsed-390')
  await evaluate("[...document.querySelectorAll('[data-testid=diagnostics-panel]')].find(e=>/Image/.test(e.querySelector('summary').textContent)).querySelector('summary').click()")
  await waitFor("[...document.querySelectorAll('[data-testid=diagnostics-panel]')].some(e=>e.open&&/Image/.test(e.querySelector('summary').textContent))")
  assert(!await evaluate("/cacheBytes/.test(document.body.innerText)"), 'friendly diagnostics expansion immediately exposes raw JSON')
  const parsed = await evaluate("Object.fromEntries(['playback-metrics','step-metrics','viewport-metrics','media-resource','runtime-metrics'].map(id=>[id,JSON.parse(document.querySelector('[data-testid='+id+']').textContent)]))")
  assert(parsed['playback-metrics'].maxBytes === 16777216 && parsed['runtime-metrics'].activeWorkers === 1, 'diagnostics lost its original counters/budget')
  await capture?.('debug-expanded-390')
  await evaluate("[...document.querySelectorAll('[data-testid=diagnostics-panel]')].find(e=>/Image/.test(e.querySelector('summary').textContent)).querySelector('[data-testid=diagnostics-raw] > summary').click()")
  await waitFor("[...document.querySelectorAll('[data-testid=diagnostics-raw]')].some(e=>e.open)")
  assert(await evaluate("document.querySelector('[data-testid=playback-metrics]').getClientRects().length>0"), 'expanded Raw JSON is inaccessible')
  await evaluate("document.querySelector('[data-testid=playback-metrics]').scrollIntoView({block:'nearest'})")
  await capture?.('debug-raw-390')
  diagnostics.push({ stage: 'expanded', parsed })
  checks.push('debug diagnostics default collapsed with friendly expandable sections', 'nested Raw JSON stays opt-in and all original counters remain readable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 667, deviceScaleFactor: 1, mobile: true })
  await evaluate("for(const panel of document.querySelectorAll('[data-testid=diagnostics-panel]'))if(!panel.open)panel.querySelector('summary').click()")
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  const expandedLayout = await evaluate(`(() => {
    const regions=[...document.querySelectorAll('.viewer-header,[data-testid=media-surface],.viewer-controls,[data-testid=diagnostics-panel]')]
      .filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return {name:e.getAttribute('data-testid')||e.className,top:b.top,bottom:b.bottom,left:b.left,right:b.right}});
    const overlaps=[];
    for(let a=0;a<regions.length;a++)for(let b=a+1;b<regions.length;b++){
      const x=regions[a],y=regions[b];
      if(Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1&&Math.min(x.right,y.right)-Math.max(x.left,y.left)>1)overlaps.push([x.name,y.name]);
    }
    return {regions,overlaps,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`)
  assert(!expandedLayout.overflow && expandedLayout.overlaps.length === 0, 'short expanded diagnostics overlap media/controls/panels: ' + JSON.stringify(expandedLayout))
  const reachable = await evaluate(`(async()=>{
    const result=[];
    for(const b of document.querySelectorAll('.viewer button:not([disabled])')){
      b.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(resolve));
      const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
      result.push({label:b.getAttribute('aria-label'),inViewport:x>=0&&x<innerWidth&&y>=0&&y<innerHeight,hit:!!hit&&b.contains(hit)});
    }
    return result;
  })()`)
  assert(reachable.every(item => item.inViewport && item.hit), 'short expanded diagnostics obstruct scroll-to controls: ' + JSON.stringify(reachable))
  diagnostics.push({ stage: '390x667 expanded', ...expandedLayout, reachable })
  await capture?.('debug-expanded-390x667')
  checks.push('390x667 expanded diagnostics do not overlap; all enabled controls scroll into view and receive pointer hits')
  await close()

  await pick(['public/validation/viewer/mixed-media.zip'], 'archive')
  await waitFor(`${state}==='ready'&&JSON.parse(document.querySelector('[data-testid=archive-metrics]').textContent).extractions===1`)
  assert(await evaluate("[...document.querySelectorAll('[data-testid=diagnostics-panel]')].some(e=>/Archive/.test(e.querySelector('summary').textContent)&&!e.open)"), 'archive diagnostics is not initially collapsed')
  await click('Next File'); await waitFor(`${state}==='paused'&&JSON.parse(document.querySelector('[data-testid=archive-metrics]').textContent).extractions===2`)
  await close()
  const workers = await evaluate('window.__workerLifetime'), bitmaps = await evaluate('window.__staticBitmaps')
  assert(workers.active === 0 && workers.created === workers.terminated && bitmaps.live === 0 && bitmaps.created === bitmaps.closed, 'UI navigation retained media resources')
  checks.push('ZIP diagnostics remains collapsed and extraction remains current-only', 'icon/menu navigation closes all Workers and static bitmaps')
  return { normalURL: normal.href, debugURL: debug.href, userAgent: await evaluate('navigator.userAgent'), layouts, diagnostics, rapidSwitch, normalResources, workers, bitmaps, checks }
}
