import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONVERSION_LIMITS } from './model'
import { WebPAnimationEncoder } from './webp-encoder'

const mocks = vi.hoisted(() => {
  const module = { HEAPU8: new Uint8Array(4096),
    _aniview_webp_encoder_create: vi.fn(() => 1), _aniview_webp_error: vi.fn(() => 0),
    _aniview_webp_encoder_destroy: vi.fn(), _aniview_webp_encoder_input: vi.fn(() => 128),
    _aniview_webp_encoder_add: vi.fn<(context: number, timestamp: number) => number>(() => 1), _aniview_webp_encoder_finish: vi.fn(() => 1),
    _aniview_webp_encoder_output: vi.fn(() => 1024), _aniview_webp_encoder_output_size: vi.fn(() => 8),
    _aniview_webp_encoder_count: vi.fn(() => 0), _aniview_webp_live_alloc_bytes: vi.fn(() => 64) }
  return { module, create: vi.fn(async () => module) }
})
vi.mock('../formats/webp/wasm/aniview-webp.mjs', () => ({ default: mocks.create }))

const metadata = { width: 2, height: 2, frameCount: 2, playCount: 0 }
const frame = (index: number, durationMs = 27) => ({ index, durationMs, rgba: new Uint8Array(16).fill(72).buffer })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.module.HEAPU8 = new Uint8Array(4096)
  mocks.module.HEAPU8.set([82, 73, 70, 70, 0, 0, 0, 0], 1024)
  mocks.module._aniview_webp_encoder_create.mockReturnValue(1)
  mocks.module._aniview_webp_encoder_add.mockReturnValue(1)
  mocks.module._aniview_webp_encoder_finish.mockReturnValue(1)
  mocks.module._aniview_webp_encoder_output_size.mockReturnValue(8)
  mocks.module._aniview_webp_encoder_destroy.mockReset()
  mocks.module._aniview_webp_live_alloc_bytes.mockReturnValue(64)
  mocks.create.mockResolvedValue(mocks.module)
})

describe('WebP worker encoder bridge ownership', () => {
  it('validates experimental metadata before loading WASM', async () => {
    await expect(WebPAnimationEncoder.create({ ...metadata, width: 2049 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('passes normalized total plays unchanged to the bridge for 0, 1 and 2', async () => {
    for (const playCount of [0, 1, 2]) {
      const encoder = await WebPAnimationEncoder.create({ ...metadata, playCount })
      expect(mocks.module._aniview_webp_encoder_create).toHaveBeenLastCalledWith(2, 2, 2, playCount)
      encoder.dispose()
    }
  })
  it('uses cumulative millisecond timestamps and the real final end timestamp', async () => {
    const durations = [20, 27, 100, 250, 500, 1000]
    const encoder = await WebPAnimationEncoder.create({ ...metadata, frameCount: durations.length })
    for (const [index, duration] of durations.entries()) await encoder.addFrame(frame(index, duration))
    await encoder.finish()
    expect(mocks.module._aniview_webp_encoder_add.mock.calls.map(call => call[1])).toEqual([0, 20, 47, 147, 397, 897])
    expect(mocks.module._aniview_webp_encoder_finish).toHaveBeenCalledWith(1, 1897)
  })
  it('quantizes cumulative fractional timing rather than accumulating independent rounding error', async () => {
    const encoder = await WebPAnimationEncoder.create(metadata)
    await encoder.addFrame(frame(0, 27.4)); await encoder.addFrame(frame(1, 27.4)); await encoder.finish()
    expect(mocks.module._aniview_webp_encoder_add).toHaveBeenLastCalledWith(1, 27)
    expect(mocks.module._aniview_webp_encoder_finish).toHaveBeenCalledWith(1, 55)
  })
  it('copies the input into one reusable WASM picture and output once into an independent exact range', async () => {
    const encoder = await WebPAnimationEncoder.create(metadata), input = frame(0)
    await encoder.addFrame(input)
    expect(mocks.module.HEAPU8.slice(128, 144)).toEqual(new Uint8Array(input.rgba))
    await encoder.addFrame(frame(1)); const result = await encoder.finish()
    expect(result.data.byteLength).toBe(8); expect(result.byteLength).toBe(8)
    expect(result.data).not.toBe(mocks.module.HEAPU8.buffer)
    expect([...new Uint8Array(result.data)]).toEqual([82, 73, 70, 70, 0, 0, 0, 0])
    expect(mocks.module._aniview_webp_encoder_destroy).toHaveBeenCalledExactlyOnceWith(1)
    expect(result.metrics).toMatchObject({ outputBytes: 8, outputCapacity: 8, wasmHeapBytes: 4096, wasmLiveAllocBytes: 64 })
    encoder.dispose(); expect(mocks.module._aniview_webp_encoder_destroy).toHaveBeenCalledTimes(1)
  })
  it('destroys the encoder on ordering, missing-final-frame, native add and output-limit failures', async () => {
    let encoder = await WebPAnimationEncoder.create(metadata)
    await expect(encoder.addFrame(frame(1))).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(mocks.module._aniview_webp_encoder_destroy).toHaveBeenCalledTimes(1)
    encoder = await WebPAnimationEncoder.create(metadata)
    await expect(encoder.finish()).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
    expect(mocks.module._aniview_webp_encoder_destroy).toHaveBeenCalledTimes(2)
    encoder = await WebPAnimationEncoder.create(metadata)
    mocks.module._aniview_webp_encoder_add.mockReturnValue(0)
    await expect(encoder.addFrame(frame(0))).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
    expect(mocks.module._aniview_webp_encoder_destroy).toHaveBeenCalledTimes(3)
    mocks.module._aniview_webp_encoder_add.mockReturnValue(1)
    encoder = await WebPAnimationEncoder.create(metadata)
    await encoder.addFrame(frame(0)); await encoder.addFrame(frame(1))
    mocks.module._aniview_webp_encoder_output_size.mockReturnValue(CONVERSION_LIMITS.maxOutputBytes + 1)
    await expect(encoder.finish()).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(mocks.module._aniview_webp_encoder_destroy).toHaveBeenCalledTimes(4)
  })
  it('normalizes runtime loading failures without exposing raw module errors', async () => {
    mocks.create.mockRejectedValue(new Error('local runtime detail'))
    await expect(WebPAnimationEncoder.create(metadata)).rejects.toMatchObject({ code: 'TARGET_ENCODER_UNSUPPORTED', message: 'TARGET_ENCODER_UNSUPPORTED' })
  })
  it('retains sampled live-allocation high water after successful encoder destruction', async () => {
    const encoder = await WebPAnimationEncoder.create(metadata)
    mocks.module._aniview_webp_live_alloc_bytes.mockReturnValue(160)
    await encoder.addFrame(frame(0))
    mocks.module._aniview_webp_live_alloc_bytes.mockReturnValue(96)
    await encoder.addFrame(frame(1))
    mocks.module._aniview_webp_encoder_destroy.mockImplementation(() => { mocks.module._aniview_webp_live_alloc_bytes.mockReturnValue(0) })
    const result = await encoder.finish()
    expect(result.metrics.wasmPeakLiveAllocBytes).toBe(160)
    expect(result.metrics.wasmLiveAllocBytes).toBe(0)
  })
})
