import { BackendError, detect, policy, normalizedPath, numeric, dictionary, fail } from './policy.mjs'
let mod, entries, p, sourceKind, memory, ranges = 0, bytesRead = 0, maxRead = 0
let busy = false
const codes = ['OK', 'ARCHIVE_CORRUPTED', 'ARCHIVE_PASSWORD_REQUIRED', 'ARCHIVE_PASSWORD_REJECTED', 'ARCHIVE_RESOURCE_LIMIT', 'ARCHIVE_UNSUPPORTED_METHOD', 'ARCHIVE_BACKEND_ERROR', 'ARCHIVE_PASSWORD_REJECTED_OR_CORRUPTED']
function outcome(code) { if (code) fail(codes[code] ?? 'ARCHIVE_BACKEND_ERROR') }
function number(i, property) { return numeric(mod._av_number(i, property)) }
function text(i, property) { return mod.UTF8ToString(mod._av_string(i, property)) }
function metrics() { return { wasmBytes: memory.buffer.byteLength, wasmMaximum: 67108864, ranges, bytesRead, maxRead, outputBytes: mod._av_length(), mountedArchives: 1, instances: 1 } }
async function handle(m, progress) {
  if (m.type === 'OPEN') {
    p = policy(m.limits)
    if (!(m.source instanceof Blob) || m.source.size > p.maxInputBytes) fail('ARCHIVE_RESOURCE_LIMIT')
    sourceKind = detect(new Uint8Array(await m.source.slice(0,8).arrayBuffer()))
    // Glue is fetched only when OPEN is requested, never by normal product UI.
    const asset = new URL('./artifacts/bounded-sevenzip.js', import.meta.url)
    const response = await fetch(asset); if (!response.ok) fail('ARCHIVE_BACKEND_ERROR')
    // UMD factory is loaded as a module side effect; no eval or blob script.
    const { default: factory } = await import(asset.href)
    const wasm = await (await fetch(new URL('./artifacts/bounded-sevenzip.wasm', import.meta.url))).arrayBuffer()
    mod = await factory({ wasmBinary: wasm, print() {}, printErr() {}, instantiateWasm(imports, success) {
      WebAssembly.instantiate(wasm, imports).then(result => { memory = Object.values(result.instance.exports).find(v => v instanceof WebAssembly.Memory); success(result.instance, result.module) }); return {}
    } })
    const read = FileReaderSync.prototype.readAsArrayBuffer
    FileReaderSync.prototype.readAsArrayBuffer = function(blob) {
      if (blob.size > 1048576 || bytesRead + blob.size > p.maxReadBytes) fail('ARCHIVE_RESOURCE_LIMIT')
      bytesRead += blob.size; ranges++; maxRead = Math.max(maxRead, blob.size)
      return read.call(this, blob)
    }
    mod.FS.mkdir('/input'); mod.FS.mount(mod.WORKERFS, { blobs: [{ name: 'archive', data: m.source }] }, '/input')
    progress('opening')
    outcome(mod.ccall('av_open', 'number', ['number','string'], [sourceKind, m.options.password ?? null]))
    const count = mod._av_count()
    if (count < 0 || count > p.maxEntries) fail('ARCHIVE_RESOURCE_LIMIT')
    entries = []; let chars = 0
    for (let i = 0; i < count; i++) {
      const path = text(i, 3), normalized = normalizedPath(path,p)
      chars += path.length; if (chars > p.maxTotalPathChars) fail('ARCHIVE_RESOURCE_LIMIT')
      const dir = number(i,6), attr = number(i,9), posix = number(i,53), sym = text(i,54), hard = text(i,90)
      const mode=posix??(attr!==null&&(attr&0x8000)?attr>>>16:null)
      const special = !!sym || !!hard || mode !== null && (mode & 0xf000) !== 0 && ![0x4000,0x8000].includes(mode & 0xf000)
      const method = text(i,22), declared = number(i,18)
      entries.push({ id: i, path, normalizedPath: normalized, isDirectory: dir === 1, isFile: dir !== 1 && !special,
        size: number(i,7), packedSize: number(i,8), encrypted: number(i,15), solid: number(i,13), method,
        attributes: attr, dictionaryBytes: dictionary(method,declared), block: number(i,27), special })
    }
    return { kind: sourceKind, count, entries, metrics: metrics() }
  }
  if (!mod || !entries) fail('ARCHIVE_CLOSED')
  if (m.type === 'LIST') return entries
  if (m.type === 'METRICS') return metrics()
  if (m.type === 'PROBE_ALLOC') {
    if (!Number.isSafeInteger(m.bytes) || m.bytes < 1 || m.bytes > 128 * 1024 ** 2) fail('ARCHIVE_RESOURCE_LIMIT')
    return { allocated: !!mod._av_probe_alloc(m.bytes), ...metrics() }
  }
  if (m.type === 'PROBE_NATIVE_EXTRACT') {
    if (!entries.some(e=>e.id===m.entryId&&e.isFile)) fail('ARCHIVE_UNSUPPORTED_ENTRY')
    // Deliberately omit declared-size/dictionary preflight and reserve. Native
    // actual-output cap (1 KiB) and compiled 64 MiB memory maximum remain active.
    const code=mod.ccall('av_extract','number',['number','number','string','number'],[m.entryId,1024,null,1])
    const result={code:codes[code],...metrics()};mod._av_release();return result
  }
  if (m.type === 'EXTRACT') {
    const e = entries.find(e => e.id === m.entryId)
    if (!e?.isFile) fail('ARCHIVE_UNSUPPORTED_ENTRY')
    if (e.size !== null && e.size > p.maxOutputBytes || e.dictionaryBytes !== null && e.dictionaryBytes > p.maxDictionaryBytes) fail('ARCHIVE_RESOURCE_LIMIT')
    progress('extracting')
    outcome(mod.ccall('av_extract','number',['number','number','string','number'],[e.id,p.maxOutputBytes,m.options.password ?? null,0]))
    const n=mod._av_length(), at=mod._av_output()
    // A single transferable JS copy; native selected output is freed before send.
    const data = memory.buffer.slice(at,at+n);mod._av_release()
    return { data, metrics: metrics() }
  }
  fail('ARCHIVE_BACKEND_ERROR')
}
globalThis.onmessage = async ({ data: m }) => {
  const base={generation:m.generation,requestId:m.requestId}
  if(busy){postMessage({...base,type:'ERROR',code:'ARCHIVE_BUSY'});return}
  busy=true
  try {
    const result=await handle(m,phase=>postMessage({...base,type:'PROGRESS',phase}))
    postMessage({...base,type:'RESULT',result},result?.data?[result.data]:[])
  } catch(e) {
    // Neither native text, filenames nor credentials enter diagnostics.
    postMessage({...base,type:'ERROR',code:e instanceof BackendError?e.code:'ARCHIVE_BACKEND_ERROR'})
  } finally { busy=false }
}
