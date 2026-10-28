// Direct C/WASM contract regression; browser Worker integration is a separate gate.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'

const bytes = await readFile('src/formats/webp/wasm/aniview-webp.wasm')
async function runtime() {
  let api
  const imports = {
    env: { _abort_js: () => { throw Error('WASM abort') }, emscripten_resize_heap: size => {
      // Match the generated runtime's bounded 20% geometric growth policy.
      const oldSize = api.memory.buffer.byteLength, maximum = 268435456
      if (size > maximum) return 0
      for (const reduction of [1, 2, 4]) {
        const overgrowth = Math.min(oldSize * (1 + 0.2 / reduction), size + 100663296)
        const target = Math.min(maximum, Math.ceil(Math.max(size, overgrowth) / 65536) * 65536)
        try { api.memory.grow((target - oldSize) / 65536); return 1 } catch { /* Try less reserve. */ }
      }
      return 0
    } },
    wasi_snapshot_preview1: { fd_close: () => 0, fd_seek: () => 70, fd_write: (_fd, _iov, _count, written) => {
      new DataView(api.memory.buffer).setUint32(written, 0, true); return 0
    } },
  }
  api = (await WebAssembly.instantiate(bytes, imports)).instance.exports
  api.__wasm_call_ctors(); api.emscripten_stack_init()
  return api
}
function pixel(index, x, y, alpha = true) {
  const a = alpha ? [0, 1, 64, 127, 128, 200, 254, 255][(x + y) % 8] : 255
  return [(x * 11 + index * 67) & 255, (y * 13 + index * 23) & 255, (x + y + index * 43) & 255, a]
}
function input(width, height, index, alpha = true) {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set(pixel(index, x, y, alpha), (y * width + x) * 4)
  return rgba
}
async function encode({ width, height, count, plays = 0, durations = [20, 27, 100, 250, 500, 1000], duplicate = false, identical = false, alpha = true }) {
  const api = await runtime(), baseline = api.aniview_webp_live_alloc_bytes()
  const ctx = api.aniview_webp_encoder_create(width, height, count, plays)
  assert(ctx); assert.equal(api.aniview_webp_encoder_count(), 1)
  let time = 0, peakHeap = api.memory.buffer.byteLength, peakLive = api.aniview_webp_live_alloc_bytes()
  const start = performance.now(), frameDurations = []
  for (let i = 0; i < count; i++) {
    const rgba = input(width, height, identical ? 0 : duplicate ? Math.floor(i / 2) : i, alpha)
    new Uint8Array(api.memory.buffer).set(rgba, api.aniview_webp_encoder_input(ctx))
    assert.equal(api.aniview_webp_encoder_add(ctx, time), 1)
    frameDurations.push(durations[i % durations.length]); time += frameDurations.at(-1)
    peakHeap = Math.max(peakHeap, api.memory.buffer.byteLength)
    peakLive = Math.max(peakLive, api.aniview_webp_live_alloc_bytes())
  }
  assert.equal(api.aniview_webp_encoder_finish(ctx, time), 1)
  const length = api.aniview_webp_encoder_output_size(ctx), ptr = api.aniview_webp_encoder_output(ctx)
  const encoded = new Uint8Array(api.memory.buffer).slice(ptr, ptr + length)
  peakHeap = Math.max(peakHeap, api.memory.buffer.byteLength)
  peakLive = Math.max(peakLive, api.aniview_webp_live_alloc_bytes())
  api.aniview_webp_encoder_destroy(ctx); assert.equal(api.aniview_webp_encoder_count(), 0)
  const afterDestroy = api.aniview_webp_live_alloc_bytes()
  const pointer = api.malloc(encoded.byteLength); new Uint8Array(api.memory.buffer).set(encoded, pointer)
  const decoder = api.aniview_webp_create(pointer, encoded.byteLength); assert(decoder)
  const decoded = { width: api.aniview_webp_width(decoder), height: api.aniview_webp_height(decoder),
    frames: api.aniview_webp_frame_count(decoder), plays: api.aniview_webp_loop_count(decoder), durations: [], hiddenRgbMismatches: 0 }
  let previous = 0, index = 0
  while (api.aniview_webp_has_next(decoder)) {
    assert.equal(api.aniview_webp_next(decoder), 1)
    const timestamp = api.aniview_webp_timestamp(decoder)
    decoded.durations.push(timestamp - previous); previous = timestamp
    const rgba = new Uint8Array(api.memory.buffer, api.aniview_webp_frame(decoder), width * height * 4)
    const sourceIndex = identical ? 0 : index
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const expected = pixel(sourceIndex, x, y, alpha), offset = (y * width + x) * 4
      assert.equal(rgba[offset + 3], expected[3], 'Alpha exact')
      for (let c = 0; c < 3; c++) {
        if (expected[3] === 0) decoded.hiddenRgbMismatches += +(rgba[offset + c] !== expected[c])
        else assert.equal(rgba[offset + c], expected[c], `Visible RGB exact at frame ${index}, pixel ${x},${y}`)
      }
    }
    index++
  }
  api.aniview_webp_destroy(decoder)
  assert.equal(api.aniview_webp_live_alloc_bytes(), baseline, 'No encoder/decoder live-allocation residue')
  if (!duplicate && !identical) {
    assert.equal(decoded.frames, count); assert.equal(decoded.plays, plays); assert.deepEqual(decoded.durations, frameDurations)
  }
  return { width, height, inputFrames: count, plays, outputBytes: length, elapsedWithDecodeBackMs: performance.now() - start,
    wasmHeapCapacity: peakHeap, peakObservedLiveAllocBytes: peakLive, liveAllocBaseline: baseline,
    liveAllocAfterEncoderDestroy: afterDestroy, rgbaFramesInTestInput: 1, requestedDurations: frameDurations,
    decoded }
}
const report = { note: 'Direct WASM bridge and existing C decoder; heap capacity and observed live checkpoints are proxies, not transient peak allocation or browser RSS. Timing includes decode-back here.', roundTrips: [], memory: [], edgeCases: [] }
for (const plays of [0, 1, 2, 3]) report.roundTrips.push(await encode({ width: 8, height: 8, count: 6, plays }))
for (const count of [10, 50, 100, 200]) {
  const result = await encode({ width: 320, height: 240, count, alpha: false })
  report.memory.push(result); console.log(JSON.stringify({ memoryFrames: count, heap: result.wasmHeapCapacity, live: result.peakObservedLiveAllocBytes, output: result.outputBytes }))
}
for (const [width, height] of [[1024, 1024], [1920, 1080], [2048, 2048]]) report.memory.push(await encode({ width, height, count: 2, alpha: false }))
report.edgeCases.push(await encode({ width: 8, height: 8, count: 6, duplicate: true }))
const identical = await encode({ width: 8, height: 8, count: 6, identical: true, plays: 2 })
assert.equal(identical.decoded.frames, 1); assert.equal(identical.decoded.plays, 2)
assert.deepEqual(identical.decoded.durations, [1897]); report.edgeCases.push(identical)
for (const plays of [0, 1, 2, 3]) for (const duration of [0, 20, 27, 100, 250, 500, 1000]) {
  report.edgeCases.push(await encode({ width: 8, height: 8, count: 1, plays, durations: [duration] }))
}
await mkdir('.tools/conversion', { recursive: true })
await writeFile('.tools/conversion/webp-bridge-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ status: 'PASS', roundTrips: report.roundTrips.length, memoryCases: report.memory.length,
  edgeCases: report.edgeCases.map(x => ({ input: x.inputFrames, output: x.decoded.frames, durations: x.decoded.durations, plays: x.decoded.plays })) }))
