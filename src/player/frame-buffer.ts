import type { AnimationSequence } from '../media/animation'
import type { DecodedFrame } from '../media/frame'
import { MediaError } from '../media/errors'
import { decodedFrameBytes, frameCacheBudget } from '../media/frame-budget'
import { ByteBudgetFrameCache } from './frame-cache'

/** Pull producer, independent from the presentation clock. Reserves space before decoding. */
export class FrameBuffer {
  readonly cache: ByteBudgetFrameCache
  ended = false
  error: unknown
  private iterator: AsyncIterator<DecodedFrame> | undefined
  private task: Promise<void> | undefined
  private generation = 0
  private closed = false
  private readonly frameBytes: number
  private nextIndex = 0
  private decodedCount = 0
  /** Historical neighbors share the existing budget; tiny caches prioritize forward playback. */
  private readonly historyFrames: number
  private readonly inspectionHistoryFrames: number
  constructor(private readonly sequence: AnimationSequence, maxBytes?: number, maxFrames?: number) {
    this.frameBytes = decodedFrameBytes(sequence.width, sequence.height)
    this.cache = new ByteBudgetFrameCache(frameCacheBudget(this.frameBytes, maxBytes), maxFrames)
    const capacity = Math.min(this.cache.maxFrames, Math.floor(this.cache.maxBytes / this.frameBytes))
    this.historyFrames = Math.min(2, Math.max(0, capacity - 3))
    this.inspectionHistoryFrames = Math.min(2, capacity - 1)
  }
  needsReconstruction(index: number) { return !this.cache.get(index) && index < this.nextIndex }
  get decodedFrames() { return this.decodedCount }
  retainNear(index: number, inspecting = false) {
    this.cache.evictBefore(index - (inspecting ? this.inspectionHistoryFrames : this.historyFrames))
  }
  async restart() {
    const generation = ++this.generation
    await this.task
    if (this.closed || generation !== this.generation) return
    await this.iterator?.return?.()
    this.cache.clear()
    this.ended = false
    this.error = undefined
    this.nextIndex = 0
    this.iterator = this.sequence.frames()[Symbol.asyncIterator]()
    await this.fill()
  }
  fill(): Promise<void> {
    if (this.closed || this.ended || this.error || !this.cache.canFit(this.frameBytes)) return Promise.resolve()
    if (this.task) return this.task
    const generation = this.generation
    this.task = (async () => {
      while (!this.closed && generation === this.generation && !this.ended && !this.error && this.cache.canFit(this.frameBytes)) {
        const result = await this.iterator?.next()
        if (!result) return
        if (this.closed || generation !== this.generation) { result.value?.dispose(); return }
        if (result.done) { this.ended = true; return }
        this.insert(result.value)
      }
    })().catch((error: unknown) => { if (!this.closed && generation === this.generation) this.error = error })
      .finally(() => { this.task = undefined })
    return this.task
  }
  /**
   * Cache misses reuse the incremental cursor when ahead, or start a fresh decoder
   * stream when behind. Only a bounded trailing window survives reconstruction.
   * The renderer owns its current pixels, so discarded frames are safe to release.
   */
  async prepare(index: number): Promise<boolean> {
    if (this.closed) return false
    if (this.cache.get(index)) return true
    const generation = this.generation
    await this.task
    if (this.closed || generation !== this.generation) return false
    if (this.cache.get(index)) return true
    if (this.error) throw this.error
    this.task = (async () => {
      if (index < this.nextIndex) {
        await this.iterator?.return?.()
        if (this.closed || generation !== this.generation) return
        this.cache.clear()
        this.ended = false
        this.nextIndex = 0
        this.iterator = this.sequence.frames()[Symbol.asyncIterator]()
      }
      while (!this.closed && generation === this.generation && !this.ended && !this.cache.get(index)) {
        // Reserve before pulling, including during a long rewind. No decoded history array.
        while (!this.cache.canFit(this.frameBytes)) this.cache.evict(this.cache.oldestIndex)
        const result = await this.iterator?.next()
        if (!result) return
        if (this.closed || generation !== this.generation) { result.value?.dispose(); return }
        if (result.done) { this.ended = true; return }
        this.insert(result.value)
      }
    })().catch((error: unknown) => { if (!this.closed && generation === this.generation) this.error = error })
      .finally(() => { this.task = undefined })
    await this.task
    if (this.closed || generation !== this.generation) return false
    if (this.error) throw this.error
    return !!this.cache.get(index)
  }
  private insert(frame: DecodedFrame) {
    if (!this.cache.insert(frame)) { frame.dispose(); throw new MediaError('RESOURCE_LIMIT_EXCEEDED') }
    this.nextIndex = frame.index + 1
    this.decodedCount++
  }
  async close() {
    if (this.closed) return
    this.closed = true
    this.generation++
    this.cache.clear()
    await this.sequence.dispose() // Cancels any in-flight request before waiting on its iterator.
    await this.task
    await this.iterator?.return?.()
    this.iterator = undefined
  }
}
