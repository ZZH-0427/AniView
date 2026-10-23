import { describe, expect, it, vi } from 'vitest'
import { AnimationPlayer, type PlaybackClock } from './animation-player'
import type { AnimationSequence } from '../media/animation'
import type { DecodedFrame } from '../media/frame'

class Clock implements PlaybackClock {
  time = 0
  id = 0
  callbacks = new Map<number, () => void>()
  now = () => this.time
  request = (callback: () => void) => { this.callbacks.set(++this.id, callback); return this.id }
  cancel = (id: number) => { this.callbacks.delete(id) }
  advance(ms: number) {
    this.time += ms
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach(callback => callback())
  }
}

function setup(count = 200, loopCount = 0, capacity = 6) {
  let streams = 0, pulls = 0, live = 0, peak = 0
  const beforeFrame = vi.fn<(stream: number, index: number) => Promise<void>>(async () => {})
  const onDispose = vi.fn(async () => {})
  const sequence: AnimationSequence = {
    width: 1, height: 1, frameCount: count, loopCount,
    async *frames() {
      const stream = ++streams
      for (let index = 0; index < count; index++) {
        await beforeFrame(stream, index)
        pulls++; live++; peak = Math.max(peak, live)
        let disposed = false
        yield { index, width: 1, height: 1, durationMs: 20, byteLength: 4, image: null,
          dispose() { expect(disposed).toBe(false); disposed = true; live-- },
        }
      }
    },
    dispose: onDispose,
  }
  const drawn: number[] = []
  const renderer = { render: (frame: DecodedFrame) => drawn.push(frame.index), clear: vi.fn(), dispose: vi.fn(), setViewport: vi.fn() }
  const clock = new Clock(), changed = vi.fn()
  const player = new AnimationPlayer(renderer, changed, clock, { maxBytes: capacity * 4, maxFrames: capacity })
  return { player, clock, sequence, drawn, changed, beforeFrame, onDispose,
    get streams() { return streams }, get pulls() { return pulls }, get live() { return live }, get peak() { return peak },
  }
}

async function forward(player: AnimationPlayer, count: number) {
  for (let index = 0; index < count; index++) await player.stepForward()
}

