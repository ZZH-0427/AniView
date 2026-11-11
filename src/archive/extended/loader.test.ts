import { describe, expect, it } from 'vitest'
import { initializeSevenZip } from './loader'
import type { SevenZipFactory, SevenZipRuntime } from './native-types'

const runtime: SevenZipRuntime = {
  FS: { mkdir() {}, mount() {} }, WORKERFS: {}, UTF8ToString() { return '' },
  ccall() { return 0 }, _av_count() { return 0 }, _av_last() { return 0 }, _av_number() { return 0 }, _av_string() { return 0 },
  _av_output() { return 0 }, _av_length() { return 0 }, _av_release() {},
}
const factory: SevenZipFactory = options => new Promise(resolve => {
  options.instantiateWasm({}, () => resolve(runtime))
})
// Minimal valid module exporting one 16MiB memory with a 64MiB maximum.
const bytes = () => new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0,
  5, 6, 1, 1, 128, 2, 128, 8, 7, 10, 1, 6, 109, 101, 109, 111, 114, 121, 2, 0]).buffer

describe('SevenZip factory rejection bridge', () => {
  it('captures the real instance memory without a JS growth guard', async () => {
    const result = await initializeSevenZip(factory, bytes())
    expect(result.runtime).toBe(runtime)
    expect(result.memory.buffer.byteLength).toBe(16777216)
  })
  it('rejects invalid WASM promptly even when factory readiness would otherwise stay pending', async () => {
    await expect(initializeSevenZip(factory, new Uint8Array([1, 2, 3]).buffer)).rejects.toMatchObject({ code: 'ARCHIVE_WASM_INITIALIZATION_FAILED' })
    expect((await initializeSevenZip(factory, bytes())).runtime).toBe(runtime)
  })
  it('normalizes factory exceptions and does not expose raw details', async () => {
    const badFactory: SevenZipFactory = () => Promise.reject(new Error('private native details'))
    await expect(initializeSevenZip(badFactory, bytes())).rejects.toMatchObject({ code: 'ARCHIVE_WASM_INITIALIZATION_FAILED' })
  })
})
