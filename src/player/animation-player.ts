import type { AnimationSequence } from '../media/animation'
import type { Player, PlaybackState } from './player'
import type { Renderer } from '../renderer/renderer'
import { FrameBuffer } from './frame-buffer'
import { countRuntimeEvent } from '../media/runtime-diagnostics'

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
  private hidden = false
  private resumeOnVisible = false
  private deferredPresentation: { index: number; inspecting: boolean; generation: number } | undefined
  private queuedStep: -1 | 1 | undefined
  private activeStep: Promise<void> | undefined
  private closing: Promise<void> | undefined
  private disposal: Promise<void> | undefined
  private loading: Promise<void> | undefined
  private loadRequest = 0
  constructor(private readonly renderer: Renderer, private readonly changed: () => void = () => {},
    private readonly clock: PlaybackClock = browserClock, private readonly budget?: { maxBytes: number; maxFrames: number }) {}
  get frameCount() { return this.sequence?.frameCount }
  get busy() { return this.transitioning || this.stepping }
  get buffering() { return this.state === 'playing' && (this.starving || this.transitioning) }
  get reconstructing() { return this.rebuilding }
  get backgrounded() { return this.hidden }
  get stepMetrics() { return { cacheHits: this.cacheHits, reconstructions: this.reconstructions, reconstructedFrames: this.reconstructedFrames } }
  get metrics() {
    const cache = this.buffer?.cache
    return { cacheBytes: cache?.bytes ?? 0, cachedFrames: cache?.size ?? 0, peakBytes: cache?.peakBytes ?? 0,
      peakFrames: cache?.peakFrames ?? 0, maxBytes: cache?.maxBytes ?? 0, underruns: this.underruns }
  }
  load(sequence: AnimationSequence): Promise<void> {
    const request = ++this.loadRequest
    const previous = this.loading
    const cleanup = this.teardown()
    const operation = this.loadAfterCleanup(sequence, request, Promise.all([previous, cleanup]))
    this.loading = operation
    return operation.finally(() => { if (this.loading === operation) this.loading = undefined })
  }
  private async loadAfterCleanup(sequence: AnimationSequence, request: number, cleanup: Promise<unknown>) {
    try { await cleanup }
    catch (error) { await sequence.dispose(); throw error }
    if (request !== this.loadRequest) { await sequence.dispose(); return }
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
      if (generation === this.generation) { await this.teardown(); this.fail(error) }
    }
  }
  private present(index: number, inspecting = false) {
    const frame = this.buffer?.cache.get(index)
    if (!frame) return false
    if (this.hidden) {
      this.deferredPresentation = { index, inspecting, generation: this.generation }
      return true
    }
    this.renderer.render(frame)
    this.buffer?.retainNear(index, inspecting)
    this.currentFrame = index
    this.remaining = Math.max(10, frame.durationMs) // Avoid zero-duration busy loops; source timing is preserved.
    void this.buffer?.fill()
    return true
  }
  play() {
    if (this.state !== 'paused' || this.busy) return
    if (this.hidden) { this.resumeOnVisible = true; return }
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
    this.resumeOnVisible = false
    if (this.state !== 'playing') return
    this.remaining = Math.max(0, this.due - this.clock.now())
    this.state = 'paused'
    this.cancel()
    this.changed()
  }
  /** Visibility is external UI state; retain it across load's resource reset. */
  setBackgrounded(hidden: boolean) {
    if (hidden === this.hidden) return
    this.hidden = hidden
    if (hidden) {
      this.resumeOnVisible = this.state === 'playing'
      if (this.state === 'playing') {
        this.remaining = Math.max(0, this.due - this.clock.now())
        this.state = 'paused'
      }
      this.cancel()
    } else {
      const deferred = this.deferredPresentation
      this.deferredPresentation = undefined
      try {
        if (deferred?.generation === this.generation) this.present(deferred.index, deferred.inspecting)
      } catch (error) { this.fail(error); return }
      this.resumeVisibleIntent()
    }
    this.changed()
  }
  private resumeVisibleIntent() {
    if (!this.hidden && this.resumeOnVisible && !this.busy && this.state === 'paused') {
      this.resumeOnVisible = false
      this.play()
    }
  }
  stepForward() { return this.requestStep(1) }
  stepBackward() { return this.requestStep(-1) }
  private requestStep(direction: -1 | 1): Promise<void> {
    if (this.stepping) {
      // One pending latest intent, relative to the last presented frame. Never
      // spawn a parallel iterator/reset or show an obsolete rewind afterward.
      this.queuedStep = direction
      return this.activeStep ?? Promise.resolve()
    }
    const operation = this.step(direction)
    this.activeStep = operation
    return operation.finally(() => { if (this.activeStep === operation) this.activeStep = undefined })
  }
  private async step(direction: -1 | 1) {
    const buffer = this.buffer
    if (!buffer || this.busy || !['paused', 'playing', 'ended'].includes(this.state)) return
    this.pause()
    this.state = 'paused'
    let target = this.stepTarget(direction)
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
    try {
      for (;;) {
        this.rebuilding = buffer.needsReconstruction(target)
        const rebuilding = this.rebuilding
        const decoded = buffer.decodedFrames
        if (rebuilding) this.reconstructions++
        this.changed()
        const ready = await buffer.prepare(target)
        if (generation !== this.generation) return
        if (rebuilding) this.reconstructedFrames += buffer.decodedFrames - decoded
        if (this.queuedStep !== undefined) {
          target = this.stepTarget(this.queuedStep)
          this.queuedStep = undefined
          continue
        }
        if (ready) this.present(target, true)
        return
      }
    } catch (error) {
      if (generation === this.generation) { this.error = error; throw error }
    } finally {
      if (generation === this.generation) {
        this.stepping = false
        this.rebuilding = false
        this.queuedStep = undefined
        this.changed()
      }
    }
  }
  private stepTarget(direction: -1 | 1) {
    return Math.max(0, Math.min(this.currentFrame + direction, (this.frameCount ?? Infinity) - 1))
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
    this.queuedStep = undefined
    this.deferredPresentation = undefined
    this.changed()
    try {
      await this.buffer?.restart()
      if (generation !== this.generation) return
      if (this.buffer?.error) throw this.buffer.error
      if (!this.present(0)) throw new Error('Empty animation')
      this.due = this.clock.now() + this.remaining
      this.changed()
    } catch (error) { if (generation === this.generation) this.fail(error) }
    finally { if (generation === this.generation) { this.transitioning = false; this.resumeVisibleIntent(); this.changed(); this.schedule() } }
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
  async replay() {
    const buffer = this.buffer
    await this.reset()
    if (buffer === this.buffer) this.play()
  }
  private fail(error: unknown) {
    this.generation++
    this.cancel(); this.error = error; this.state = 'error'
    this.transitioning = this.stepping = this.rebuilding = false
    this.queuedStep = this.deferredPresentation = undefined
    this.resumeOnVisible = false
    const buffer = this.buffer
    this.buffer = undefined
    this.sequence = undefined
    this.closing = buffer?.close().catch(() => countRuntimeEvent('cleanupErrors'))
    this.changed()
  }
  dispose(): Promise<void> {
    this.loadRequest++
    return Promise.all([this.teardown(), this.loading]).then(() => {})
  }
  private teardown(): Promise<void> {
    if (this.disposal) return this.disposal
    const operation = this.disposeResources()
    this.disposal = operation
    return operation.finally(() => { if (this.disposal === operation) this.disposal = undefined })
  }
  private async disposeResources() {
    this.generation++
    this.cancel()
    const buffer = this.buffer
    const sequence = this.sequence
    const closing = this.closing
    this.closing = undefined
    this.buffer = undefined
    this.sequence = undefined
    this.state = 'idle'
    this.transitioning = false
    this.stepping = this.rebuilding = false
    this.queuedStep = this.deferredPresentation = undefined
    this.resumeOnVisible = false
    this.starving = false
    this.currentFrame = 0
    this.completedPlays = 0
    this.underruns = 0
    this.cacheHits = this.reconstructions = this.reconstructedFrames = 0
    this.error = undefined
    try { this.renderer.clear() }
    finally { await Promise.all([buffer ? buffer.close() : sequence?.dispose(), closing]) }
  }
  close() { return this.dispose() }
}
