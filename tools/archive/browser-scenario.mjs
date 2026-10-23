// Real installed Edge/CDP validation; generated ZIPs and selected media stay local.
import { readFile, stat } from 'node:fs/promises'
import { resolve, basename } from 'node:path'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function runArchiveCheck({ send, evaluate, waitFor, click, fixture, url, capture }) {
  const passed = []
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const state = "document.querySelector('[data-testid=playback-state]')?.textContent"
  const title = "document.querySelector('.viewer h1')?.textContent"
  const position = "document.querySelector('[data-testid=session-position]')?.textContent"
  const archiveStatus = "document.querySelector('[data-testid=archive-status]')?.textContent"
  const frame = "Number(document.querySelector('[data-testid=current-frame]')?.textContent.split(' ')[1])"
  const metrics = () => evaluate("JSON.parse(document.querySelector('[data-testid=archive-metrics]')?.textContent||'null')")
  const cache = () => evaluate("JSON.parse(document.querySelector('[data-testid=playback-metrics]').textContent)")
  const lifetime = () => evaluate('window.__workerLifetime')
  const pick = async (paths, kind = 'archive') => {
    const selector = `[data-testid=${kind}-input]`
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`)
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector })
    await send('DOM.setFileInputFiles', { nodeId, files: paths })
  }
  const choose = name => pick([resolve('tests/fixtures/zip', name)])
  const current = async (name, format, index, total, expectedState = 'paused') => {
    await waitFor(`${title}===${JSON.stringify(name)}&&${position}===${JSON.stringify(`${index} / ${total}`)}&&${state}===${JSON.stringify(expectedState)}`)
    if (format) assert(await evaluate(`document.querySelector('.viewer header p').textContent.startsWith(${JSON.stringify(format.toUpperCase() + ' ·')})`), 'Wrong media decoder: ' + name)
  }
  const close = async (label = 'Close archive') => {
    await click(label)
    await waitFor(`!(${archiveStatus})&&!(${state})&&document.querySelector('h1')?.textContent==='AniView'`)
    await waitFor('window.__workerLifetime.active===0')
    assert(!await evaluate('!!document.querySelector("canvas")'), 'Closing retained the Canvas')
  }
  const extractionCount = async expected => {
    await waitFor(`JSON.parse(document.querySelector('[data-testid=archive-metrics]').textContent).extractions===${expected}`)
    return metrics()
  }
  const play = async () => {
    await click('Play'); await waitFor(`${state}==='playing'&&${frame}>1`)
    await click('Pause'); await waitFor(`${state}==='paused'`)
  }
  const errors = []
  const errorText = () => evaluate("Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.textContent).join(' ')")
  const assertMessage = async pattern => { const message = await errorText(); assert(pattern.test(message), 'Wrong error: ' + message); return message }

  await waitFor("document.querySelector('h1')?.textContent==='AniView'")
  const initialResources = await evaluate("performance.getEntriesByType('resource').map(e=>e.name)")
  assert(!initialResources.some(name => /archive|zip/i.test(new URL(name).pathname)), 'Archive code/Worker was eagerly fetched')
  assert((await lifetime()).created === 0, 'A ZIP Worker started without using Open ZIP')
  const picker = await evaluate(`(() => {
    const zip=document.querySelector('[data-testid=archive-input]'),image=document.querySelector('[data-testid=image-input]');
    return {zip:{accept:zip.accept,multiple:zip.multiple,capture:zip.getAttribute('capture')},image:{accept:image.accept,multiple:image.multiple}};
  })()`)
  assert(!picker.zip.accept.includes('image') && picker.zip.accept.includes('.zip') && !picker.zip.multiple && picker.zip.capture === null, 'Wrong ZIP input intent')
  assert(picker.image.accept === 'image/*' && picker.image.multiple, 'ZIP changed normal image input')
  passed.push('image and ZIP intents remain separate', 'no ZIP Worker/chunk at normal startup')

  const firstStarted = Date.now()
  await choose('mixed.zip')
  await current('first.gif', 'gif', 1, 3)
  const first = await extractionCount(1)
  assert(first.entryCount === 7 && first.mediaCount === 3, 'Directories/junk changed viewing list: ' + JSON.stringify(first))
  assert(first.currentExtractedBytes === (await stat('tests/fixtures/gif/previous.gif')).size, 'Current-only extraction cache is wrong')
  const firstOpenedMs = Date.now() - firstStarted
  const initialDecoded = await lifetime()
  assert(initialDecoded.active === 2, 'Expected one ZIP Worker plus only current decoder')
  await play()
  await click('Next'); await current('nested/second.webp', 'webp', 2, 3); const second = await extractionCount(2); await play()
  await click('Next'); await current('nested/third.png', 'apng', 3, 3); const third = await extractionCount(3); await play()
  await click('Previous'); await current('nested/second.webp', 'webp', 2, 3); const revisit = await extractionCount(4)
  assert(revisit.currentExtractedBytes === second.currentExtractedBytes && revisit.extractions === 4, 'Revisited entries retain history or detached data')
  await click('Replay'); await waitFor(`${frame}>=1&&${state}!=='error'`); await click('Pause')
  const beforeCancel = await lifetime()
  await pick([]); await delay(150); await current('nested/second.webp', 'webp', 2, 3)
  assert((await lifetime()).created === beforeCancel.created, 'Cancelled ZIP picker replaced active source')
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 600 })
    await delay(120)
    assert(!await evaluate('document.documentElement.scrollWidth>innerWidth'), 'ZIP controls overflow viewport')
    assert(await evaluate("Array.from(document.querySelectorAll('button')).every(b=>b.getBoundingClientRect().height>=44)"), 'ZIP button touch target is too small')
    await capture?.(`viewer-${width}`)
  }
  await click('Remove from list'); await current('nested/third.png', 'apng', 2, 2)
  const afterRemoval = await extractionCount(5)
  assert(afterRemoval.entryCount === 7 && afterRemoval.mediaCount === 3, 'Remove rewrote ZIP metadata')
  await close()
  await choose('mixed.zip'); await current('first.gif', 'gif', 1, 3); await extractionCount(1)
  await close('Close')
  passed.push('central-directory media order and nested names', 'directories/macOS/text metadata skipped', 'only current entry extracted', 'ZIP GIF/WebP/APNG use existing decoders', 'Play/Pause/Replay', 'previous revisit reextracts valid bytes', 'no visited-entry cache', 'remove affects viewing list only', 'cancel keeps archive', 'Close archive and Viewer Close release all Workers', 'close/reopen same archive', 'mobile/desktop controls')

  // The same source-replacement gate covers normal images and ZIPs.
  await pick([resolve(fixture)], 'image'); await current(basename(fixture), 'webp', 1, 1)
  await choose('mixed.zip'); await current('first.gif', 'gif', 1, 3)
  await pick([resolve('tests/fixtures/gif/previous.gif')], 'image'); await current('previous.gif', 'gif', 1, 1)
  assert(!await evaluate(`Boolean(${archiveStatus})`), 'Loose image retained the previous ZIP')
  assert((await lifetime()).active === 1, 'ZIP Worker remained alive after normal image selection')
  await close('Close')
  passed.push('normal image to ZIP replaces source', 'ZIP to normal image replaces source without mixing')

  await choose('encrypted-mixed.zip'); await current('public.gif', 'gif', 1, 4); await extractionCount(1)
  for (const [index, name] of [[2, 'private.webp'], [3, 'private.png']]) {
    await click('Next'); await current(name, undefined, index, 4, 'error')
    errors.push({ entry: name, message: await assertMessage(/password-protected/i) })
    await waitFor("JSON.parse(document.querySelector('[data-testid=archive-metrics]').textContent).currentExtractedBytes===0")
    const encrypted = await metrics()
    assert(encrypted.extractions === 1 && encrypted.currentExtractedBytes === 0, 'Encrypted entry was extracted or old entry retained')
  }
  await click('Next'); await current('public-again.gif', 'gif', 4, 4); await extractionCount(2)
  await close()
  for (const name of ['encrypted-zipcrypto.zip', 'encrypted-aes.zip']) {
    await choose(name); await current('private.gif', undefined, 1, 1, 'error')
    errors.push({ file: name, message: await assertMessage(/password-protected/i) })
    await close()
  }
  passed.push('ZipCrypto and AES distinguish password protection', 'mixed public/encrypted archive remains navigable', 'encrypted entries are not eagerly extracted', 'encrypted error permits Next recovery')

  for (const name of ['empty.zip', 'no-media.zip', 'unsafe-paths.zip']) {
    await choose(name); await waitFor(`${archiveStatus}==='open'`)
    await waitFor("document.body.innerText.includes('No viewable media found')")
    assert(!(await metrics()).extractions, 'Empty/nonmedia/unsafe entries extracted')
    assert(!await evaluate('!!document.querySelector("canvas")'), 'No-media archive opened a decoder')
    await close()
  }
  for (const [name, pattern] of [['not-a-zip.zip', /not a valid ZIP/i], ['corrupt.zip', /damaged/i], ['truncated.zip', /damaged/i]]) {
    await choose(name); await waitFor(`${archiveStatus}==='error'`)
    errors.push({ file: name, message: await assertMessage(pattern) })
    await close()
  }
  for (const [name, pattern] of [['bad-crc.zip', /damaged/i], ['unsupported-compression.zip', /unsupported/i], ['oversize-declared.zip', /too large/i], ['ratio-limit.zip', /safety limits/i]]) {
    await choose(name); await current('first.gif', undefined, 1, 1, 'error')
    errors.push({ file: name, message: await assertMessage(pattern) })
    await close()
  }
  await choose('zip64.zip'); await current('first.gif', 'gif', 1, 1); await close()
  await choose('wrong-extension.zip'); await current('really-gif.jpg', 'gif', 1, 3)
  await click('Next'); await current('without-extension', 'apng', 2, 3)
  await click('Next'); await current('fake.gif', undefined, 3, 3, 'error'); await assertMessage(/unsupported/i)
  await close()
  passed.push('empty/no-media archives remain OPEN with clear feedback', 'unsafe names never become viewing items', 'invalid versus damaged ZIP classification', 'CRC errors normalized', 'unsupported compression', 'entry size and ratio preflight', 'small Zip64', 'binary signature overrides wrong/missing extensions', 'archive failure recovers on reopen')

  // 60 real compressed media entries: no extract-all and main-thread heartbeat
  // remain observable even during cold Worker startup and DEFLATE extraction.
  const large = resolve('.tools/fixtures/archive-large.zip')
  const encodedSize = (await stat(large)).size
  await evaluate("window.__zipHeartbeat={last:performance.now(),ticks:0,maxGap:0};window.__zipHeartbeatTimer=setInterval(()=>{const h=window.__zipHeartbeat,now=performance.now();h.ticks++;h.maxGap=Math.max(h.maxGap,now-h.last);h.last=now},10)")
  const largeStarted = Date.now()
  await pick([large]); await current('batch/000-earth.gif', 'gif', 1, 60)
  const largeFirst = await extractionCount(1)
  const largeFirstMs = Date.now() - largeStarted
  assert(largeFirst.entryCount === 60 && largeFirst.currentExtractedBytes < largeFirst.totalDeclaredBytes / 10, 'Large archive extracted all entries')
  await play()
  const largeCache = await cache()
  const nextStarted = Date.now()
  await click('Next'); await current('batch/001-animation.webp', 'webp', 2, 60)
  const largeSecond = await extractionCount(2), largeNextMs = Date.now() - nextStarted
  await play()
  await click('Next'); await current('batch/002-ball.png', 'apng', 3, 60); await extractionCount(3); await play()
  await click('Previous'); await current('batch/001-animation.webp', 'webp', 2, 60); const largeRevisit = await extractionCount(4)
  const heartbeat = await evaluate('clearInterval(window.__zipHeartbeatTimer);window.__zipHeartbeat')
  assert(heartbeat.ticks > 5 && heartbeat.maxGap < 1000, 'Main thread stalled during archive smoke test: ' + JSON.stringify(heartbeat))
  assert(largeRevisit.peakExtractedBytes === largeFirst.currentExtractedBytes, 'Visited entries increased extraction retention')
  assert(largeCache.peakFrames <= 6 && largeCache.peakBytes <= largeCache.maxBytes, 'Archive bypassed shared frame budget')
  await close()
  passed.push('60-entry real-media smoke test', 'only one extracted Blob retained across navigation', 'large archive first/next/revisit metrics', 'main-thread heartbeat during Worker parse/extract', 'shared bounded animation FrameCache')

  // Supersede archive opening/extraction with another source. CDP gives React an
  // event turn between selections; late A completion must never replace B.
  await pick([large]); await choose('single-apng.zip')
  await current('third.png', 'apng', 1, 1); await delay(250); await current('third.png', 'apng', 1, 1)
  assert((await lifetime()).active === 2, 'Superseded archive leaked its Worker')
  await close()
  await choose('mixed.zip'); await current('first.gif', 'gif', 1, 3)
  await click('Next'); await click('Next'); await click('Previous'); await click('Previous'); await click('Next')
  await current('nested/second.webp', 'webp', 2, 3); await delay(200); await current('nested/second.webp', 'webp', 2, 3)
  await close('Clear session')
  passed.push('rapid Archive A to B prevents stale replacement', 'rapid entry switching cannot resurrect prior frames', 'Clear session releases archive')

  const workers = await lifetime()
  assert(workers.active === 0 && workers.created === workers.terminated && workers.peakActive <= 2, 'Worker leak/overlap: ' + JSON.stringify(workers))
  const resources = await evaluate("performance.getEntriesByType('resource').map(e=>({url:e.name,status:e.responseStatus,durationMs:e.duration,bytes:e.transferSize}))")
  const lazyResources = resources.filter(entry => !initialResources.includes(entry.url) && /\/assets\//.test(new URL(entry.url).pathname))
  assert(lazyResources.some(entry => /archive-session/.test(entry.url) && entry.status === 200), 'ZIP session dynamic chunk not observed with HTTP 200')
  assert(new URL(url).pathname.startsWith('/AniView/'), 'Production subpath was not tested')
  passed.push('all ZIP and decoder Workers terminated', 'at most one ZIP plus one current decoder', 'lazy ZIP chunk HTTP 200 under /AniView/')
  return { url, userAgent: await evaluate('navigator.userAgent'), picker, firstOpenedMs,
    tinyMixed: { first, second, third, revisit, afterRemoval }, errors,
    largeArchive: { encodedSize, firstOpenedMs: largeFirstMs, nextOpenedMs: largeNextMs,
      first: largeFirst, second: largeSecond, revisit: largeRevisit, frameCache: largeCache, heartbeat },
    initialResources, lazyResources, workerLifetime: workers, passed }
}
