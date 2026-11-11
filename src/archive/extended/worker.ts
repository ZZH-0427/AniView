import { MediaError } from '../../media/errors'
import { loadSevenZip } from './loader'
import type { SevenZipRuntime } from './native-types'
import { nativeOutcome as outcome, readNativeText } from './native-properties'
import { assertActualOutput, assertExtendedEntries, assertExtendedExtraction, assertExtendedInput,
  assertNativeMetrics, assertSourceRead, detectExtendedSignature, extendedPath, EXTENDED_LIMITS,
  methodDictionary, nativeBoolean, nativeNumber, safeCount } from './policy'
import type { ExtendedEntry, ExtendedNativeMetrics, ExtendedRequest, ExtendedResponse } from './protocol'

interface SyncReader { readAsArrayBuffer(blob: Blob): ArrayBuffer }
declare const FileReaderSync: { prototype: SyncReader }
let runtime: SevenZipRuntime | undefined, memory: WebAssembly.Memory | undefined
let entries: readonly ExtendedEntry[] | undefined
let ranges = 0, bytesRead = 0, maxRead = 0, busy = false
function metrics(outputBytes = 0): ExtendedNativeMetrics {
  const value = { wasmBytes: memory?.buffer.byteLength ?? 0, wasmMaximum: EXTENDED_LIMITS.maxWasmBytes,
    ranges, bytesRead, maxRead, outputBytes, mountedArchives: runtime ? 1 : 0, instances: runtime ? 1 : 0 }
  assertNativeMetrics(value)
  return value
}
function checkedRequest(value: unknown): value is ExtendedRequest {
  if (!value || typeof value !== 'object' || !('type' in value) || !('id' in value) || !('generation' in value)
    || !Number.isSafeInteger(value.id) || !Number.isSafeInteger(value.generation)) return false
  if (value.type === 'open') return 'source' in value && value.source instanceof Blob
    && (!('password' in value) || typeof value.password === 'string')
  if (value.type === 'extract') return 'entryId' in value && Number.isSafeInteger(value.entryId)
    && (!('password' in value) || typeof value.password === 'string')
  return value.type === 'list' || value.type === 'metrics'
}
function send(response: ExtendedResponse, transfer: Transferable[] = []) { globalThis.postMessage(response, { transfer }) }
async function perform(request: ExtendedRequest) {
  const envelope = { id: request.id, generation: request.generation }
  const progress = (phase: 'loading' | 'opening' | 'listing' | 'extracting') => send({ ...envelope, type: 'progress', phase })
  try {
    if (request.type === 'open') {
      if (runtime) throw new MediaError('ARCHIVE_BACKEND_ERROR')
      assertExtendedInput(request.source.size)
      const kind = detectExtendedSignature(new Uint8Array(await request.source.slice(0, 8).arrayBuffer()))
      progress('loading')
      const loaded = await loadSevenZip()
      runtime = loaded.runtime; memory = loaded.memory
      // Each Worker owns this hook for its entire lifetime. Termination is the
      // close/cancel boundary; the observer is an I/O guard, not a heap guard.
      const read = FileReaderSync.prototype.readAsArrayBuffer
      FileReaderSync.prototype.readAsArrayBuffer = function (blob) {
        assertSourceRead(bytesRead, blob.size)
        bytesRead += blob.size; ranges++; maxRead = Math.max(maxRead, blob.size)
        return read.call(this, blob)
      }
      runtime.FS.mkdir('/input')
      runtime.FS.mount(runtime.WORKERFS, { blobs: [{ name: 'archive', data: request.source }] }, '/input')
      progress('opening')
      outcome(runtime.ccall('av_open', 'number', ['number', 'string'], [kind, request.password ?? null]))
      const count = safeCount(runtime._av_count())
      if (count > EXTENDED_LIMITS.maxEntries) throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
      progress('listing')
      const normalized: ExtendedEntry[] = []
      let totalPathChars = 0
      for (let id = 0; id < count; id++) {
        const text = (property: number) => readNativeText(runtime!, id, property)
        const number = (property: number) => nativeNumber(runtime!._av_number(id, property))
        const path = text(3), normalizedPath = extendedPath(path)
        if (path.length > EXTENDED_LIMITS.maxTotalPathChars - totalPathChars) throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
        totalPathChars += path.length
        const isDirectory = nativeBoolean(runtime._av_number(id, 6)) === true
        const attributes = number(9), posix = number(53)
        const mode = posix ?? (attributes !== null && (attributes & 0x8000) ? attributes >>> 16 : null)
        const special = !!text(54) || !!text(90) || mode !== null && (mode & 0xf000) !== 0 && ![0x4000, 0x8000].includes(mode & 0xf000)
        const method = text(22)
        normalized.push({ id, path, normalizedPath, isDirectory, isFile: !isDirectory && !special,
          size: number(7), packedSize: number(8), encrypted: nativeBoolean(runtime._av_number(id, 15)),
          solid: nativeBoolean(runtime._av_number(id, 13)), method, attributes,
          dictionaryBytes: methodDictionary(method, number(18)), block: number(27), special })
      }
      assertExtendedEntries(normalized)
      entries = normalized
      send({ ...envelope, type: 'ready', result: { entries, metrics: metrics() } })
      return
    }
    if (!runtime || !entries || !memory) throw new MediaError('ARCHIVE_CLOSED')
    if (request.type === 'list') { send({ ...envelope, type: 'listed', entries }); return }
    if (request.type === 'metrics') { send({ ...envelope, type: 'metrics', metrics: metrics() }); return }
    const entry = entries.find(candidate => candidate.id === request.entryId)
    if (!entry) throw new MediaError('ARCHIVE_UNSUPPORTED')
    assertExtendedExtraction(entry)
    progress('extracting')
    outcome(runtime.ccall('av_extract', 'number', ['number', 'number', 'string'],
      [entry.id, EXTENDED_LIMITS.maxOutputBytes, request.password ?? null]))
    try {
      const size = safeCount(runtime._av_length()), pointer = safeCount(runtime._av_output())
      assertActualOutput(size)
      if (!(memory.buffer instanceof ArrayBuffer) || pointer > memory.buffer.byteLength - size
        || entry.size !== null && size !== entry.size) throw new MediaError('ARCHIVE_CORRUPTED')
      const data = memory.buffer.slice(pointer, pointer + size)
      const nativeMetrics = metrics(size)
      runtime._av_release()
      send({ ...envelope, type: 'extracted', result: { data, metrics: nativeMetrics } }, [data])
    } finally { runtime._av_release() }
  } catch (cause) {
    try { runtime?._av_release() } catch { /* A trapped instance is terminated by the parent. */ }
    send({ ...envelope, type: 'error', code: cause instanceof MediaError ? cause.code : 'ARCHIVE_BACKEND_ERROR' })
  }
}
globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!checkedRequest(event.data)) return
  const request = event.data
  if (busy) { send({ id: request.id, generation: request.generation, type: 'error', code: 'ARCHIVE_BACKEND_ERROR' }); return }
  busy = true
  void perform(request).finally(() => { busy = false })
})
