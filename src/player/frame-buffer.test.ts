import { expect, it, vi } from 'vitest'
import { FrameBuffer } from './frame-buffer'
import type { AnimationSequence } from '../media/animation'
import type { DecodedFrame } from '../media/frame'

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
