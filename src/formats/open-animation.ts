import type { VirtualFile } from '../input/virtual-file'
import type { DecodeOptions } from './animation-decoder'
import { MediaError } from '../media/errors'
import { BinaryFormatDetector } from './binary-detector'
import { WebPAnimationDecoder } from './webp/webp-animation-decoder'
import { APNGAnimationDecoder } from './apng/apng-animation-decoder'

/** Format selection ends here; playback only receives the normalized sequence. */
export async function openAnimation(file: VirtualFile, options?: DecodeOptions) {
  const format = await new BinaryFormatDetector().detect(file, options?.signal)
  if (options?.signal?.aborted) throw new MediaError('WORKER_FAILED')
  if (format.kind === 'png') throw new MediaError('STATIC_PNG_NOT_ANIMATED')
  const decoder = [new WebPAnimationDecoder(), new APNGAnimationDecoder()].find(candidate => candidate.canDecode(format))
  if (!decoder) throw new MediaError('UNSUPPORTED_FORMAT')
  return { format: format.kind, sequence: await decoder.decode(file, options) }
}
