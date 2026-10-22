import type { VirtualFile } from '../input/virtual-file'
import type { AnimationSequence } from '../media/animation'
import type { DetectedFormat } from './detector'

export interface DecodeOptions {
  readonly signal?: AbortSignal
}

/** Implementations will delegate substantial codec work to a worker. */
export interface AnimationDecoder {
  canDecode(format: DetectedFormat): boolean
  decode(file: VirtualFile, options?: DecodeOptions): Promise<AnimationSequence>
}