describe('frame stepping on the shared bounded player', () => {
  it.each([0, 1, 2])('pauses a playing animation and clamps first/last boundaries for loopCount %i', async loopCount => {
    const { player, sequence, clock, drawn } = setup(3, loopCount)
    await player.load(sequence)
    expect(player.frameCount).toBe(3)
    expect(player.state).toBe('paused')
    await player.stepBackward()
    expect(drawn).toEqual([0])
    player.play(); clock.advance(5)
    await player.stepForward()
    expect(player.state).toBe('paused')
    expect(clock.callbacks.size).toBe(0)
    expect(drawn).toEqual([0, 1])
    clock.advance(1000)
    expect(drawn).toEqual([0, 1])
    await player.stepForward(); await player.stepForward()
    expect(player.currentFrame).toBe(2)
    expect(player.completedPlays).toBe(0)
    expect(player.state).toBe('paused')
    expect(drawn).toEqual([0, 1, 2])
    await player.dispose()
    expect(player.frameCount).toBeUndefined()
  })

  it('uses cached prior frames without resetting or decoding additional history', async () => {
    const test = setup()
    await test.player.load(test.sequence)
    await forward(test.player, 2)
    const pulls = test.pulls
    await test.player.stepBackward(); await test.player.stepBackward()
    expect(test.drawn).toEqual([0, 1, 2, 1, 0])
    expect(test.streams).toBe(1)
    expect(test.pulls).toBe(pulls)
    expect(test.player.stepMetrics).toEqual({ cacheHits: 4, reconstructions: 0, reconstructedFrames: 0 })
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('rewinds a 200-frame sequence from frame 150 to 20 using a bounded trailing window', async () => {
    const test = setup()
    await test.player.load(test.sequence)
    await forward(test.player, 150)
    expect(test.player.currentFrame).toBe(150)
    await test.player.stepBackward(); await test.player.stepBackward()
    expect(test.streams).toBe(1) // The two retained neighbors are a fast path.
    await test.player.stepBackward()
    expect(test.streams).toBe(2)
    expect(test.player.currentFrame).toBe(147)
    const afterReconstruction = test.player.stepMetrics.reconstructions
    await test.player.stepBackward(); await test.player.stepBackward()
    expect(test.player.stepMetrics.reconstructions).toBe(afterReconstruction)
    for (let index = 145; index > 20; index--) await test.player.stepBackward()
    expect(test.player.currentFrame).toBe(20)
    expect(test.drawn.slice(151)).toEqual(Array.from({ length: 130 }, (_, index) => 149 - index))
    expect(test.player.state).toBe('paused')
    expect(test.player.metrics.peakFrames).toBeLessThanOrEqual(6)
    expect(test.player.metrics.peakBytes).toBeLessThanOrEqual(24)
    expect(test.peak).toBeLessThanOrEqual(6)
    expect(test.player.stepMetrics.reconstructions).toBeGreaterThan(1)
    expect(test.player.stepMetrics.reconstructedFrames).toBeGreaterThan(150)
    // Cursor and cache still support forward movement after repeated reconstruction.
    await forward(test.player, 10)
    expect(test.player.currentFrame).toBe(30)
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('keeps the established large-frame two-slot budget during backward reconstruction', async () => {
    const test = setup(20, 0, 2)
    await test.player.load(test.sequence)
    await forward(test.player, 15)
    await test.player.stepBackward()
    const streams = test.streams
    await test.player.stepBackward()
    expect(test.streams).toBe(streams + 1) // First evicted target reconstructs.
    await test.player.stepBackward()
    expect(test.streams).toBe(streams + 1) // Even two slots retain a previous neighbor.
    for (let index = 12; index > 3; index--) await test.player.stepBackward()
    expect(test.player.currentFrame).toBe(3)
    expect(test.peak).toBe(2)
    expect(test.player.metrics.peakBytes).toBe(8)
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('waits for a missing forward frame without resetting the decoder, remaining paused', async () => {
    const test = setup(10, 0, 3)
    let release: (() => void) | undefined
    test.beforeFrame.mockImplementation(async (_stream, index) => {
      if (index === 3) await new Promise<void>(resolve => { release = resolve })
    })
    await test.player.load(test.sequence)
    await test.player.stepForward(); await test.player.stepForward()
    const stepping = test.player.stepForward()
    expect(test.player.busy).toBe(true)
    expect(test.player.reconstructing).toBe(false)
    await vi.waitFor(() => expect(release).toBeDefined())
    test.player.play() // A loading step cannot silently resume playback.
    release?.(); await stepping
    expect(test.player.currentFrame).toBe(3)
    expect(test.player.state).toBe('paused')
    expect(test.player.busy).toBe(false)
    expect(test.streams).toBe(1)
    await test.player.dispose()
  })

  it('invalidates a reconstruction on close, releases its late frame and cannot paint into the next file', async () => {
    const test = setup()
    let release: (() => void) | undefined
    test.beforeFrame.mockImplementation(async (stream, index) => {
      if (stream === 2 && index === 10) await new Promise<void>(resolve => { release = resolve })
    })
    test.onDispose.mockImplementation(async () => { release?.() })
    await test.player.load(test.sequence)
    await forward(test.player, 150)
    await test.player.stepBackward(); await test.player.stepBackward()
    const stepping = test.player.stepBackward()
    await vi.waitFor(() => expect(release).toBeDefined())
    expect(test.player.busy).toBe(true)
    expect(test.player.reconstructing).toBe(true)
    expect(test.player.currentFrame).toBe(148)
    const drawn = [...test.drawn]
    await test.player.dispose(); await stepping
    expect(test.drawn).toEqual(drawn)
    expect(test.player.busy).toBe(false)
    expect(test.player.reconstructing).toBe(false)
    expect(test.live).toBe(0)
    expect(test.onDispose).toHaveBeenCalledOnce()
    const next = setup(2)
    await test.player.load(next.sequence)
    expect(test.drawn.at(-1)).toBe(0)
    expect(test.player.frameCount).toBe(2)
    await test.player.dispose()
    expect(next.live).toBe(0)
  })

  it('replay supersedes reconstruction and resumes only the fresh first frame', async () => {
    const test = setup()
    let release: (() => void) | undefined
    test.beforeFrame.mockImplementation(async (stream, index) => {
      if (stream === 2 && index === 10) await new Promise<void>(resolve => { release = resolve })
    })
    await test.player.load(test.sequence); await forward(test.player, 150)
    await test.player.stepBackward(); await test.player.stepBackward()
    const stepping = test.player.stepBackward()
    await vi.waitFor(() => expect(release).toBeDefined())
    const beforeReplay = test.drawn.length
    const replay = test.player.replay()
    release?.(); await Promise.all([stepping, replay])
    expect(test.drawn.at(-1)).toBe(0)
    expect(test.drawn.slice(beforeReplay)).toEqual([0])
    expect(test.player.state).toBe('playing')
    expect(test.player.completedPlays).toBe(0)
    expect(test.player.busy).toBe(false)
    test.clock.advance(20)
    expect(test.drawn.at(-1)).toBe(1)
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('leaves the last presentation paused on reconstruction failure and permits Replay recovery', async () => {
    const test = setup()
    const failure = new Error('decode failed')
    test.beforeFrame.mockImplementation(async (stream, index) => { if (stream === 2 && index === 10) throw failure })
    await test.player.load(test.sequence); await forward(test.player, 30)
    await test.player.stepBackward(); await test.player.stepBackward()
    await expect(test.player.stepBackward()).rejects.toBe(failure)
    expect(test.player.currentFrame).toBe(28)
    expect(test.drawn.at(-1)).toBe(28)
    expect(test.player.state).toBe('paused')
    expect(test.player.error).toBe(failure)
    expect(test.player.busy).toBe(false)
    await test.player.replay()
    expect(test.drawn.at(-1)).toBe(0)
    expect(test.player.error).toBeUndefined()
    expect(test.player.state).toBe('playing')
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it.each([0, 2])('preserves normalized automatic looping after stepping (loopCount %i)', async loopCount => {
    const test = setup(2, loopCount)
    await test.player.load(test.sequence)
    await test.player.stepForward(); await test.player.stepBackward()
    await test.player.replay()
    for (let play = 0; play < 2; play++) {
      test.clock.advance(20); test.clock.advance(20)
      if (loopCount === 0 || play === 0) await vi.waitFor(() => expect(test.drawn.at(-1)).toBe(0))
    }
    expect(test.player.completedPlays).toBe(2)
    expect(test.player.state).toBe(loopCount === 0 ? 'playing' : 'ended')
    await test.player.stepBackward()
    expect(test.player.state).toBe('paused')
    await test.player.dispose()
  })
})
