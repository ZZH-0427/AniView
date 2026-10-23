import { describe, expect, it, vi } from 'vitest'
import { AnimationPlayer, type PlaybackClock } from './animation-player'
import type { AnimationSequence } from '../media/animation'
import type { DecodedFrame } from '../media/frame'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'

class Clock implements PlaybackClock {
  time = 0
  requested = 0
  peakScheduled = 0
  callbacks = new Map<number, () => void>()
  now = () => this.time
  request = (callback: () => void) => {
    this.callbacks.set(++this.requested, callback)
    this.peakScheduled = Math.max(this.peakScheduled, this.callbacks.size)
    return this.requested
  }
  cancel = (id: number) => { this.callbacks.delete(id) }
  advance(ms: number) {
    this.time += ms
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach(callback => callback())
  }
}

function setup(count = 1000, duration: (index: number) => number = () => 20, loopCount = 0) {
  let streams = 0, pulls = 0, live = 0, peak = 0
  const beforeFrame = vi.fn<(stream: number, index: number) => Promise<void>>(async () => {})
  const dispose = vi.fn(async () => {})
  const sequence: AnimationSequence = {
    width: 1, height: 1, frameCount: count, loopCount,
    async *frames() {
      const stream = ++streams
      for (let index = 0; index < count; index++) {
        await beforeFrame(stream, index)
        pulls++; live++; peak = Math.max(peak, live)
        let released = false
        yield { index, width: 1, height: 1, byteLength: 4, durationMs: duration(index), image: null,
          dispose() { if (released) throw new Error('Double release'); released = true; live-- },
        }
      }
    }, dispose,
  }
  const drawn: number[] = [], clock = new Clock()
  const renderer = { render: vi.fn((frame: DecodedFrame) => { drawn.push(frame.index) }), clear: vi.fn(), dispose: vi.fn(), setViewport: vi.fn() }
  const player = new AnimationPlayer(renderer, () => {}, clock, { maxFrames: 6, maxBytes: 24 })
  return { player, sequence, clock, drawn, renderer, beforeFrame, dispose,
    get live() { return live }, get peak() { return peak }, get streams() { return streams }, get pulls() { return pulls },
  }
}
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }
const forward = async (player: AnimationPlayer, count: number) => { for (let index = 0; index < count; index++) await player.stepForward() }
function gateReconstruction(test: ReturnType<typeof setup>, at = 10) {
  let release: (() => void) | undefined
  test.beforeFrame.mockImplementation(async (stream, index) => {
    if (stream === 2 && index === at) await new Promise<void>(resolve => { release = resolve })
  })
  test.dispose.mockImplementation(async () => { release?.() })
  return { get waiting() { return !!release }, release: () => release?.() }
}

