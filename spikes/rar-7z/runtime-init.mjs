import { BackendError } from './policy.mjs'

// Emscripten's custom instantiateWasm callback has a success callback but no
// failure callback. Explicitly race failures against factory readiness so a
// rejected compile/instantiate cannot leave initialization pending forever.
export async function initializeRuntime(factory, wasm, progress, onMemory, instantiate = WebAssembly.instantiate.bind(WebAssembly)) {
  let rejectInstantiation
  const failed = new Promise((_, reject) => { rejectInstantiation = reject })
  const ready = Promise.resolve().then(() => factory({
    wasmBinary: wasm, print() {}, printErr() {},
    instantiateWasm(imports, success) {
      progress('wasm-instantiate-start')
      Promise.resolve().then(() => instantiate(wasm, imports)).then(result => {
        const memory = Object.values(result.instance.exports).find(v => v instanceof WebAssembly.Memory)
        if (!memory) throw new BackendError('ARCHIVE_WASM_INITIALIZATION_FAILED')
        onMemory(memory)
        progress('wasm-instantiated', { wasmBytes: memory.buffer.byteLength })
        success(result.instance, result.module)
      }).catch(() => rejectInstantiation(new BackendError('ARCHIVE_WASM_INITIALIZATION_FAILED')))
      return {}
    },
  }))
  return Promise.race([ready, failed])
}
