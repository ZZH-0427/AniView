import { expect, it, vi } from 'vitest'
import { FrameBuffer } from './frame-buffer'
import type { AnimationSequence } from '../media/animation'
import type { DecodedFrame } from '../media/frame'

it('bounds large frames to the shared two-frame budget across refill, reset and close', async () => {
  const bytes = 1280 * 1910 * 4
  const released = vi.fn(), pulled = vi.fn()
  const sequence: AnimationSequence = { width: 1280, height: 1910, frameCount: 12,
    async *frames() {
      for (let index = 0; index < 12; index++) {
        pulled()
        yield { index, width: 1280, height: 1910, durationMs: 100, byteLength: bytes, image: null, dispose: released }
      }
    }, dispose: vi.fn(async () => {}),
  }
  const buffer = new FrameBuffer(sequence)
  await buffer.restart()
  expect(pulled).toHaveBeenCalledTimes(2)
  expect(buffer.cache.maxBytes).toBe(19_558_400)
  for (let index = 0; index < 11; index++) {
    expect(buffer.cache.get(index + 1)).toBeDefined()
    buffer.cache.evict(index)
    await buffer.fill()
    expect(buffer.cache.size).toBeLessThanOrEqual(2)
    expect(buffer.cache.bytes).toBeLessThanOrEqual(19_558_400)
  }
  expect(buffer.ended).toBe(true)
  await buffer.restart()
  expect(buffer.cache.size).toBe(2)
  expect(buffer.cache.peakBytes).toBe(19_558_400)
  await buffer.close()
  expect(buffer.cache.bytes).toBe(0)
  expect(released).toHaveBeenCalledTimes(14)
})

it('disposes a late in-flight frame on close and never inserts it into the new/closed cache', async () => {
  let resolve: ((result: IteratorResult<DecodedFrame>) => void) | undefined
  const frame: DecodedFrame = { index: 0, width: 1, height: 1, byteLength: 4, durationMs: 31, image: null, dispose: vi.fn() }
  const returned = vi.fn(async () => ({ done: true as const, value: undefined }))
  const sequence: AnimationSequence = { width: 1, height: 1,
    frames: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise(r => { resolve = r }), return: returned }) }),
    dispose: vi.fn(async () => { resolve?.({ done: false, value: frame }) }),
  }
  const buffer = new FrameBuffer(sequence, 12, 3)
  const primed = buffer.restart()
  await vi.waitFor(() => expect(resolve).toBeDefined())
  await buffer.close(); await primed
  expect(frame.dispose).toHaveBeenCalledOnce()
  expect(buffer.cache.size).toBe(0)
  expect(sequence.dispose).toHaveBeenCalledOnce()
  expect(returned).toHaveBeenCalledOnce()
})
