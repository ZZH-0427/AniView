// Additive local acceptance: actual production UI, public fixtures and native
// component. Transparent Worker observation schedules ordinary DOM UI actions;
// it never fabricates replies, delays native work, intercepts network or changes
// production sources. Cancellation is at dispatch, not proof of mid-codec work.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { launchBrowser } from '../creation/browser.mjs'
import { verifyRuntime } from './verify-runtime.mjs'

const base = process.env.ANIVIEW_EXTENDED_URL ?? 'http://127.0.0.1:4295/AniView/'
const root = resolve(process.env.ANIVIEW_EXTENDED_ROOT ?? 'dist')
const output = resolve('.tools/m10c3')
const component = await verifyRuntime(root + '/vendor/sevenzip')
const fixtures = JSON.parse(await readFile(output + '/fixtures/manifest.json', 'utf8'))
const sha = value => createHash('sha256').update(value).digest('hex')
for (const name of ['medium-solid.7z', 'medium-solid-rar5.rar', 'normal.7z', 'normal-rar5.rar']) {
  const row = fixtures.rows.find(row => row.name === name)
  assert(row, name)
  assert.equal(sha(await readFile(output + '/fixtures/' + name)), row.sha256)
}
const galleryBytes = [...await readFile('tests/fixtures/gif/previous.gif')]
const report = { scope: 'actual production UI/native lifecycle; no mocks or fault injection', component,
  caveat: 'Cancel is automatically clicked after an actual extract postMessage and before any reply if possible; this does not establish that native decoding had consumed bytes before termination.',
  checks: [], cases: [], cleanups: [] }
const browser = await launchBrowser(output + '/lifecycle-product-browser')
const { evaluate: ev, click, inputFiles } = browser
const q = id => `[data-testid="${id}"]`
const wait = expression => browser.waitFor(expression, 40000)
const json = id => ev(`JSON.parse(document.querySelector('${q(id)}').textContent)`)
const ready = () => wait(`['ready','paused','playing','ended'].includes(document.querySelector('${q('playback-state')}')?.dataset.state)`)
const archiveName = name => wait(`document.querySelector('${q('archive-name')}')?.textContent===${JSON.stringify(name)}`)
const open = async name => { await inputFiles(q('archive-input'), [output + '/fixtures/' + name]); await archiveName(name) }
const arm = (action, options = {}) => ev(`window.__nativeLifecycleAction={armed:true,kind:${JSON.stringify(action)},...${JSON.stringify(options)}}`)
const traceStart = () => ev('window.__nativeLifecycleTrace.length')
const traceSince = start => ev(`window.__nativeLifecycleTrace.slice(${start})`)
const snapshot = async () => ({ archive: await json('archive-metrics'), runtime: await json('runtime-metrics') })
const close = async () => {
  const hasArchive = await ev(`!!document.querySelector('${q('archive-status')}')`)
  await browser.clickLabel(hasArchive ? 'Close archive' : 'Close')
  await wait(`(()=>{const m=JSON.parse(document.querySelector('${q('runtime-metrics')}').textContent);return !!document.querySelector('.home')&&!document.querySelector('${q('archive-status')}')&&m.activeWorkers===0&&m.activeArchiveSessions===0&&m.lastExtendedArchiveCleanup?.pendingAccess===0})()`)
  const cleanup = await json('runtime-metrics')
  for (const key of ['activeWorkers', 'activeBitmaps', 'activeArchiveSessions', 'cleanupErrors']) assert.equal(cleanup[key], 0, key)
  if (cleanup.lastExtendedArchiveCleanup) for (const key of ['activeExtendedArchiveWorkers', 'activeWasmInstances', 'activeArchiveSessions', 'activeExtraction', 'pendingAccess', 'currentExtractedBytes', 'activeObjectUrls', 'cleanupErrors'])
    assert.equal(cleanup.lastExtendedArchiveCleanup[key], 0, key)
  report.cleanups.push(cleanup)
}

