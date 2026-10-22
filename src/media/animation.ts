import type { DecodedFrame } from './frame'

export interface AnimationSequence {
  readonly width: number
  readonly height: number
  readonly frameCount?: number
  /** Total plays, normalized across codecs; 0 means infinite, undefined means unknown. */
  readonly loopCount?: number
  /**
   * Fresh incremental stream from the beginning for replay; one active iterator at a time.
   * Pulling transfers frame ownership to the caller. No unbounded decoded-frame retention.
   * Ending/returning the iterator or aborting releases its pending decoder resources.
   */
  frames(signal?: AbortSignal): AsyncIterable<DecodedFrame>
  /** Stop active decode and release sequence resources; caller still owns yielded frames. */
  dispose(): Promise<void>
}
