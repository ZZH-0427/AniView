import type { AnimationSequence } from '../media/animation'
import type { Player, PlaybackState } from './player'
import type { Renderer } from '../renderer/renderer'
import { FrameBuffer } from './frame-buffer'

export interface PlaybackClock {
  now(): number
  request(callback: () => void): number
  cancel(id: number): void
}
const browserClock: PlaybackClock = {
  now: () => performance.now(), request: (callback) => requestAnimationFrame(callback), cancel: (id) => cancelAnimationFrame(id),
}

export class AnimationPlayer implements Player {
  state: PlaybackState = 'idle'
  currentFrame = 0
  completedPlays = 0
  underruns = 0
  error: unknown
  private buffer: FrameBuffer | undefined
  private sequence: AnimationSequence | undefined
  private generation = 0
  private scheduled: number | undefined
  private due = 0
  private remaining = 0
  private starving = false
  private transitioning = false
  private stepping = false
  private rebuilding = false
  private cacheHits = 0
  private reconstructions = 0
  private reconstructedFrames = 0
  constructor(private readonly renderer: Renderer, private readonly changed: () => void = () => {},
    private readonly clock: PlaybackClock = browserClock, private readonly budget?: { maxBytes: number; maxFrames: number }) {}
  get frameCount() { return this.sequence?.frameCount }
  get busy() { return this.transitioning || this.stepping }
  get buffering() { return this.state === 'playing' && (this.starving || this.transitioning) }
  get reconstructing() { return this.rebuilding }
  get stepMetrics() { return { cacheHits: this.cacheHits, reconstructions: this.reconstructions, reconstructedFrames: this.reconstructedFrames } }
  get metrics() {
    const cache = this.buffer?.cache
    return { cacheBytes: cache?.bytes ?? 0, cachedFrames: cache?.size ?? 0, peakBytes: cache?.peakBytes ?? 0,
      peakFrames: cache?.peakFrames ?? 0, maxBytes: cache?.maxBytes ?? 0, underruns: this.underruns }
  }
  async load(sequence: AnimationSequence) {
    await this.dispose()
    const generation = ++this.generation
    this.sequence = sequence
    try {
      this.buffer = new FrameBuffer(sequence, this.budget?.maxBytes, this.budget?.maxFrames)
      await this.buffer.restart()
      if (generation !== this.generation) return
      if (this.buffer.error) throw this.buffer.error
      if (!this.present(0)) throw new Error('No decoded frame')
      this.state = 'paused'
      this.changed()
    } catch (error) {
      if (generation === this.generation) { await this.dispose(); this.fail(error) }
    }
  }
  private present(index: number, inspecting = false) {
    const frame = this.buffer?.cache.get(index)
    if (!frame) return false
    this.renderer.render(frame)
    this.buffer?.retainNear(index, inspecting)
    this.currentFrame = index
    this.remaining = Math.max(10, frame.durationMs) // Avoid zero-duration busy loops; source timing is preserved.
    void this.buffer?.fill()
    return true
  }
  play() {
    if (this.state !== 'paused' || this.busy) return
    // Inspection may favor a previous neighbor in a two-frame cache. Resume
    // restores forward-prefetch capacity without increasing either cache limit.
    this.buffer?.retainNear(this.currentFrame)
    void this.buffer?.fill()
    this.state = 'playing'
    this.due = this.clock.now() + this.remaining
    this.schedule()
    this.changed()
  }
  resume() { this.play() }
  pause() {
    if (this.state !== 'playing') return
    this.remaining = Math.max(0, this.due - this.clock.now())
    this.state = 'paused'
    this.cancel()
    this.changed()
  }
  stepForward() { return this.step(1) }
  stepBackward() { return this.step(-1) }
  private async step(direction: -1 | 1) {
    const buffer = this.buffer
    if (!buffer || this.busy || !['paused', 'playing', 'ended'].includes(this.state)) return
    this.pause()
    this.state = 'paused'
    const target = Math.max(0, Math.min(this.currentFrame + direction, (this.frameCount ?? Infinity) - 1))
    if (target === this.currentFrame) { this.changed(); return }
    this.error = undefined
    if (buffer.cache.get(target)) {
      this.cacheHits++
      this.present(target, true)
      this.changed()
      return
    }
    const generation = ++this.generation
    this.stepping = true
    this.rebuilding = buffer.needsReconstruction(target)
    const rebuilding = this.rebuilding
    const decoded = buffer.decodedFrames
    if (rebuilding) this.reconstructions++
    this.changed()
    try {
      const ready = await buffer.prepare(target)
      if (generation !== this.generation) return
      if (ready) this.present(target, true)
    } catch (error) {
      if (generation === this.generation) { this.error = error; throw error }
    } finally {
      if (generation === this.generation) {
        if (rebuilding) this.reconstructedFrames += buffer.decodedFrames - decoded
        this.stepping = false
        this.rebuilding = false
        this.changed()
      }
    }
  }
  private schedule() { if (this.state === 'playing' && this.scheduled === undefined) this.scheduled = this.clock.request(() => { try { this.tick() } catch (error) { this.fail(error) } }) }
  private cancel() { if (this.scheduled !== undefined) this.clock.cancel(this.scheduled); this.scheduled = undefined }
  private tick() {
    this.scheduled = undefined
    if (this.state !== 'playing' || this.transitioning) return
    if (this.buffer?.error) { this.fail(this.buffer.error); return }
    const now = this.clock.now()
    if (now >= this.due) {
      const next = this.currentFrame + 1
      if (this.present(next)) {
        this.due = this.starving || now - this.due > 250 ? now + this.remaining : this.due + this.remaining
        this.starving = false
        this.changed()
      } else if (this.buffer?.ended) {
        this.completedPlays++
        const loops = this.sequence?.loopCount ?? 1
        if (loops !== 0 && this.completedPlays >= loops) { this.state = 'ended'; this.changed(); return }
        void this.restartLoop()
        return
      } else {
        if (!this.starving) { this.underruns++; this.starving = true; this.changed() }
        void this.buffer?.fill()
      }
    }
    this.schedule()
  }
  private async restartLoop() {
    const generation = ++this.generation
    this.cancel()
    this.transitioning = true
    this.stepping = this.rebuilding = false
    this.changed()
    try {
      await this.buffer?.restart()
      if (generation !== this.generation) return
      if (this.buffer?.error) throw this.buffer.error
      this.currentFrame = 0 // Old frame indices must not evict entries from the newly seeded stream.
      if (!this.present(0)) throw new Error('Empty animation')
      this.due = this.clock.now() + this.remaining
      this.changed()
    } catch (error) { if (generation === this.generation) this.fail(error) }
    finally { if (generation === this.generation) { this.transitioning = false; this.changed(); this.schedule() } }
  }
  async reset() {
    if (!this.buffer) return
    this.pause()
    this.cancel()
    this.state = 'paused'
    this.error = undefined
    this.completedPlays = 0
    await this.restartLoop()
  }
  async replay() { await this.reset(); this.play() }
  private fail(error: unknown) {
    this.cancel(); this.error = error; this.state = 'error'
    const buffer = this.buffer
    this.buffer = undefined
    this.sequence = undefined
    void buffer?.close().catch(() => {})
    this.changed()
  }
  async dispose() {
    this.generation++
    this.cancel()
    const buffer = this.buffer
    const sequence = this.sequence
    this.buffer = undefined
    this.sequence = undefined
    this.state = 'idle'
    this.transitioning = false
    this.stepping = this.rebuilding = false
    this.starving = false
    this.currentFrame = 0
    this.completedPlays = 0
    this.underruns = 0
    this.cacheHits = this.reconstructions = this.reconstructedFrames = 0
    this.error = undefined
    this.renderer.clear()
    if (buffer) await buffer.close()
    else await sequence?.dispose()
  }
  close() { return this.dispose() }
}
