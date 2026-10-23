import { describe, expect, it, vi } from 'vitest'
import { ByteBudgetFrameCache } from './frame-cache'
import type { DecodedFrame } from '../media/frame'
const frame = (index: number, byteLength = 4): DecodedFrame => ({ index, byteLength, width: 1, height: 1, durationMs: 20, image: null, dispose: vi.fn() })
describe('byte-budget cache', () => {
  it('inserts/retrieves, replaces and disposes replaced/evicted frames', () => {
    const cache = new ByteBudgetFrameCache(12, 3)
    const old = frame(0), replacement = frame(0, 8)
    expect(cache.insert(old)).toBe(true)
    expect(cache.get(0)).toBe(old)
    expect(cache.insert(replacement)).toBe(true)
    expect(old.dispose).toHaveBeenCalledOnce()
    expect(cache.bytes).toBe(8)
    cache.evict(0)
    expect(replacement.dispose).toHaveBeenCalledOnce()
    expect(cache.bytes).toBe(0)
  })
  it('never exceeds either budget and leaves rejected frames owned by caller', () => {
    const cache = new ByteBudgetFrameCache(12, 2)
    cache.insert(frame(0, 8))
    const rejected = frame(1, 8)
    expect(cache.insert(rejected)).toBe(false)
    expect(rejected.dispose).not.toHaveBeenCalled()
    cache.insert(frame(1))
    expect(cache.insert(frame(2, 0))).toBe(false)
    expect(cache.bytes).toBe(12)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.bytes).toBe(0)
    expect(cache.peakBytes).toBe(12)
  })
})
