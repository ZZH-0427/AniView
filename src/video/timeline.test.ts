import { describe, it, expect } from 'vitest'
import { VideoTimeline } from './timeline'
describe('video cumulative microsecond timeline', () => {
  it.each([1,10,20,27,33,41,100,250,500,1000])('preserves %dms as a boundary delta', duration => {
    expect(new VideoTimeline().next(duration)).toEqual({ timestampUs: 0, durationUs: duration * 1000 })
  })
  it('uses canonical VFR boundaries without an FPS grid', () => {
    const t = new VideoTimeline(), durations = [27,100,41,500,20,250,33]
    let boundary = 0
    for (const d of durations) { expect(t.next(d)).toEqual({ timestampUs: boundary, durationUs: d * 1000 }); boundary += d * 1000 }
  })
  it('does not accumulate independent rounding error', () => {
    const t = new VideoTimeline(); let end = 0
    for (let i = 0; i < 199; i++) { const f = t.next(1000 / 59.94); end = f.timestampUs + f.durationUs }
    expect(end).toBe(Math.round(199 * 1000 / 59.94 * 1000))
    expect(end).not.toBe(199 * Math.round(1000 / 59.94 * 1000))
  })
  it.each([0,-1,NaN,Infinity,.0001])('rejects nonpositive or colliding duration %d', d => expect(() => new VideoTimeline().next(d)).toThrow('VIDEO_FRAME_FAILED'))
  it('accepts the duration boundary and rejects a long hold beyond it', () => {
    const t = new VideoTimeline(); t.next(30_000); expect(() => t.next(1)).toThrow('RESOURCE_LIMIT')
    expect(() => new VideoTimeline().next(2_000_000)).toThrow('RESOURCE_LIMIT')
  })
})
