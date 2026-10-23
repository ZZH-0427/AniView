import { describe, expect, it } from 'vitest'
import { decodedFrameBytes, frameCacheBudget, DEFAULT_FRAME_CACHE_BYTES, MAX_AUTOMATIC_FRAME_CACHE_BYTES } from './frame-budget'

describe('format-independent decoded-frame budgets', () => {
  it('keeps the 16 MiB default for ordinary frames', () => {
    expect(frameCacheBudget(decodedFrameBytes(672, 1024))).toBe(DEFAULT_FRAME_CACHE_BYTES)
    expect(frameCacheBudget(decodedFrameBytes(100, 100))).toBe(DEFAULT_FRAME_CACHE_BYTES)
  })
  it('fits current plus next for the reported 1280×1910 resolution', () => {
    const bytes = decodedFrameBytes(1280, 1910)
    expect(bytes).toBe(9_779_200)
    expect(frameCacheBudget(bytes)).toBe(19_558_400)
    expect(frameCacheBudget(bytes)).toBeLessThan(MAX_AUTOMATIC_FRAME_CACHE_BYTES)
  })
  it('accepts the automatic ceiling and rejects frames above it', () => {
    expect(frameCacheBudget(decodedFrameBytes(2048, 2048))).toBe(MAX_AUTOMATIC_FRAME_CACHE_BYTES)
    expect(() => frameCacheBudget(decodedFrameBytes(4097, 1024))).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }))
  })
  it('never silently increases an explicitly configured byte budget', () => {
    expect(() => frameCacheBudget(decodedFrameBytes(1280, 1910), DEFAULT_FRAME_CACHE_BYTES))
      .toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }))
    expect(frameCacheBudget(4, 12)).toBe(12)
  })
  it.each([[0, 1], [1, -1], [1.5, 1], [Infinity, 1], [Number.MAX_SAFE_INTEGER, 2]])('rejects invalid or overflowing dimensions %s×%s', (width, height) => {
    expect(() => decodedFrameBytes(width, height)).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })
})
