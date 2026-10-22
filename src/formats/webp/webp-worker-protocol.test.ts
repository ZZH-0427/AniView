import { describe, expect, it } from 'vitest'
import { frameDuration } from './webp-worker-protocol'

describe('libwebp timestamps', () => {
  it('normalizes cumulative timestamps to variable durations', () => {
    expect([frameDuration(80, 0), frameDuration(120, 80), frameDuration(200, 120)]).toEqual([80, 40, 80])
  })
  it('preserves zero durations and rejects backwards or invalid timestamps', () => {
    expect(frameDuration(0, 0)).toBe(0)
    expect(() => frameDuration(40, 80)).toThrow()
    expect(() => frameDuration(NaN, 0)).toThrow()
    expect(() => frameDuration(80, NaN)).toThrow()
  })
})
