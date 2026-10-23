import type { AnimationSequence } from '../media/animation'
import type { DecodedFrame } from '../media/frame'
import { MediaError } from '../media/errors'
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
  constructor(private readonly sequence: AnimationSequence, maxBytes?: number, maxFrames?: number) {
    this.cache = new ByteBudgetFrameCache(maxBytes, maxFrames)
    this.frameBytes = sequence.width * sequence.height * 4
    if (this.frameBytes * 2 > this.cache.maxBytes) throw new MediaError('OUT_OF_MEMORY')
  }
  async restart() {
    const generation = ++this.generation
    await this.task
    if (this.closed || generation !== this.generation) return
    await this.iterator?.return?.()
    this.cache.clear()
    this.ended = false
    this.error = undefined
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
        if (!this.cache.insert(result.value)) { result.value.dispose(); throw new MediaError('OUT_OF_MEMORY') }
      }
    })().catch((error: unknown) => { if (!this.closed && generation === this.generation) this.error = error })
      .finally(() => { this.task = undefined })
    return this.task
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