describe('page visibility and playback intent', () => {
  it('suspends scheduling and resumes the remaining duration without replaying 60 seconds of hidden time', async () => {
    const test = setup()
    await test.player.load(test.sequence)
    test.player.play(); test.clock.advance(15)
    test.player.setBackgrounded(true)
    expect(test.player.backgrounded).toBe(true)
    expect(test.player.state).toBe('paused')
    expect(test.clock.callbacks.size).toBe(0)
    test.clock.advance(60_000)
    expect(test.drawn).toEqual([0])
    test.player.setBackgrounded(false)
    expect(test.player.state).toBe('playing')
    test.clock.advance(4); expect(test.drawn).toEqual([0])
    test.clock.advance(1); expect(test.drawn).toEqual([0, 1])
    test.clock.advance(0); expect(test.drawn).toEqual([0, 1])
    expect(test.clock.peakScheduled).toBe(1)
    await test.player.dispose()
  })

  it('keeps originally paused media paused and respects explicit Pause/Play intent while hidden', async () => {
    const test = setup()
    await test.player.load(test.sequence)
    test.player.setBackgrounded(true); test.clock.advance(60_000); test.player.setBackgrounded(false)
    expect(test.player.state).toBe('paused')
    test.player.play(); test.player.setBackgrounded(true)
    test.player.pause() // Explicit pause overrides the remembered automatic resume.
    test.player.setBackgrounded(false)
    expect(test.player.state).toBe('paused')
    test.player.setBackgrounded(true); test.player.play()
    expect(test.player.state).toBe('paused')
    expect(test.clock.callbacks.size).toBe(0)
    test.player.setBackgrounded(false)
    expect(test.player.state).toBe('playing')
    await test.player.dispose()
    test.player.setBackgrounded(true); test.player.setBackgrounded(false)
    expect(test.player.state).toBe('idle')
    expect(test.clock.callbacks.size).toBe(0)
  })

  it('preserves hidden state across load and delays initial/Replay presentation until foreground', async () => {
    const test = setup()
    test.player.setBackgrounded(true)
    await test.player.load(test.sequence)
    expect(test.player.backgrounded).toBe(true)
    expect(test.drawn).toEqual([])
    expect(test.player.state).toBe('paused')
    await test.player.replay()
    expect(test.drawn).toEqual([])
    expect(test.clock.callbacks.size).toBe(0)
    test.player.setBackgrounded(false)
    expect(test.drawn).toEqual([0])
    expect(test.player.state).toBe('playing')
    test.clock.advance(19); expect(test.drawn).toEqual([0])
    test.clock.advance(1); expect(test.drawn).toEqual([0, 1])
    await test.player.dispose()
  })

  it.each([false, true])('delays a completed hidden reconstruction, with close=%s invalidating its pending presentation', async close => {
    const test = setup(), gate = gateReconstruction(test)
    await test.player.load(test.sequence); await forward(test.player, 820)
    await test.player.stepBackward(); await test.player.stepBackward()
    const before = [...test.drawn], stepping = test.player.stepBackward()
    await vi.waitFor(() => expect(gate.waiting).toBe(true))
    test.player.setBackgrounded(true)
    gate.release(); await stepping
    expect(test.player.currentFrame).toBe(818)
    expect(test.drawn).toEqual(before)
    expect(test.player.busy).toBe(false)
    if (close) await test.player.dispose()
    test.player.setBackgrounded(false)
    expect(test.drawn).toEqual(close ? before : [...before, 817])
    expect(test.player.state).toBe(close ? 'idle' : 'paused')
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('restores prior playing intent when a loop reset finishes after foregrounding', async () => {
    const test = setup(2), gate = gateReconstruction(test, 0)
    await test.player.load(test.sequence)
    test.player.play(); test.clock.advance(20); test.clock.advance(20)
    await vi.waitFor(() => expect(gate.waiting).toBe(true))
    test.player.setBackgrounded(true)
    test.clock.advance(60_000)
    test.player.setBackgrounded(false)
    expect(test.player.state).toBe('paused')
    gate.release()
    await vi.waitFor(() => expect(test.player.state).toBe('playing'))
    expect(test.drawn).toEqual([0, 1, 0])
    test.clock.advance(19); expect(test.drawn).toEqual([0, 1, 0])
    test.clock.advance(1); expect(test.drawn).toEqual([0, 1, 0, 1])
    await test.player.dispose()
  })

  it('keeps the final visible frame until a loop reset completed in the background can be committed', async () => {
    const test = setup(2), gate = gateReconstruction(test, 0)
    await test.player.load(test.sequence)
    test.player.play(); test.clock.advance(20); test.clock.advance(20)
    await vi.waitFor(() => expect(gate.waiting).toBe(true))
    test.player.setBackgrounded(true)
    gate.release()
    await vi.waitFor(() => expect(test.player.busy).toBe(false))
    expect(test.player.currentFrame).toBe(1)
    expect(test.drawn).toEqual([0, 1])
    expect(test.clock.callbacks.size).toBe(0)
    test.player.setBackgrounded(false)
    expect(test.drawn).toEqual([0, 1, 0])
    expect(test.player.state).toBe('playing')
    await test.player.dispose()
  })
})

describe('long streams, timing and bounded concurrent operations', () => {
  it('reconstructs from frame 820 back to 20 in a 1000-frame sequence without retaining history', async () => {
    const test = setup()
    await test.player.load(test.sequence)
    expect(test.pulls).toBe(6)
    await forward(test.player, 820)
    for (let index = 820; index > 20; index--) await test.player.stepBackward()
    expect(test.player.currentFrame).toBe(20)
    expect(test.player.stepMetrics.reconstructions).toBeGreaterThan(200)
    expect(test.peak).toBe(6)
    expect(test.player.metrics.peakFrames).toBe(6)
    expect(test.player.metrics.peakBytes).toBe(24)
    await test.player.replay()
    expect(test.player.currentFrame).toBe(0)
    expect(test.player.state).toBe('playing')
    await test.player.dispose()
    expect(test.live).toBe(0)
  }, 15_000)

  it('runs a 30-minute logical variable-duration timeline, preserving pause remainder and finite end', async () => {
    const duration = (index: number) => (index % 3 + 1) * 1000
    const test = setup(900, duration, 1)
    await test.player.load(test.sequence); test.player.play()
    for (let index = 0; index < 900; index++) {
      if (index === 400) {
        test.clock.advance(17); test.player.pause(); test.clock.advance(60_000)
        expect(test.player.currentFrame).toBe(index)
        test.player.resume(); test.clock.advance(duration(index) - 17)
      } else test.clock.advance(duration(index))
      await flush()
      expect(test.player.currentFrame).toBe(Math.min(index + 1, 899))
    }
    expect(test.clock.time).toBe(1_860_000)
    expect(test.drawn).toEqual(Array.from({ length: 900 }, (_, index) => index))
    expect(test.player.completedPlays).toBe(1)
    expect(test.player.state).toBe('ended')
    expect(test.clock.callbacks.size).toBe(0)
    expect(test.clock.peakScheduled).toBe(1)
    expect(test.player.underruns).toBe(0)
    expect(test.peak).toBeLessThanOrEqual(6)
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('applies the shared duration floor without timer storms or late-callback catch-up bursts', async () => {
    const test = setup(1000, index => index % 3 === 0 ? 0 : index % 3 === 1 ? 1 : 10)
    await test.player.load(test.sequence); test.player.play()
    test.clock.advance(9); expect(test.player.currentFrame).toBe(0)
    test.clock.advance(1); expect(test.player.currentFrame).toBe(1)
    test.clock.advance(9); expect(test.player.currentFrame).toBe(1)
    test.clock.advance(1); expect(test.player.currentFrame).toBe(2)
    test.clock.advance(1_800_000)
    expect(test.player.currentFrame).toBe(3)
    await flush()
    test.clock.advance(0); expect(test.player.currentFrame).toBe(3)
    test.clock.advance(10); expect(test.player.currentFrame).toBe(4)
    expect(test.clock.peakScheduled).toBe(1)
    expect(test.clock.requested).toBeLessThanOrEqual(8)
    await test.player.dispose()
  })

  it.each([-1, 1] as const)('coalesces 20 pending steps to the latest direction %s without stale presentation', async direction => {
    const test = setup(), gate = gateReconstruction(test)
    await test.player.load(test.sequence); await forward(test.player, 820)
    await test.player.stepBackward(); await test.player.stepBackward()
    const before = test.drawn.length, first = test.player.stepBackward()
    await vi.waitFor(() => expect(gate.waiting).toBe(true))
    const pending = Array.from({ length: 20 }, () => direction === 1 ? test.player.stepForward() : test.player.stepBackward())
    gate.release(); await Promise.all([first, ...pending])
    expect(test.drawn.slice(before)).toEqual([818 + direction])
    expect(test.player.currentFrame).toBe(818 + direction)
    expect(test.streams).toBe(2)
    expect(test.player.state).toBe('paused')
    expect(test.peak).toBeLessThanOrEqual(6)
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('makes Replay authoritative over a pending rewind and a queued opposite step', async () => {
    const test = setup(), gate = gateReconstruction(test)
    await test.player.load(test.sequence); await forward(test.player, 820)
    await test.player.stepBackward(); await test.player.stepBackward()
    const before = test.drawn.length, first = test.player.stepBackward()
    await vi.waitFor(() => expect(gate.waiting).toBe(true))
    const opposite = test.player.stepForward(), replay = test.player.replay()
    gate.release(); await Promise.all([first, opposite, replay])
    expect(test.drawn.slice(before)).toEqual([0])
    expect(test.player.state).toBe('playing')
    expect(test.player.completedPlays).toBe(0)
    await test.player.dispose()
    expect(test.live).toBe(0)
  })

  it('joins failed-player cleanup before a later dispose completes', async () => {
    const test = setup()
    let release: (() => void) | undefined
    test.dispose.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
    await test.player.load(test.sequence)
    test.renderer.render.mockImplementation(() => { throw new Error('Rendering failed') })
    test.player.play(); test.clock.advance(20)
    expect(test.player.state).toBe('error')
    let closed = false
    const closing = test.player.dispose().then(() => { closed = true })
    await flush(); expect(closed).toBe(false)
    release?.(); await closing
    expect(test.dispose).toHaveBeenCalledOnce()
    expect(test.live).toBe(0)
  })

  it('records a failed asynchronous cleanup as a local numeric category while preserving the original failure', async () => {
    const test = setup()
    const before = runtimeDiagnostics.getSnapshot().cleanupErrors
    const failure = new Error('Rendering failed')
    await test.player.load(test.sequence)
    test.renderer.render.mockImplementation(() => { throw failure })
    test.dispose.mockRejectedValueOnce(new Error('Private decoder cleanup detail'))
    test.player.play(); test.clock.advance(20)
    expect(test.player.state).toBe('error')
    expect(test.player.error).toBe(failure)
    await test.player.dispose()
    expect(runtimeDiagnostics.getSnapshot().cleanupErrors).toBe(before + 1)
    expect(Object.values(runtimeDiagnostics.getSnapshot()).every(value => typeof value === 'number')).toBe(true)
    expect(test.dispose).toHaveBeenCalledOnce()
    expect(test.live).toBe(0)
  })

  it('repeated Close joins the same pending teardown, including a late decoder frame', async () => {
    const test = setup(), gate = gateReconstruction(test)
    const cleanupErrors = runtimeDiagnostics.getSnapshot().cleanupErrors
    await test.player.load(test.sequence); await forward(test.player, 820)
    await test.player.stepBackward(); await test.player.stepBackward()
    const stepping = test.player.stepBackward()
    await vi.waitFor(() => expect(gate.waiting).toBe(true))
    let finishDispose: (() => void) | undefined
    test.dispose.mockImplementation(async () => {
      await new Promise<void>(resolve => { finishDispose = resolve })
      gate.release()
    })
    const before = [...test.drawn]
    let secondFinished = false
    const first = test.player.close(), second = test.player.close().then(() => { secondFinished = true })
    await flush(); expect(secondFinished).toBe(false)
    finishDispose?.(); await Promise.all([first, second, stepping])
    expect(test.drawn).toEqual(before)
    expect(test.live).toBe(0)
    expect(test.dispose).toHaveBeenCalledOnce()
    expect(runtimeDiagnostics.getSnapshot().cleanupErrors).toBe(cleanupErrors)
  })

  it('releases sequence/frame resources even if renderer.clear throws during Close', async () => {
    const test = setup()
    await test.player.load(test.sequence)
    test.renderer.clear.mockImplementation(() => { throw new Error('Lost Canvas') })
    await expect(test.player.dispose()).rejects.toThrow('Lost Canvas')
    expect(test.dispose).toHaveBeenCalledOnce()
    expect(test.live).toBe(0)
    expect(test.clock.callbacks.size).toBe(0)
  })

  it('serializes overlapping load ownership, disposing late frames from the superseded first load', async () => {
    const test = setup(), next = setup(2)
    let release: (() => void) | undefined
    test.beforeFrame.mockImplementation(async (_stream, index) => {
      if (index === 0) await new Promise<void>(resolve => { release = resolve })
    })
    test.dispose.mockImplementation(async () => { release?.() })
    const first = test.player.load(test.sequence)
    await vi.waitFor(() => expect(release).toBeDefined())
    const second = test.player.load(next.sequence)
    await Promise.all([first, second])
    expect(test.drawn).toEqual([0])
    expect(test.player.frameCount).toBe(2)
    expect(test.player.state).toBe('paused')
    expect(test.dispose).toHaveBeenCalledOnce()
    expect(test.live).toBe(0)
    await test.player.dispose()
    expect(next.live).toBe(0)
  })

  it('Close waits for an incoming sequence cancelled before load takes ownership', async () => {
    const test = setup()
    let release: (() => void) | undefined
    test.dispose.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
    const loading = test.player.load(test.sequence)
    let finished = false
    const closing = test.player.dispose().then(() => { finished = true })
    await vi.waitFor(() => expect(release).toBeDefined())
    expect(finished).toBe(false)
    expect(test.drawn).toEqual([])
    release?.(); await Promise.all([loading, closing])
    expect(test.dispose).toHaveBeenCalledOnce()
    expect(test.player.state).toBe('idle')
    expect(test.live).toBe(0)
  })

  it('a burst of 100 loads only decodes the final sequence and releases all replaced inputs', async () => {
    const test = setup(), inputs = Array.from({ length: 100 }, (_, index) => setup(index + 2))
    await Promise.all(inputs.map(input => test.player.load(input.sequence)))
    expect(test.drawn).toEqual([0])
    expect(test.player.frameCount).toBe(101)
    expect(inputs.slice(0, -1).every(input => input.pulls === 0 && input.dispose.mock.calls.length === 1)).toBe(true)
    expect(inputs.at(-1)?.pulls).toBe(6)
    await test.player.dispose()
    expect(inputs.every(input => input.live === 0 && input.dispose.mock.calls.length === 1)).toBe(true)
  })
})
