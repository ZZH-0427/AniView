// Real Edge/CDP coverage of the public input/session flow. Files stay local to
// the browser; the report contains only metadata, lifecycle counts and hashes.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function runInputCheck({ send, evaluate, waitFor, click, fixture, url, capture }) {
  const output = resolve('.tools/browser-results/input-fixtures')
  await mkdir(output, { recursive: true })
  const webp = resolve(fixture)
  const apng = resolve('.tools/fixtures/bouncing-beach-ball.png')
  const gif = resolve('.tools/fixtures/rotating-earth.gif')
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const position = "document.querySelector('[data-testid=session-position]')?.textContent"
  const title = "document.querySelector('.viewer h1')?.textContent"
  const frame = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])"
  const passed = []
  const lifecycle = () => evaluate('window.__workerLifetime')
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const isDisabled = label => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)})?.disabled`)
  const expectCurrent = async (path, expectedFormat, index, total, expectedState = 'paused') => {
    await waitFor(`${title}===${JSON.stringify(basename(path))}&&${position}===${JSON.stringify(`${index} / ${total}`)}&&${state}===${JSON.stringify(expectedState)}`)
    if (expectedFormat) {
      const metadata = await evaluate("document.querySelector('.viewer header p').textContent")
      assert(metadata.startsWith(expectedFormat.toUpperCase() + ' ·'), 'Wrong/stale file format: ' + metadata)
      const ready = await evaluate("window.__workerLifetime.history.filter(e=>e.type==='ready').at(-1)?.metadata")
      assert(metadata.includes(`${ready.width} × ${ready.height}`) && metadata.includes(`${ready.frameCount} frames`), 'Stale metadata after file switch')
    }
  }
  const pick = async paths => {
    await waitFor("!!document.querySelector('input[type=file]')")
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
    await send('DOM.setFileInputFiles', { nodeId, files: paths })
  }
  const empty = async (label = 'Clear session') => {
    await click(label)
    await waitFor(`!(${state})&&document.querySelector('h1')?.textContent==='AniView'`)
    await waitFor('window.__workerLifetime.active===0')
    assert(!await evaluate('!!document.querySelector("canvas")'), 'Empty session retained an old canvas')
  }
  const drop = async descriptors => {
    const payload = await Promise.all(descriptors.map(async descriptor => ({
      name: descriptor.name ?? basename(descriptor.path), type: descriptor.type ?? '',
      bytes: (await readFile(descriptor.path)).toString('base64'),
    })))
    return evaluate(`(() => {
      const data=new DataTransfer();
      for(const file of ${JSON.stringify(payload)}){
        const bytes=Uint8Array.from(atob(file.bytes),c=>c.charCodeAt(0));
        data.items.add(new File([bytes],file.name,{type:file.type}));
      }
      const target=document.querySelector('main');
      target.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
      const over=new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data});target.dispatchEvent(over);
      const drop=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data});target.dispatchEvent(drop);
      return {overPrevented:over.defaultPrevented,dropPrevented:drop.defaultPrevented,url:location.href};
    })()`)
  }
  const hash = () => evaluate(`(() => {
    const canvas=document.querySelector('canvas'), pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let hash=2166136261;for(const byte of pixels)hash=Math.imul(hash^byte,16777619);return hash>>>0;
  })()`)
  const navigation = async (label, path, format, index, total, expectedState) => {
    await click(label); await expectCurrent(path, format, index, total, expectedState)
  }

  await waitFor("document.querySelector('h1')?.textContent==='AniView'")
  const capabilities = await evaluate("({showOpenFilePicker:typeof window.showOpenFilePicker,Worker:typeof Worker,DataTransfer:typeof DataTransfer})")
  const baseline = await evaluate(`(() => {
    const input=document.querySelector('input[type=file]');
    return {count:document.querySelectorAll('input[type=file]').length,accept:input.accept,multiple:input.multiple,capture:input.getAttribute('capture')};
  })()`)
  assert(baseline.count === 1 && baseline.accept === 'image/*' && baseline.multiple && baseline.capture === null, 'Input baseline is incorrect')
  // Report what this browser exposes; the product deliberately keeps the HTML
  // input baseline even where the optional File System Access picker exists.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
  await evaluate('document.activeElement?.blur()')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  const focus = await evaluate("({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle,width:getComputedStyle(document.activeElement).outlineWidth})")
  assert(focus.tag === 'BUTTON' && focus.outline !== 'none' && parseFloat(focus.width) >= 2, 'Keyboard input action lacks visible focus')
  const layouts = []
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
    await delay(100)
    const layout = await evaluate(`(() => {
      const button=document.querySelector('.image-picker');
      return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,buttonHeight:button.getBoundingClientRect().height,
        visibleLabel:Array.from(button.children).filter(s=>getComputedStyle(s).display!=='none').map(s=>s.textContent).join(''),
        dropHintVisible:getComputedStyle(document.querySelector('.drop-hint')).display!=='none'};
    })()`)
    assert(!layout.overflow && layout.buttonHeight >= 44, 'Home layout/touch target failed')
    assert(layout.visibleLabel === (width < 600 ? '选择图片' : 'Open Images'), 'Wrong responsive primary action')
    if (width < 600) assert(!layout.dropHintVisible, 'Mobile home promotes drag/drop')
    layouts.push(layout)
    await capture?.(`home-${width}`)
  }
  passed.push('standard image/* multiple input without capture', 'keyboard focus', 'responsive Home and touch targets')

  await pick([webp])
  await expectCurrent(webp, 'webp', 1, 1)
  assert(await isDisabled('Previous') && await isDisabled('Next'), 'Single-item navigation did not stop at ends')
  assert(await evaluate("document.querySelector('input[type=file]').value===''"), 'File input was not reset after selection')
  const firstHash = await hash()
  const one = await lifecycle()
  assert(one.active === 1 && one.opens === 1, 'A single selection did not open exactly its current file')
  // A cancelled/empty picker result must preserve both current file and Worker.
  await pick([])
  await delay(150)
  await expectCurrent(webp, 'webp', 1, 1)
  assert((await lifecycle()).created === one.created, 'Picker cancel replaced the current decoder')
  passed.push('single selection', 'input reset', 'empty picker/cancel leaves session unchanged')

  await pick([apng, gif, gif])
  await expectCurrent(webp, 'webp', 1, 4)
  const appended = await lifecycle()
  assert(appended.created === one.created && appended.opens === one.opens, 'Append eagerly decoded unvisited files')
  await navigation('Next', apng, 'apng', 2, 4)
  await navigation('Next', gif, 'gif', 3, 4)
  await navigation('Next', gif, 'gif', 4, 4)
  assert(await isDisabled('Next'), 'Last item wraps instead of disabling Next')
  await navigation('Previous', gif, 'gif', 3, 4)
  await click('Remove from list')
  await expectCurrent(gif, 'gif', 3, 3)
  await click('Remove from list')
  await expectCurrent(apng, 'apng', 2, 2)
  await click('Remove from list')
  await expectCurrent(webp, 'webp', 1, 1)
  await empty('Remove from list')
  passed.push('append preserves current/order without eager decoding', 'duplicates retained', 'previous/next boundaries', 'remove current and last item')

  await pick([webp, apng, gif])
  await expectCurrent(webp, 'webp', 1, 3)
  assert(await hash() === firstHash, 'Same-file reselect failed after close')
  await click('Play')
  await waitFor(`${state}==='playing'&&${frame}>2`)
  await navigation('Next', apng, 'apng', 2, 3)
  await click('Play')
  await waitFor(`${state}==='playing'&&${frame}>2`)
  // Navigate faster than decode completion, with React allowed one event turn
  // between clicks. The final item is APNG, with its own paused first frame.
  await click('Next'); await click('Previous'); await click('Previous'); await click('Next')
  await expectCurrent(apng, 'apng', 2, 3)
  await delay(400)
  await expectCurrent(apng, 'apng', 2, 3)
  assert(await evaluate(frame) === 1, 'A stale player advanced the replacement item')
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 2, mobile: width < 600 })
    await delay(120)
    assert(!await evaluate('document.documentElement.scrollWidth>innerWidth'), 'Session controls overflow viewport')
    const controls = await evaluate("Array.from(document.querySelectorAll('.session-actions button,.viewer-controls button')).map(b=>({label:b.textContent,height:b.getBoundingClientRect().height}))")
    assert(controls.every(button => button.height >= 44), 'Small session/player touch target')
    await capture?.(`viewer-${width}`)
  }
  await empty('Close')
  await pick([webp])
  await expectCurrent(webp, 'webp', 1, 1)
  await empty('Close')
  passed.push('multi-selection order', 'switch during playback', 'rapid next/previous during loading', 'stale callbacks cannot replace current metadata/frame', 'Close/reselect same file', 'responsive session controls')

  const tinyGIFPath = resolve('tests/fixtures/gif/previous.gif')
  const tinyGIF = (await readFile(tinyGIFPath)).toString('base64')
  // Exercise nested drag events across children, where naïve leave handlers
  // otherwise flicker the overlay before the pointer leaves the drop surface.
  await evaluate(`(() => {
    const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(${JSON.stringify(tinyGIF)}),c=>c.charCodeAt(0))],'tiny.gif'));
    window.__testDragData=data;
    document.querySelector('main').dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
  })()`)
  await waitFor("!!document.querySelector('.drop-overlay')")
  await evaluate(`(() => {
    const child=document.querySelector('main h1');
    child.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:window.__testDragData}));
    child.dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:window.__testDragData}));
  })()`)
  await delay(50)
  assert(await evaluate("!!document.querySelector('.drop-overlay')"), 'Nested child dragleave hid the overlay')
  await evaluate("document.querySelector('main').dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:window.__testDragData}));delete window.__testDragData")
  await waitFor("!document.querySelector('.drop-overlay')")
  await evaluate(`(() => {
    const data=new DataTransfer();data.items.add(new File(['x'],'drag-only.gif'));
    document.querySelector('main').dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
  })()`)
  await waitFor("!!document.querySelector('.drop-overlay')")
  await evaluate("window.dispatchEvent(new DragEvent('dragend'))")
  await waitFor("!document.querySelector('.drop-overlay')")
  passed.push('nested drag enter/leave overlay remains stable')

  // Drag real File objects through the same window listeners as an OS drop.
  // These events are synthetic, so defaultPrevented is the observable navigation
  // guard; the browser URL is also checked after every file/non-file drop.
  const dragChecks = []
  dragChecks.push(await drop([{ path: gif, type: 'image/gif' }]))
  await expectCurrent(gif, 'gif', 1, 1)
  assert(!await evaluate("!!document.querySelector('.drop-overlay')"), 'Drop retained its overlay')
  dragChecks.push(await drop([{ path: webp }, { path: apng }]))
  await expectCurrent(gif, 'gif', 1, 3)
  await navigation('Next', webp, 'webp', 2, 3)
  await navigation('Next', apng, 'apng', 3, 3)
  await empty()
  dragChecks.push(await drop([{ path: apng }, { path: gif }]))
  await expectCurrent(apng, 'apng', 1, 2)
  dragChecks.push(await drop([{ path: webp }]))
  await expectCurrent(apng, 'apng', 1, 3)
  assert(dragChecks.every(check => check.overPrevented && check.dropPrevented && check.url === url), 'File drop lost navigation prevention')
  const beforeTextDrop = await lifecycle()
  const nonFileDrops = await evaluate(`(() => {
    const results=[];
    for(const kind of ['text/plain','text/html','text/uri-list','empty']){
      const data=new DataTransfer();if(kind!=='empty')data.setData(kind,kind==='text/uri-list'?'https://example.com/':'<p>ignored</p>');
      const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data});document.body.dispatchEvent(event);
      results.push({kind,prevented:event.defaultPrevented});
    }
    return results;
  })()`)
  await delay(150)
  await expectCurrent(apng, 'apng', 1, 3)
  assert((await lifecycle()).created === beforeTextDrop.created && await evaluate('location.href') === url, 'Non-file drop changed the session/page')
  await empty()
  passed.push('single/multiple File drops from Home and Viewer', 'drop order and append', 'file-drop navigation prevention', 'text/URL/HTML/empty drops ignored')

  // Native static encoding is confined to this test setup, never application
  // viewing. Keep generated binaries outside the repository fixtures.
  const staticData = await evaluate(`(() => {
    const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);
    return {jpeg:canvas.toDataURL('image/jpeg').split(',')[1],webp:canvas.toDataURL('image/webp').split(',')[1]};
  })()`)
  const staticJPEG = join(output, 'static.jpg'), staticWebP = join(output, 'static.webp')
  await writeFile(staticJPEG, Buffer.from(staticData.jpeg, 'base64'))
  await writeFile(staticWebP, Buffer.from(staticData.webp, 'base64'))
  const unknown = join(output, 'random.bin'), falseGIF = join(output, 'text.gif'), corrupt = join(output, 'damaged.gif')
  await writeFile(unknown, Buffer.from([0, 11, 213, 34, 255, 3, 99, 81]))
  await writeFile(falseGIF, 'This is not an image.')
  await writeFile(corrupt, (await readFile(gif)).subarray(0, 20))
  const staticPNG = resolve('tests/fixtures/apng/static.png')
  const cases = [
    { path: staticPNG, category: 'static' }, { path: staticJPEG, category: 'static' },
    { path: staticWebP, category: 'static' }, { path: unknown, category: 'unsupported' },
    { path: falseGIF, category: 'unsupported' }, { path: corrupt, category: 'corrupted' },
  ]
  await pick([...cases.map(entry => entry.path), gif])
  const errorCases = []
  for (let i = 0; i < cases.length; i++) {
    const test = cases[i]
    await expectCurrent(test.path, undefined, i + 1, cases.length + 1, 'error')
    const message = await evaluate("document.querySelector('[role=alert]').textContent")
    assert(test.category === 'static' ? /static image/i.test(message)
      : test.category === 'corrupted' ? /damaged|corrupt|decode/i.test(message)
        : /not supported|unsupported/i.test(message), `Wrong ${test.category} message: ${message}`)
    errorCases.push({ file: basename(test.path), category: test.category, message })
    await click('Next')
  }
  await expectCurrent(gif, 'gif', cases.length + 1, cases.length + 1)
  await click('Play'); await waitFor(`${state}==='playing'&&${frame}>2`)
  await empty()
  passed.push('static PNG/JPEG/WebP distinguished', 'unknown and fake-extension file rejected', 'damaged supported container normalized', 'failed item preserves session and Next recovery')

  const mismatches = [
    { path: webp, name: 'wrong-webp.jpg', type: 'image/jpeg', format: 'webp' },
    { path: apng, name: 'wrong-apng.webp', type: 'image/webp', format: 'apng' },
    { path: gif, name: 'wrong-gif.png', type: 'text/html', format: 'gif' },
    { path: gif, name: 'without-extension', type: '', format: 'gif' },
  ]
  dragChecks.push(await drop(mismatches))
  for (let i = 0; i < mismatches.length; i++) {
    const test = mismatches[i]
    await expectCurrent(test.name, test.format, i + 1, mismatches.length)
    if (i < mismatches.length - 1) await click('Next')
  }
  await empty()
  passed.push('signature overrides wrong extensions and misleading MIME', 'missing extension opens normally')

  const beforeLimit = await lifecycle()
  await evaluate(`(() => {
    const bytes=Uint8Array.from(atob(${JSON.stringify(tinyGIF)}),c=>c.charCodeAt(0)),data=new DataTransfer();
    for(let i=0;i<1002;i++)data.items.add(new File([bytes],'limit-'+i+'.gif',{type:'image/gif'}));
    document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
  })()`)
  await expectCurrent('limit-0.gif', 'gif', 1, 1000)
  const limitMessage = await evaluate("document.querySelector('.session-notice')?.textContent")
  assert(/Only the first 1000 files were added/.test(limitMessage), 'Truncated drop has no explicit item-limit message')
  assert((await lifecycle()).opens === beforeLimit.opens + 1, 'Oversized selection eagerly decoded more than its current item')
  await pick([gif])
  await expectCurrent('limit-0.gif', 'gif', 1, 1000)
  assert(/Only the first 0 files were added/.test(await evaluate("document.querySelector('.session-notice')?.textContent")), 'Full-list append has no explicit limit message')
  await empty()
  await pick([])
  await waitFor("document.querySelector('h1')?.textContent==='AniView'")
  const beforePickerLimit = await lifecycle()
  await pick(Array(1001).fill(tinyGIFPath))
  await expectCurrent(tinyGIFPath, 'gif', 1, 1000)
  const pickerLimitMessage = await evaluate("document.querySelector('.session-notice')?.textContent")
  assert(/Only the first 1000 files were added/.test(pickerLimitMessage), 'Truncated picker has no explicit item-limit message')
  assert((await lifecycle()).opens === beforePickerLimit.opens + 1, 'Oversized picker eagerly decoded unvisited items')
  await empty()
  passed.push('1000-item picker/drop safety limit truncates with explicit notice', 'large selections decode only current item', 'full-session append preserves current item', 'drop/dragend clear overlay')
  const workers = await lifecycle()
  assert(workers.active === 0 && workers.created === workers.terminated && workers.peakActive <= 1, 'Decoder Workers leaked or overlapped: ' + JSON.stringify(workers))
  passed.push('at most one live decoder Worker', 'all decoder Workers terminated after clear')
  return { url, userAgent: await evaluate('navigator.userAgent'), capabilities, baseline, focus, layouts,
    sourceFixtures: [webp, apng, gif].map(path => basename(path)), dragChecks, nonFileDrops, errorCases, limitMessage, pickerLimitMessage,
    workerLifetime: workers, passed }
}
