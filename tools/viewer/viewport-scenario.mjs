// Native Edge/CDP interaction checks. Device emulation is desktop automation,
// not a substitute for the milestone's separate Android acceptance.
import { resolve } from 'node:path'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const viewExpression = "JSON.parse(document.querySelector('[data-testid=viewport-metrics]')?.textContent||'null')"
const stateExpression = "document.querySelector('[data-testid=playback-state]')?.textContent"
const frameExpression = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])"
const surfaceSelector = '[data-testid=media-surface]'

export async function runViewportCheck({ send, evaluate, waitFor, click, pick, close, url }) {
  const checks = [], observations = {}
  const assert = (value, message) => { if (!value) throw new Error(`Viewport: ${message}`) }
  const near = (actual, expected, message, tolerance = 1.1) => assert(Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} vs ${expected}`)
  const snapshot = () => evaluate(viewExpression)
  const settled = async () => { await delay(100); return snapshot() }
  const lifecycle = () => evaluate('window.__workerLifetime && ({created:window.__workerLifetime.created,opens:window.__workerLifetime.opens,active:window.__workerLifetime.active})')
  const focusSurface = () => evaluate(`document.querySelector('${surfaceSelector}').focus({preventScroll:true})`)
  const bounds = () => evaluate(`(() => {
    const e=document.querySelector('${surfaceSelector}');e.scrollIntoView({block:'center'});
    const b=e.getBoundingClientRect();return {x:b.left,y:b.top,width:e.clientWidth,height:e.clientHeight};
  })()`)
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra })
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers })
  }
  const centerMouse = async () => {
    const box = await bounds()
    await mouse('mouseMoved', box.x + box.width / 2, box.y + box.height / 2)
    return box
  }
  const trustedButton = async label => {
    // fullscreenchange updates native state before React commits the button's
    // new label; wait for the actionable control rather than racing that render.
    await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>!b.disabled&&
      ((b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent.trim())===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)}))`)
    const box = await evaluate(`(() => {
      const e=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.textContent.trim())===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});
      if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});
      const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};
    })()`)
    assert(box, `Missing/disabled button ${label}`)
    await mouse('mouseMoved', box.x, box.y)
    await mouse('mousePressed', box.x, box.y, { button: 'left', buttons: 1, clickCount: 1 })
    await mouse('mouseReleased', box.x, box.y, { button: 'left', buttons: 0, clickCount: 1 })
  }
  const checkFit = (state, message) => {
    assert(state.mode === 'fit', `${message}: mode ${state.mode}`)
    near(state.scale, Math.min(state.viewportWidth / state.contentWidth, state.viewportHeight / state.contentHeight), message, 0.00001)
    near(state.offsetX, (state.viewportWidth - state.contentWidth * state.scale) / 2, `${message} centered X`)
    near(state.offsetY, (state.viewportHeight - state.contentHeight * state.scale) / 2, `${message} centered Y`)
  }
  const clampedOffset = (offset, extent, viewport) => extent <= viewport ? (viewport - extent) / 2 : Math.max(viewport - extent, Math.min(0, offset))
  const checkZoomAnchor = (before, after, x, y, message) => {
    const ratio = after.scale / before.scale
    assert(before.viewportWidth === after.viewportWidth && before.viewportHeight === after.viewportHeight,
      `${message} unexpectedly resized surface: ${before.viewportWidth}x${before.viewportHeight} -> ${after.viewportWidth}x${after.viewportHeight}`)
    near(after.offsetX, clampedOffset(x - (x - before.offsetX) * ratio, before.contentWidth * after.scale, before.viewportWidth), `${message} X`)
    near(after.offsetY, clampedOffset(y - (y - before.offsetY) * ratio, before.contentHeight * after.scale, before.viewportHeight), `${message} Y`)
  }

  await close()
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 2, mobile: false })
  await pick([resolve('tests/fixtures/static/quadrants.png')])
  await waitFor(`${stateExpression}==='ready'&&${viewExpression}?.contentWidth===40`)
  const initial = await settled()
  checkFit(initial, 'new static media Fit')
  const staticResources = await lifecycle()
  await evaluate(`(() => {
    window.__viewportOperations={};window.__viewportPostMessage=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...args){
      if(typeof message?.type==='string')window.__viewportOperations[message.type]=(window.__viewportOperations[message.type]||0)+1;
      return window.__viewportPostMessage.call(this,message,...args);
    };
    window.__viewportWheels=[];window.__viewportWheelListener=event=>window.__viewportWheels.push({
      prevented:event.defaultPrevented,trusted:event.isTrusted,surface:!!event.target.closest('[data-testid=media-surface]')
    });document.addEventListener('wheel',window.__viewportWheelListener,{passive:true});
  })()`)
  try {
    await click('100%')
    const actual = await settled()
    assert(actual.mode === 'actual' && actual.scale === 1, '100% must be one CSS pixel per image pixel')
    const backing = await evaluate(`(() => {const c=document.querySelector('canvas'),b=c.getBoundingClientRect();return {width:c.width,height:c.height,cssWidth:b.width,cssHeight:b.height,dpr:devicePixelRatio}})()`)
    near(backing.width, actual.viewportWidth * backing.dpr, 'DPR backing width')
    near(backing.height, actual.viewportHeight * backing.dpr, 'DPR backing height')
    observations.actual = { scale: actual.scale, backing }
    checks.push('Actual Size uses CSS pixels with DPR2 backing')

    await click('Fit')
    const beforeButton = await settled()
    await click('Zoom In')
    const afterButton = await settled()
    near(afterButton.scale, beforeButton.scale * 1.25, 'multiplicative zoom button', 0.00001)
    checkZoomAnchor(beforeButton, afterButton, beforeButton.viewportWidth / 2, beforeButton.viewportHeight / 2, 'button center')
    checks.push('multiplicative button zoom around viewport center')

    await click('Fit')
    const beforeWheel = await settled(), box = await bounds()
    const anchor = { x: box.width * 0.4, y: box.height * 0.45 }
    await mouse('mouseMoved', box.x + anchor.x, box.y + anchor.y)
    await mouse('mouseWheel', box.x + anchor.x, box.y + anchor.y, { deltaY: -120, deltaX: 0 })
    const afterWheel = await settled()
    assert(afterWheel.scale > beforeWheel.scale, 'trusted mouse wheel did not zoom')
    checkZoomAnchor(beforeWheel, afterWheel, anchor.x, anchor.y, 'mouse-wheel anchor')
    const consumedWheel = await evaluate('window.__viewportWheels.at(-1)')
    assert(consumedWheel?.trusted && consumedWheel.surface && consumedWheel.prevented, 'effective surface wheel did not prevent default')
    const outside = await evaluate("(() => {const b=document.querySelector('.viewer h1').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()")
    await mouse('mouseMoved', outside.x, outside.y)
    await mouse('mouseWheel', outside.x, outside.y, { deltaY: -120, deltaX: 0 })
    near((await settled()).scale, afterWheel.scale, 'wheel outside surface keeps zoom', 0.0001)
    const outsideWheel = await evaluate('window.__viewportWheels.at(-1)')
    assert(outsideWheel?.trusted && !outsideWheel.surface && !outsideWheel.prevented, 'outside wheel was globally prevented')
    checks.push('trusted mouse-wheel zoom preserves cursor anchor within pan bounds', 'wheel is consumed only by effective media-surface zoom')

    await click('Fit'); await settled()
    const doubleBox = await bounds(), dx = doubleBox.width * 0.45, dy = doubleBox.height * 0.45
    await mouse('mouseMoved', doubleBox.x + dx, doubleBox.y + dy)
    for (const clickCount of [1, 2]) {
      await mouse('mousePressed', doubleBox.x + dx, doubleBox.y + dy, { button: 'left', buttons: 1, clickCount })
      await mouse('mouseReleased', doubleBox.x + dx, doubleBox.y + dy, { button: 'left', buttons: 0, clickCount })
    }
    const detailed = await settled()
    near(detailed.scale, Math.min(detailed.fitScale * 2, detailed.maxScale), 'double-click detail scale', 0.00001)
    await mouse('mousePressed', doubleBox.x + dx, doubleBox.y + dy, { button: 'left', buttons: 1, clickCount: 1 })
    await mouse('mouseMoved', doubleBox.x + dx + 55, doubleBox.y + dy + 25, { button: 'left', buttons: 1 })
    await mouse('mouseReleased', doubleBox.x + dx + 55, doubleBox.y + dy + 25, { button: 'left', buttons: 0, clickCount: 1 })
    const panned = await settled()
    near(panned.scale, detailed.scale, 'mouse pan keeps scale', 0.00001)
    near(panned.offsetX, clampedOffset(detailed.offsetX + 55, detailed.contentWidth * detailed.scale, detailed.viewportWidth), 'mouse drag X')
    near(panned.offsetY, clampedOffset(detailed.offsetY + 25, detailed.contentHeight * detailed.scale, detailed.viewportHeight), 'mouse drag Y')
    checks.push('trusted double-click detail zoom', 'captured mouse drag pans within image bounds')

    await click('100%'); await settled(); await focusSurface()
    await key('+', 'Equal', 187)
    near((await settled()).scale, 1.25, 'keyboard plus', 0.00001)
    await key('0', 'Digit0', 48)
    checkFit(await settled(), 'keyboard Fit')
    await key('1', 'Digit1', 49)
    near((await settled()).scale, 1, 'keyboard Actual Size', 0.00001)
    await click('Zoom In'); const beforeFocused = await settled()
    await evaluate("document.querySelector('button[aria-label=\"Zoom In\"]').focus()")
    await key('0', 'Digit0', 48)
    near((await settled()).scale, beforeFocused.scale, 'focused button ignores viewer shortcuts', 0.00001)
    assert(await evaluate("document.activeElement.getAttribute('aria-label')==='Zoom In'"), 'shortcut stole button focus')
    checks.push('keyboard Fit/Actual/Zoom shortcuts', 'focused controls retain native keyboard behavior')

    assert(JSON.stringify(await lifecycle()) === JSON.stringify(staticResources), 'static transforms changed Worker ownership')
    assert(Object.values(await evaluate('window.__viewportOperations')).every(count => count === 0), 'static transforms sent decode commands')
    checks.push('static transforms reuse current pixels without decoder work')

    // Mobile geometry and trusted touch events are emulated through CDP. The
    // pointer events themselves are generated by the browser, not dispatchEvent.
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1100, deviceScaleFactor: 2, mobile: true })
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await click('Fit'); await settled()
    const touchBox = await bounds()
    const touchPoint = (id, x, y) => ({ id, x: touchBox.x + x, y: touchBox.y + y, radiusX: 2, radiusY: 2, force: 1 })
    const cx = touchBox.width / 2, cy = touchBox.height / 2
    const touch = (type, touchPoints) => send('Input.dispatchTouchEvent', { type, touchPoints })
    const touchFit = await snapshot()
    await touch('touchStart', [touchPoint(1, cx - 40, cy), touchPoint(2, cx + 40, cy)])
    await touch('touchMove', [touchPoint(1, cx - 60, cy), touchPoint(2, cx + 60, cy)])
    await touch('touchMove', [touchPoint(1, cx - 80, cy), touchPoint(2, cx + 80, cy)])
    await touch('touchEnd', [])
    const pinched = await settled()
    near(pinched.scale, Math.min(touchFit.scale * 2, touchFit.maxScale), 'trusted pinch scale', 0.0001)
    checkZoomAnchor(touchFit, pinched, cx, cy, 'pinch midpoint')
    await touch('touchStart', [touchPoint(1, cx, cy)])
    await touch('touchMove', [touchPoint(1, cx + 30, cy + 20)])
    await touch('touchEnd', [])
    const touchPanned = await settled()
    near(touchPanned.offsetX, clampedOffset(pinched.offsetX + 30, pinched.contentWidth * pinched.scale, pinched.viewportWidth), 'touch pan X')
    near(touchPanned.offsetY, clampedOffset(pinched.offsetY + 20, pinched.contentHeight * pinched.scale, pinched.viewportHeight), 'touch pan Y')
    checks.push('trusted two-finger pinch around midpoint', 'trusted single-finger bounded pan')

    await click('Fit'); await settled()
    for (let index = 0; index < 2; index++) {
      await touch('touchStart', [touchPoint(1, cx, cy)])
      await delay(35)
      await touch('touchEnd', [])
      await delay(75)
    }
    const doubleTapped = await settled()
    near(doubleTapped.scale, Math.min(doubleTapped.fitScale * 2, doubleTapped.maxScale), 'trusted double-tap scale', 0.0001)
    await touch('touchStart', [touchPoint(1, cx, cy)])
    await touch('touchCancel', [])
    const cancelled = await settled()
    await touch('touchStart', [touchPoint(1, cx, cy)])
    await touch('touchMove', [touchPoint(1, cx - 15, cy - 10)])
    await touch('touchEnd', [])
    const recovered = await settled()
    near(recovered.scale, cancelled.scale, 'pointercancel recovery keeps scale', 0.0001)
    near(recovered.offsetX, clampedOffset(cancelled.offsetX - 15, cancelled.contentWidth * cancelled.scale, cancelled.viewportWidth), 'pointercancel recovery pan X')
    checks.push('trusted double-tap zoom including capture-release lifecycle', 'pointercancel permits a fresh gesture')
    observations.touch = { fit: touchFit.scale, pinch: pinched.scale, doubleTap: doubleTapped.scale }
    await send('Emulation.setTouchEmulationEnabled', { enabled: false })

    await close()
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false })
    await pick([resolve('.tools/fixtures/animated.webp'), resolve('tests/fixtures/static/quadrants.png')])
    await waitFor(`${stateExpression}==='paused'&&${frameExpression}===1`)
    const animatedResources = await lifecycle()
    await evaluate('window.__viewportOperations={}')
    await click('Play')
    await waitFor(`${stateExpression}==='playing'&&${frameExpression}>2`)
    const playingFrame = await evaluate(frameExpression)
    await click('Zoom In'); await settled(); await click('Zoom In'); await settled()
    const playingBox = await centerMouse()
    await mouse('mouseWheel', playingBox.x + playingBox.width / 2, playingBox.y + playingBox.height / 2, { deltaY: -80, deltaX: 0 })
    await mouse('mousePressed', playingBox.x + playingBox.width / 2, playingBox.y + playingBox.height / 2, { button: 'left', buttons: 1, clickCount: 1 })
    await mouse('mouseMoved', playingBox.x + playingBox.width / 2 + 25, playingBox.y + playingBox.height / 2 + 15, { button: 'left', buttons: 1 })
    await mouse('mouseReleased', playingBox.x + playingBox.width / 2 + 25, playingBox.y + playingBox.height / 2 + 15, { button: 'left', buttons: 0, clickCount: 1 })
    await delay(300)
    assert(await evaluate(stateExpression) === 'playing', 'zoom/pan paused animation')
    assert(await evaluate(frameExpression) !== playingFrame, 'animation stopped advancing while transformed')
    assert(JSON.stringify(await lifecycle()) === JSON.stringify(animatedResources), 'zoom recreated/reopened the decoder Worker')
    assert(!(await evaluate('window.__viewportOperations.reset||0')), 'zoom reset the decoder')
    checks.push('animation continues while viewport changes', 'zoom does not reset or reopen decoder')
    await click('Pause'); await waitFor(`${stateExpression}==='paused'`)
    const pausedFrame = await evaluate(frameExpression)
    const pausedView = await settled()
    await click('Next Frame'); await waitFor(`${frameExpression}===${pausedFrame + 1}`)
    const stepped = await settled()
    near(stepped.scale, pausedView.scale, 'frame switch keeps zoom', 0.0001)
    near(stepped.offsetX, pausedView.offsetX, 'frame switch keeps pan X')
    near(stepped.offsetY, pausedView.offsetY, 'frame switch keeps pan Y')
    checks.push('frame navigation preserves viewport')

    await click('Fit'); await settled()
    const beforeResizeFrame = await evaluate(frameExpression)
    const beforeResizeWorkers = await lifecycle()
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 900, deviceScaleFactor: 2, mobile: false })
    checkFit(await settled(), 'Fit after resize/DPR change')
    assert(await evaluate(frameExpression) === beforeResizeFrame, 'resize changed the paused frame')
    await click('100%'); await settled()
    for (let index = 0; index < 6; index++) await click('Zoom In')
    const panBox = await centerMouse()
    await mouse('mousePressed', panBox.x + panBox.width / 2, panBox.y + panBox.height / 2, { button: 'left', buttons: 1, clickCount: 1 })
    await mouse('mouseMoved', panBox.x + panBox.width / 2 + 30, panBox.y + panBox.height / 2 - 15, { button: 'left', buttons: 1 })
    await mouse('mouseReleased', panBox.x + panBox.width / 2 + 30, panBox.y + panBox.height / 2 - 15, { button: 'left', buttons: 0, clickCount: 1 })
    const customBefore = await settled()
    const beforeCenter = { x: (customBefore.viewportWidth / 2 - customBefore.offsetX) / customBefore.scale,
      y: (customBefore.viewportHeight / 2 - customBefore.offsetY) / customBefore.scale }
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 960, deviceScaleFactor: 2, mobile: false })
    const customAfter = await settled()
    near(customAfter.scale, customBefore.scale, 'custom resize keeps scale', 0.0001)
    near(customAfter.offsetX, clampedOffset(customAfter.viewportWidth / 2 - beforeCenter.x * customAfter.scale,
      customAfter.contentWidth * customAfter.scale, customAfter.viewportWidth), 'custom resize visual center X')
    near(customAfter.offsetY, clampedOffset(customAfter.viewportHeight / 2 - beforeCenter.y * customAfter.scale,
      customAfter.contentHeight * customAfter.scale, customAfter.viewportHeight), 'custom resize visual center Y')
    assert(JSON.stringify(await lifecycle()) === JSON.stringify(beforeResizeWorkers), 'orientation/resize reopened decoder')
    assert(await evaluate(frameExpression) === beforeResizeFrame, 'orientation/resize restarted animation')
    checks.push('Fit recalculates after resize/DPR change', 'custom resize preserves visual center and paused frame without reopening')
    observations.resize = { before: customBefore, after: customAfter }

    await focusSurface(); await key('ArrowRight', 'ArrowRight', 39, 8)
    await waitFor(`${stateExpression}==='ready'&&${viewExpression}?.contentWidth===40`)
    checkFit(await settled(), 'keyboard next-file resets viewport')
    await focusSurface(); await key('ArrowLeft', 'ArrowLeft', 37, 8)
    await waitFor(`${stateExpression}==='paused'&&${frameExpression}===1`)
    checkFit(await settled(), 'keyboard previous-file resets viewport')
    await focusSurface(); await key(' ', 'Space', 32)
    await waitFor(`${stateExpression}==='playing'&&${frameExpression}>1`)
    await key(' ', 'Space', 32)
    await waitFor(`${stateExpression}==='paused'`)
    const beforeKeyStep = await evaluate(frameExpression)
    await key('ArrowRight', 'ArrowRight', 39)
    await waitFor(`${frameExpression}===${beforeKeyStep + 1}`)
    await key('ArrowLeft', 'ArrowLeft', 37)
    await waitFor(`${frameExpression}===${beforeKeyStep}`)
    await evaluate("document.querySelector('.session-options summary').focus()")
    await key(' ', 'Space', 32)
    await waitFor("document.querySelector('.session-options').open")
    assert(await evaluate(stateExpression) === 'paused', 'Space on summary toggled animation')
    await key(' ', 'Space', 32)
    await waitFor("!document.querySelector('.session-options').open")
    assert(await evaluate(stateExpression) === 'paused', 'Space closing summary toggled animation')
    checks.push('keyboard file navigation resets Fit', 'Space toggles playback and arrow keys step exactly one frame', 'focused summary uses native Space expansion without toggling playback')

    const fullscreenAvailable = await evaluate("!!document.querySelector('.viewer')?.requestFullscreen&&document.fullscreenEnabled!==false")
    observations.fullscreen = { available: fullscreenAvailable, verified: false }
    if (fullscreenAvailable) {
      await trustedButton('Fullscreen')
      await waitFor("document.fullscreenElement===document.querySelector('.viewer')")
      await centerMouse()
      await waitFor("document.querySelector('.viewer').classList.contains('viewer-controls-hidden')")
      await centerMouse()
      await waitFor("!document.querySelector('.viewer').classList.contains('viewer-controls-hidden')")
      await evaluate("document.querySelector('button[aria-label=\"Zoom In\"]').focus()")
      await delay(2800)
      assert(!await evaluate("document.querySelector('.viewer').classList.contains('viewer-controls-hidden')"), 'fullscreen hid keyboard-focused controls')
      await focusSurface(); await centerMouse()
      await waitFor("document.querySelector('.viewer').classList.contains('viewer-controls-hidden')")
      await centerMouse()
      const chrome = await evaluate("(() => {const b=document.querySelector('.viewer-header button').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()")
      await mouse('mouseMoved', chrome.x, chrome.y)
      await delay(2800)
      assert(!await evaluate("document.querySelector('.viewer').classList.contains('viewer-controls-hidden')"), 'fullscreen hid hovered controls')
      await focusSurface(); await key('Escape', 'Escape', 27)
      await waitFor('document.fullscreenElement===null')
      assert(!await evaluate("document.querySelector('.viewer').classList.contains('viewer-controls-hidden')"), 'controls remained hidden after exit fullscreen')
      observations.fullscreen.verified = true
      checks.push('trusted fullscreen entry and Escape exit', 'fullscreen inactivity hides chrome and pointer reveals it', 'fullscreen controls stay visible during focus or hover')
      await evaluate(`(() => {
        const e=document.querySelector('.viewer');window.__viewportFullscreenOriginal=e.requestFullscreen;
        e.requestFullscreen=()=>Promise.reject(new Error('Intentional fullscreen-rejection test'));
      })()`)
      await trustedButton('Fullscreen')
      await waitFor("document.querySelector('.viewer').textContent.includes('Fullscreen is unavailable right now.')")
      assert(await evaluate(stateExpression) === 'paused' && await evaluate('document.querySelector("canvas").width') > 1,
        'fullscreen rejection prevented continued viewing')
      await evaluate("document.querySelector('.viewer').requestFullscreen=window.__viewportFullscreenOriginal;delete window.__viewportFullscreenOriginal")
      await trustedButton('Fullscreen')
      await waitFor("document.fullscreenElement===document.querySelector('.viewer')")
      await close()
      await waitFor('document.fullscreenElement===null')
      checks.push('fullscreen rejection leaves Viewer usable with a notice', 'Close while fullscreen exits and releases resources')
    }

    assert(new URL(await evaluate('location.href')).pathname === new URL(url).pathname, 'interaction navigated away from application')
    await close()
    await waitFor('window.__workerLifetime.active===0')
    checks.push('viewport/gesture close releases current decoder Worker')
    return { checks, observations }
  } finally {
    await send('Emulation.setTouchEmulationEnabled', { enabled: false })
    await evaluate(`(() => {
      if(window.__viewportPostMessage)Worker.prototype.postMessage=window.__viewportPostMessage;
      if(window.__viewportWheelListener)document.removeEventListener('wheel',window.__viewportWheelListener);
      delete window.__viewportPostMessage;delete window.__viewportOperations;
      delete window.__viewportWheelListener;delete window.__viewportWheels;
    })()`)
  }
}
