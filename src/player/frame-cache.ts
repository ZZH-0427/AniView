import type { DecodedFrame } from '../media/frame'
import { DEFAULT_FRAME_CACHE_BYTES } from '../media/frame-budget'

export class ByteBudgetFrameCache {
  private readonly frames = new Map<number, DecodedFrame>()
  bytes = 0
  peakBytes = 0
  peakFrames = 0
  constructor(readonly maxBytes = DEFAULT_FRAME_CACHE_BYTES, readonly maxFrames = 6) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(maxFrames) || maxFrames < 2) throw new Error('Invalid cache budget')
  }
  get size() { return this.frames.size }
  get(index: number) { return this.frames.get(index) }
  get oldestIndex() {
    let oldest = Infinity
    for (const index of this.frames.keys()) oldest = Math.min(oldest, index)
    return oldest
  }
  canFit(bytes: number) { return this.bytes + bytes <= this.maxBytes && this.size < this.maxFrames }
  /** Takes ownership only on success; never evicts a future frame implicitly. */
  insert(frame: DecodedFrame): boolean {
    const old = this.frames.get(frame.index)
    if (old === frame) return true
    const bytes = this.bytes - (old?.byteLength ?? 0) + frame.byteLength
    if (frame.byteLength < 0 || !Number.isSafeInteger(frame.byteLength) || bytes > this.maxBytes || (!old && this.size >= this.maxFrames)) return false
    if (old) this.evict(frame.index)
    this.frames.set(frame.index, frame)
    this.bytes += frame.byteLength
    this.peakBytes = Math.max(this.peakBytes, this.bytes)
    this.peakFrames = Math.max(this.peakFrames, this.size)
    return true
  }
  evict(index: number) {
    const frame = this.frames.get(index)
    if (!frame) return
    this.frames.delete(index)
    this.bytes -= frame.byteLength
    frame.dispose()
  }
  evictBefore(index: number) { for (const cached of this.frames.keys()) if (cached < index) this.evict(cached) }
  clear() { for (const index of this.frames.keys()) this.evict(index) }
}
