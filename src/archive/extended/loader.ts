import { MediaError } from '../../media/errors'
import { EXTENDED_LIMITS } from './policy'
import type { SevenZipFactory, SevenZipRuntime } from './native-types'

export interface LoadedSevenZip { runtime: SevenZipRuntime; memory: WebAssembly.Memory }

/** Forward rejection from the custom callback: Emscripten has no failure callback. */
export async function initializeSevenZip(factory: SevenZipFactory, wasm: ArrayBuffer,
  instantiate = WebAssembly.instantiate.bind(WebAssembly)): Promise<LoadedSevenZip> {
  let capturedMemory: WebAssembly.Memory | undefined
  let rejectInstantiation: (reason: unknown) => void = () => {}
  const failed = new Promise<never>((_, reject) => { rejectInstantiation = reject })
  const ready = Promise.resolve().then(() => factory({
    wasmBinary: wasm, print() {}, printErr() {},
    instantiateWasm(imports, success) {
      void Promise.resolve().then(() => instantiate(wasm, imports)).then(result => {
        const memory = Object.values(result.instance.exports).find(value => value instanceof WebAssembly.Memory)
        if (!(memory instanceof WebAssembly.Memory) || !(memory.buffer instanceof ArrayBuffer)
          || memory.buffer.byteLength !== EXTENDED_LIMITS.initialWasmBytes) {
          throw new MediaError('ARCHIVE_WASM_INITIALIZATION_FAILED')
        }
        capturedMemory = memory
        success(result.instance, result.module)
      }).catch(() => rejectInstantiation(new MediaError('ARCHIVE_WASM_INITIALIZATION_FAILED')))
      return {}
    },
  }))
  try {
    const runtime = await Promise.race([ready, failed])
    if (!capturedMemory) throw new MediaError('ARCHIVE_WASM_INITIALIZATION_FAILED')
    return { runtime, memory: capturedMemory }
  } catch { throw new MediaError('ARCHIVE_WASM_INITIALIZATION_FAILED') }
}

/** These separate library assets remain replaceable and same-origin under /AniView/. */
export async function loadSevenZip(): Promise<LoadedSevenZip> {
  const base = new URL(import.meta.env.BASE_URL, globalThis.location.origin)
  const glueUrl = new URL('vendor/sevenzip/bounded-sevenzip.js', base)
  const wasmUrl = new URL('vendor/sevenzip/bounded-sevenzip.wasm', base)
  let factory: SevenZipFactory, wasm: ArrayBuffer
  try {
    const imported: unknown = await import(/* @vite-ignore */ glueUrl.href)
    if (!imported || typeof imported !== 'object' || !('default' in imported)
      || typeof imported.default !== 'function') throw new MediaError('ARCHIVE_BACKEND_ASSET_FAILED')
    factory = imported.default as SevenZipFactory
    const response = await fetch(wasmUrl)
    if (!response.ok) throw new MediaError('ARCHIVE_BACKEND_ASSET_FAILED')
    wasm = await response.arrayBuffer()
  } catch { throw new MediaError('ARCHIVE_BACKEND_ASSET_FAILED') }
  return initializeSevenZip(factory, wasm)
}
