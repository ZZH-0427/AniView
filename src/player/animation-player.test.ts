import { describe, expect, it, vi } from 'vitest'
import { AnimationPlayer } from './animation-player'
import type { PlaybackClock } from './animation-player'
import type { AnimationSequence } from '../media/animation'
import type { DecodedFrame } from '../media/frame'

class Clock implements PlaybackClock {
  time = 0
  id = 0
  callbacks = new Map<number, () => void>()
  now = () => this.time
  request = (callback: () => void) => { this.callbacks.set(++this.id, callback); return this.id }
  cancel = (id: number) => { this.callbacks.delete(id) }
  advance(ms: number) { this.time += ms; const callbacks = [...this.callbacks.values()]; this.callbacks.clear(); callbacks.forEach(fn => fn()) }
}
function setup(loopCount = 1, count = 2) {
  const released = vi.fn(), pulls = vi.fn(), restarts = vi.fn()
  const sequence: AnimationSequence = { width: 1, height: 1, frameCount: count, loopCount,
    async *frames() {
      restarts()
      for (let index = 0; index < count; index++) {
        pulls()
        yield { index, width: 1, height: 1, byteLength: 4, durationMs: index === 0 ? 20 : 40, image: null, dispose: released }
      }
    }, dispose: vi.fn(async () => {}),
  }
  const drawn: number[] = []
  const renderer = { render: (frame: DecodedFrame) => drawn.push(frame.index), clear: vi.fn(), dispose: vi.fn(), setViewport: vi.fn() }
  const clock = new Clock()
  const player = new AnimationPlayer(renderer, () => {}, clock, { maxBytes: 12, maxFrames: 3 })
  return { player, clock, sequence, drawn, released, pulls, restarts }
}
describe('presentation clock and bounded producer', () => {
  it('yields zero-duration frames through the clock instead of spinning synchronously', async () => {
    const { player, clock, sequence, drawn } = setup()
    const original = sequence.frames
    const zeroDuration: AnimationSequence = { ...sequence, async *frames() {
      for await (const frame of original()) yield { ...frame, durationMs: 0 }
    } }
    await player.load(zeroDuration)
    player.play()
    expect(drawn).toEqual([0])
    clock.advance(9); expect(drawn).toEqual([0])
    clock.advance(1); expect(drawn).toEqual([0, 1])
    clock.advance(10); expect(player.state).toBe('ended')
    await player.dispose()
  })
  it('holds the current frame on underrun, then presents sequentially when decode completes', async () => {
    const { player, clock, sequence, drawn } = setup(1, 8)
    const original = sequence.frames
    let release: (() => void) | undefined
    const slow: AnimationSequence = { ...sequence, async *frames() {
      for await (const frame of original()) {
        if (frame.index === 3) await new Promise<void>(resolve => { release = resolve })
        yield frame
      }
    } }
    await player.load(slow); player.play(); clock.advance(20)
    await vi.waitFor(() => expect(release).toBeDefined())
    clock.advance(40); clock.advance(40)
    expect(drawn).toEqual([0, 1, 2])
    expect(player.underruns).toBe(1)
    release?.()
    await vi.waitFor(() => expect(player.metrics.cachedFrames).toBe(3))
    clock.advance(1)
    expect(drawn).toEqual([0, 1, 2, 3])
    await player.dispose()
  })
  it('honors a finite total-play count', async () => {
    const { player, clock, sequence, drawn } = setup(2)
    await player.load(sequence); player.play(); clock.advance(20); clock.advance(40)
    await vi.waitFor(() => {
      expect(drawn).toEqual([0, 1, 0])
      expect(clock.callbacks.size).toBe(1)
    })
    clock.advance(20); clock.advance(40)
    expect(player.state).toBe('ended')
    expect(player.completedPlays).toBe(2)
    await player.dispose()
  })
  it('replay during playback does not evict a future frame from the reseeded cache', async () => {
    const { player, clock, sequence, drawn } = setup(1, 10)
    await player.load(sequence); player.play(); clock.advance(20)
    await player.replay(); clock.advance(20)
    expect(drawn).toEqual([0, 1, 0, 1])
    await player.dispose()
  })
  it('consumes an entire long stream across repeated cache refill boundaries', async () => {
    const { player, clock, sequence, drawn } = setup(0, 100)
    await player.load(sequence); player.play()
    for (let index = 0; index < 105; index++) {
      clock.advance(40)
      for (let microtask = 0; microtask < 12; microtask++) await Promise.resolve()
    }
    expect(drawn).toContain(99)
    expect(player.completedPlays).toBeGreaterThanOrEqual(1)
    await player.dispose()
  })
  it('plays variable durations, preserves pause remainder, ends and replays using a new stream', async () => {
    const { player, clock, sequence, drawn, restarts } = setup()
    await player.load(sequence)
    player.play(); clock.advance(10); player.pause(); clock.advance(100)
    expect(drawn).toEqual([0])
    player.resume(); clock.advance(9); expect(drawn).toEqual([0])
    clock.advance(1); expect(drawn).toEqual([0, 1])
    clock.advance(39); expect(player.state).toBe('playing')
    clock.advance(1); expect(player.state).toBe('ended')
    await player.replay()
    expect(player.state).toBe('playing')
    expect(drawn.at(-1)).toBe(0)
    expect(restarts).toHaveBeenCalledTimes(2)
    await player.close(); expect(player.state).toBe('idle')
    expect(clock.callbacks.size).toBe(0)
  })
  it('loops infinitely only when normalized loopCount is zero', async () => {
    const { player, clock, sequence, drawn } = setup(0)
    await player.load(sequence); player.play(); clock.advance(20); clock.advance(40)
    await vi.waitFor(() => expect(drawn).toEqual([0, 1, 0]))
    expect(player.completedPlays).toBe(1)
    expect(player.state).toBe('playing')
    await player.dispose()
  })
  it('bounds paused prefetch, evicts consumed frames and clears on close', async () => {
    const { player, clock, sequence, pulls, released } = setup(1, 100)
    await player.load(sequence)
    expect(pulls).toHaveBeenCalledTimes(3)
    expect(player.metrics.cacheBytes).toBe(12)
    player.play(); clock.advance(20)
    await vi.waitFor(() => expect(pulls).toHaveBeenCalledTimes(4))
    expect(player.metrics.cacheBytes).toBeLessThanOrEqual(12)
    player.pause(); clock.advance(1000)
    expect(pulls).toHaveBeenCalledTimes(4)
    await player.close()
    expect(player.metrics.cacheBytes).toBe(0)
    expect(released).toHaveBeenCalledTimes(4)
  })
  it('rejects a budget too small for current plus next and cleans up the sequence', async () => {
    const { sequence } = setup()
    const renderer = { render: vi.fn(), clear: vi.fn(), dispose: vi.fn(), setViewport: vi.fn() }
    const player = new AnimationPlayer(renderer, () => {}, new Clock(), { maxBytes: 4, maxFrames: 2 })
    await player.load(sequence)
    expect(player.state).toBe('error')
    expect(sequence.dispose).toHaveBeenCalledOnce()
  })
})
