import { SevenZipBackend } from './backend.mjs'
const state = { build:'m10c2-bounded-e88132ca', secureContext:isSecureContext, hmr:false, pass:0, failures:[], cancellations:0,
  workersCreated:0,workersTerminated:0,activeWorkers:0,peakWorkers:1,maxWasmBytes:0,maxHeartbeatGapMs:0,rows:[] }
let manifest, running=false, active=false, lastBeat=performance.now()
setInterval(()=>{const now=performance.now();if(active&&!document.hidden)state.maxHeartbeatGapMs=Math.max(state.maxHeartbeatGapMs,now-lastBeat);lastBeat=now},16)
const load=async name=>{const r=await fetch(new URL('fixtures/'+name,import.meta.url));if(!r.ok)throw Error('Fixture HTTP '+r.status);return r.blob()}
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('')
function assert(v,why){if(!v)throw Error(why)}
function record(b){const m=b.getMetrics();state.workersCreated+=m.workersCreated;state.workersTerminated+=m.workersTerminated;state.activeWorkers+=m.activeWorkers}
async function withBackend(fn,values){const b=new SevenZipBackend(values);active=true;lastBeat=performance.now();try{return await fn(b)}finally{await b.close();record(b);active=false}}
async function expectedError(action,codes){try{await action();throw Error('Expected failure')}catch(e){if(!codes.includes(e.code))throw e;return e.code}}
async function one(f,values){return withBackend(async b=>{
  const t=performance.now(),file=await load(f.name),opened=await b.open(file,{password:f.credential??undefined})
  const startupMs=performance.now()-t,entries=await b.listEntries(),extractions=[]
  for(const wanted of f.expected){const e=entries.find(x=>x.normalizedPath===wanted.path);assert(e,'Missing expected fixture entry');const t=performance.now();const out=await b.extractEntry(e.id,{password:f.credential??undefined});assert(out.data.byteLength===wanted.bytes&&await sha(out.data)===wanted.sha256,'Hash mismatch');state.maxWasmBytes=Math.max(state.maxWasmBytes,out.metrics.wasmBytes);extractions.push({id:e.id,bytes:out.data.byteLength,ms:performance.now()-t,...out.metrics})}
  return {case:f.name,startupMs,inputBytes:file.size,metadata:opened.entries,extractions}
},values)}
function observe(value){if(!value||typeof value!=='object')return;if(typeof value.wasmBytes==='number')state.maxWasmBytes=Math.max(state.maxWasmBytes,value.wasmBytes);for(const child of Object.values(value))observe(child)}
async function test(name,fn){document.querySelector('#status').textContent='Running '+name;try{const result=await fn();observe(result);state.pass++;state.rows.push({name,status:'PASS',result})}catch(e){state.failures.push({case:name,error:e.code??e.message});state.rows.push({name,status:'FAIL',error:e.code??e.message});throw e}}
async function run(group){
  if(running)throw Error('Busy');running=true
  try{
    manifest??=await (await fetch(new URL('fixtures/manifest.json',import.meta.url))).json()
    const find=name=>manifest.find(x=>x.name===name)
    if(group==='small'||group==='desktop'){
      for(const f of manifest.filter(f=>!/^input-|^medium|^large|^dict-|^dictionary-/.test(f.name)))await test(f.name,()=>one(f))
      await test('ZIP excluded',()=>withBackend(b=>expectedError(()=>b.open(new Blob([new Uint8Array([0x50,0x4b,3,4])])),['ARCHIVE_UNSUPPORTED_FORMAT'])))
      for(const name of ['password.7z','headers.7z','test_read_format_rar4_encrypted.rar','test_read_format_rar4_encrypted_filenames.rar','test_read_format_rar5_encrypted.rar','test_read_format_rar5_encrypted_filenames.rar']){
        await test('password outcomes '+name,()=>withBackend(async b=>{
          const f=find(name),file=await load(name),header=/headers|filenames/.test(name)
          if(header){await expectedError(()=>b.open(file),['ARCHIVE_PASSWORD_REQUIRED']);return expectedError(()=>b.open(file,{password:'intentionally-wrong'}),['ARCHIVE_PASSWORD_REJECTED','ARCHIVE_PASSWORD_REJECTED_OR_CORRUPTED'])}
          await b.open(file);const entries=await b.listEntries(),e=entries.find(x=>x.encrypted===1&&x.isFile)
          assert(e,'No encrypted test entry');await expectedError(()=>b.extractEntry(e.id),['ARCHIVE_PASSWORD_REQUIRED'])
          const wrong=await expectedError(()=>b.extractEntry(e.id,{password:'intentionally-wrong'}),['ARCHIVE_PASSWORD_REJECTED','ARCHIVE_PASSWORD_REJECTED_OR_CORRUPTED'])
          const good=await b.extractEntry(e.id,{password:f.credential});return {wrong,correctBytes:good.data.byteLength}
        }))
      }
      for(const name of ['truncated.7z','damaged.7z'])await test(name,()=>withBackend(async b=>{
        const result=await expectedError(async()=>{await b.open(await load(name));const entries=await b.listEntries();for(const e of entries.filter(x=>x.isFile))await b.extractEntry(e.id)},['ARCHIVE_CORRUPTED','ARCHIVE_BACKEND_ERROR']);return {result}
      }))
      const edge=await(await fetch(new URL('fixtures/edge-manifest.json',import.meta.url))).json()
      await test('duplicates selected by ID',()=>withBackend(async b=>{
        const f=edge.find(f=>f.name==='duplicates.7z'),open=await b.open(await load(f.name))
        assert(open.entries.length===3&&open.entries[0].path===open.entries[1].path&&open.entries[0].id!==open.entries[1].id,'Duplicate identity lost')
        for(const expected of f.expected){const out=await b.extractEntry(expected.id);assert(await sha(out.data)===expected.sha256,'Duplicate selected hash mismatch')}
        return open.entries
      }))
      for(const [name,code]of [['newline.7z','ARCHIVE_UNSAFE_PATH'],['traversal.7z','ARCHIVE_UNSAFE_PATH'],['path-bomb.7z','ARCHIVE_UNSAFE_PATH'],['entry-bomb.7z','ARCHIVE_RESOURCE_LIMIT']])await test(name,()=>withBackend(async b=>expectedError(async()=>b.open(await load(name)),[code])))
      await test('unsupported method',()=>withBackend(async b=>{await b.open(await load('unsupported.7z'));return expectedError(()=>b.extractEntry(0),['ARCHIVE_UNSUPPORTED_METHOD'])}))
      await test('symlink not media',()=>withBackend(async b=>{const open=await b.open(await load('symlink.7z'));assert(!open.entries[0].isFile&&open.entries[0].special,'Symlink misclassified');return expectedError(()=>b.extractEntry(0),['ARCHIVE_UNSUPPORTED_ENTRY'])}))
    }
    if(group==='memory'||group==='desktop'){
      for(const name of ['input-1m.7z','medium.7z','large.7z'])await test(name,()=>one(find(name)))
      for(const name of ['dict-1m.7z','dict-4m.7z','dict-16m.7z','dict-64m.7z'])await test(name,()=>withBackend(async b=>{
        const open=await b.open(await load(name)),e=open.entries.find(e=>e.isFile)
        const result=await expectedError(()=>b.extractEntry(e.id),['ARCHIVE_RESOURCE_LIMIT'])
        const preflight=await b.nativeMetrics(),native=await b.probeNativeExtraction(e.id)
        assert(native.code==='ARCHIVE_RESOURCE_LIMIT'&&native.wasmBytes<=67108864,'Dictionary cap not bounded')
        return {inputBytes:find(name).bytes,entry:e,result,preflight,native}
      }))
      await test('hard heap ceiling',()=>withBackend(async b=>{
        await b.open(await load('normal.7z'));const before=await b.nativeMetrics(),within=await b.probeAllocation(48*1024**2);const result=await b.probeAllocation(80*1024**2)
        assert(within.allocated&&within.wasmBytes>before.wasmBytes&&!result.allocated&&result.wasmBytes<=67108864,'Hard heap cap escaped');const ok=await b.extractEntry((await b.listEntries()).find(e=>e.isFile).id)
        return {before,within,overCap:result,recoveryBytes:ok.data.byteLength}
      }))
      await test('compressed header exceeds heap',()=>withBackend(async b=>expectedError(async()=>b.open(await load('header-over-cap.7z')),['ARCHIVE_RESOURCE_LIMIT'])))
      await test('native oversized dictionary with preflight bypassed',()=>withBackend(async b=>{
        const open=await b.open(await load('dictionary-over-cap.7z'))
        const result=await b.probeNativeExtraction(open.entries.find(e=>e.isFile).id)
        assert(result.code==='ARCHIVE_RESOURCE_LIMIT'&&result.wasmBytes<=67108864&&result.outputBytes===0,'Native cap failure not controlled')
        return {metadata:open.entries,result}
      }))
      await test('native actual output with declared-size preflight bypassed',()=>withBackend(async b=>{
        const open=await b.open(await load('medium.7z')),result=await b.probeNativeExtraction(open.entries.find(e=>e.isFile).id)
        assert(result.code==='ARCHIVE_RESOURCE_LIMIT'&&result.outputBytes===0,'Output escaped cap');return result
      }))
      await test('output bound',()=>withBackend(async b=>{await b.open(await load('medium.7z'));return expectedError(()=>b.extractEntry(0),['ARCHIVE_RESOURCE_LIMIT'])},{maxOutputBytes:1024}))
      await test('entry count bound',()=>withBackend(async b=>expectedError(async()=>b.open(await load('normal.7z')),['ARCHIVE_RESOURCE_LIMIT']),{maxEntries:2}))
      await test('read work bound',()=>withBackend(async b=>expectedError(async()=>b.open(await load('medium.7z')),['ARCHIVE_RESOURCE_LIMIT','ARCHIVE_BACKEND_ERROR','ARCHIVE_CORRUPTED']),{maxReadBytes:128}))
    }
    if(group==='lifecycle'||group==='desktop'){
      for(let i=0;i<10;i++)await test('open/list/extract/close '+i,()=>one(find('normal.7z')))
      for(let i=0;i<5;i++)await test('cancel/reopen '+i,()=>withBackend(async b=>{
        await b.open(await load('medium.7z'))
        const result=b.extractEntry(2,{},()=>{void b.cancel();state.cancellations++})
        await expectedError(()=>result,['ARCHIVE_CANCELLED'])
        const t=performance.now();await b.open(await load('normal.7z'));const out=await b.extractEntry(1);assert(out.data.byteLength>0,'Reopen failed');return {reopenMs:performance.now()-t}
      }))
      await test('close during open',()=>withBackend(async b=>{
        const file=await load('medium.7z'),open=b.open(file,{},()=>{void b.close()});return expectedError(()=>open,['ARCHIVE_CANCELLED'])
      }))
      await test('external deadline',()=>withBackend(async b=>expectedError(async()=>b.open(await load('medium.7z')),['ARCHIVE_TIMEOUT']),{maxOperationMs:1}))
    }
    document.querySelector('#status').textContent='Finished '+group
  }catch(e){document.querySelector('#status').textContent='Stopped: '+(e.code??e.message)}finally{running=false;render()}
  return summary()
}
function summary(){return {...state,rows:undefined}}
function render(){document.querySelector('#output').textContent=JSON.stringify(summary(),null,2)}
document.querySelector('#environment').textContent=`build=${state.build}; secureContext=${isSecureContext}; hmr=false; isolated test only`
for(const button of document.querySelectorAll('[data-group]'))button.onclick=()=>run(button.dataset.group)
document.querySelector('#summary').onclick=render
globalThis.spike={state,run,one,summary,withBackend,load}
