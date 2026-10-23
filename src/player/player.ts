import type { AnimationSequence } from '../media/animation'

export type PlaybackState = 'idle' | 'paused' | 'playing' | 'ended' | 'error'

/** Format-independent timing and looping; implementations own a bounded frame cache. */
export interface Player {
  readonly state: PlaybackState
  readonly frameCount: number | undefined
  readonly busy: boolean
  readonly reconstructing: boolean
  readonly backgrounded: boolean
  /** Take ownership of the sequence, disposing the previous sequence and its frames. */
  load(sequence: AnimationSequence): Promise<void>
  play(): void
  pause(): void
  /** Suspend scheduling while hidden; restore only prior/user playback intent. */
  setBackgrounded(hidden: boolean): void
  reset(): Promise<void>
  /** Pause, move one frame without wrapping, and remain paused. */
  stepForward(): Promise<void>
  stepBackward(): Promise<void>
  /** Stop scheduling and release all owned frames and sequence resources. */
  dispose(): Promise<void>
}