try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__nativeLifecycleTrace=[];window.__nativeLifecycleAction={armed:false};window.__nativeLifecycleFiles={};
    const ParentWorker=Worker;let workerSequence=0;
    window.Worker=class extends ParentWorker {
      constructor(url,options){super(url,options);this.__extended=/\\/worker-[^/]+\\.js/.test(String(url));this.__traceId=++workerSequence;
        if(this.__extended)this.addEventListener('message',event=>{const m=event.data;window.__nativeLifecycleTrace.push({event:'reply',worker:this.__traceId,type:m.type,id:m.id,generation:m.generation,at:performance.now()});});
      }
      postMessage(message,...args){
        const result=super.postMessage(message,...args);
        if(!this.__extended)return result;
        const trace={event:'request',worker:this.__traceId,type:message.type,id:message.id,generation:message.generation,entryId:message.entryId,at:performance.now()};
        window.__nativeLifecycleTrace.push(trace);
        const action=window.__nativeLifecycleAction;
        if(message.type==='extract'&&action.armed){action.armed=false;
          setTimeout(()=>{
            const replied=window.__nativeLifecycleTrace.some(row=>row.event==='reply'&&row.type!=='progress'&&row.worker===this.__traceId&&row.id===message.id);
            const item={event:'ui-action',worker:this.__traceId,requestId:message.id,kind:action.kind,repliedBeforeAction:replied,at:performance.now()};
            if(action.kind==='cancel'){const b=document.querySelector('[data-testid=archive-extraction-cancel]');item.controlPresent=!!b;b?.click();}
            else if(action.kind==='select'){const select=document.querySelector('[data-testid=archive-entry-picker]');item.controlPresent=!!select;if(select){const option=Array.from(select.options).find(row=>row.textContent.replace(/^\\d+\\. /u,'')===action.path);item.targetPresent=!!option;if(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}}}
            else if(action.kind==='archive'||action.kind==='gallery'){
              const selector=action.kind==='archive'?'[data-testid=archive-input]':'[data-testid=image-input]';
              const input=document.querySelector(selector),file=window.__nativeLifecycleFiles[action.file];item.controlPresent=!!input;item.filePresent=!!file;
              if(input&&file){const data=new DataTransfer();data.items.add(file);input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
            }
            window.__nativeLifecycleTrace.push(item);
          },0);
        }
        return result;
      }
      terminate(){if(this.__extended)window.__nativeLifecycleTrace.push({event:'terminate',worker:this.__traceId,at:performance.now()});return super.terminate();}
    };
  ` })
  await browser.navigate(base + '?debug=1')
  await wait('!!document.querySelector(".home")')
  assert.equal(await ev('performance.getEntriesByType("resource").some(row=>row.name.includes("/@vite/client"))'), false)
  await ev(`(async()=>{const name='normal-rar5.rar';const blob=await(await fetch(new URL('validation/extended-archive/'+name,location.href))).blob();window.__nativeLifecycleFiles.replacement=new File([blob],name);window.__nativeLifecycleFiles.gallery=new File([new Uint8Array(${JSON.stringify(galleryBytes)})],'public-gallery.gif',{type:'image/gif'});})()`)

  for (const name of ['medium-solid.7z', 'medium-solid-rar5.rar']) {
    const start = await traceStart()
    await arm('cancel'); await open(name)
    await wait(`!!document.querySelector('${q('archive-extraction-retry')}')`)
    const trace = await traceSince(start)
    const action = trace.find(row => row.event === 'ui-action')
    assert(action?.controlPresent, name + ': actual cancel control absent')
    assert.equal(action.repliedBeforeAction, false, name + ': request finished before cancellation; no cancellation acceptance claimed')
    await click(q('archive-extraction-retry')); await ready()
    await wait(`(()=>{const m=JSON.parse(document.querySelector('${q('archive-metrics')}').textContent);return m.extendedArchiveOpen>=2&&m.currentExtractedBytes===4001673})()`)
    const metrics = await snapshot()
    assert.equal(metrics.archive.currentExtractedBytes, 4001673)
    assert.equal(metrics.archive.mediaCount, 1)
    assert.equal(metrics.archive.extendedArchiveWorkersActive, 1)
    assert(metrics.archive.extendedArchiveWorkersTerminated >= 1)
    assert((await ev('document.querySelector(".viewer-metadata").textContent')).startsWith('PNG · 1000 × 1000'))
    report.cases.push({ case: name + ': dispatch Cancel → native reopen → Retry → large PNG Viewer', ...metrics, trace: await traceSince(start) })
    await close()
  }
  report.checks.push('RAR5/7z medium-solid actual extraction cancellation and automatic reopen/retry')

  // Replace the owning archive while its real selected access is pending.
  {
    const start = await traceStart()
    await arm('archive', { file: 'replacement' }); await inputFiles(q('archive-input'), [output + '/fixtures/medium-solid.7z'])
    await archiveName('normal-rar5.rar'); await ready()
    await wait(`document.querySelector('.viewer-heading h1')?.textContent==='01-animation.gif'`)
    await wait(`JSON.parse(document.querySelector('${q('archive-metrics')}').textContent).currentExtractedBytes===114`)
    const trace = await traceSince(start), action = trace.find(row => row.event === 'ui-action')
    assert(action?.controlPresent && action.filePresent)
    assert.equal(action.repliedBeforeAction, false, 'Archive replacement did not overlap pending selected access')
    const metrics = await snapshot()
    assert.equal(metrics.archive.inputBytes, fixtures.rows.find(row => row.name === 'normal-rar5.rar').bytes)
    assert.equal(metrics.archive.currentExtractedBytes, 114)
    assert(metrics.runtime.lastExtendedArchiveCleanup)
    for (const key of ['activeExtendedArchiveWorkers', 'activeWasmInstances', 'activeArchiveSessions', 'activeExtraction', 'pendingAccess', 'currentExtractedBytes', 'activeObjectUrls', 'cleanupErrors'])
      assert.equal(metrics.runtime.lastExtendedArchiveCleanup[key], 0, 'replaced old owner ' + key)
    report.cases.push({ case: 'pending medium 7z → new RAR5 source; stale source never wins', ...metrics, trace })
    await close()
  }
  report.checks.push('pending real extraction → different archive source, old owner cleanup and final identity')

  // Likewise replace with a real loose file through the existing image input.
  {
    const start = await traceStart()
    await arm('gallery', { file: 'gallery' }); await inputFiles(q('archive-input'), [output + '/fixtures/medium-solid-rar5.rar'])
    await wait(`!document.querySelector('${q('archive-status')}')&&document.querySelector('.viewer-heading h1')?.textContent==='public-gallery.gif'`)
    await ready()
    const trace = await traceSince(start), action = trace.find(row => row.event === 'ui-action')
    assert(action?.controlPresent && action.filePresent)
    assert.equal(action.repliedBeforeAction, false, 'Gallery replacement did not overlap pending selected access')
    const runtime = await json('runtime-metrics')
    assert.equal(runtime.activeArchiveSessions, 0)
    for (const key of ['activeExtendedArchiveWorkers', 'activeWasmInstances', 'activeArchiveSessions', 'activeExtraction', 'pendingAccess', 'currentExtractedBytes', 'activeObjectUrls', 'cleanupErrors'])
      assert.equal(runtime.lastExtendedArchiveCleanup[key], 0, key)
    report.cases.push({ case: 'pending medium RAR5 → loose gallery GIF; archive released', runtime, trace })
    await close()
  }
  report.checks.push('pending real extraction → loose-gallery replacement and archive ownership cleanup')

  // Ordinary select dispatch occurs after a real first selected extraction was
  // posted. A new entry must win even if the old native result races cancellation.
  {
    const start = await traceStart()
    await arm('select', { path: '03-animation.png' }); await open('normal.7z')
    await wait(`document.querySelector('${q('archive-entry-picker')}')?.selectedOptions[0]?.textContent.endsWith('. 03-animation.png')&&document.querySelector('.viewer-heading h1')?.textContent==='03-animation.png'`)
    await ready()
    await wait(`JSON.parse(document.querySelector('${q('archive-metrics')}').textContent).currentExtractedBytes===202`)
    const trace = await traceSince(start), action = trace.find(row => row.event === 'ui-action')
    assert(action?.controlPresent && action.targetPresent)
    assert(trace.filter(row => row.event === 'request' && row.type === 'extract').length >= 2)
    report.cases.push({ case: 'immediate entry switch at first actual extraction dispatch → final APNG selection', ...await snapshot(), trace,
      raceNote: action.repliedBeforeAction ? 'Tiny first entry completed before UI action; selection was immediate but no in-flight cancellation is claimed.' : 'First native response was not received before the entry switch.' })
    await close()
  }
  report.checks.push('rapid selected-entry switch; final Viewer identity and balanced cleanup')
  assert.deepEqual(browser.errors, [])
  const probe = await ev('window.__creationProbe')
  assert.equal(probe.activeWorkers, 0); assert.equal(probe.workersCreated, probe.workersTerminated)
  report.observedOwnership = probe
  report.browser = await ev('navigator.userAgent'); report.secureContext = await ev('isSecureContext')
  report.hmr = false; report.passed = true
  await writeFile(output + '/lifecycle-product-report.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, checks: report.checks, cases: report.cases.length, report: output + '/lifecycle-product-report.json' }))
} catch (error) {
  await writeFile(output + '/lifecycle-product-failure.json', JSON.stringify({ ...report, error: error.stack,
    browserErrors: browser.errors, trace: await ev('window.__nativeLifecycleTrace').catch(() => undefined) }, null, 2) + '\n')
  throw error
} finally { await browser.close() }
