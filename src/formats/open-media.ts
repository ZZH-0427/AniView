import type { VirtualFile } from '../input/virtual-file'
import type { AnimationSequence } from '../media/animation'
import { MediaError } from '../media/errors'
import { assertMediaEncodedSize } from '../media/resource-policy'
import type { DecodeOptions } from './animation-decoder'
import { BinaryFormatDetector } from './binary-detector'
import { openAnimation } from './open-animation'
import { StaticImageSource } from './static/static-image-source'
import type { StaticImageFormat } from './static/static-dimensions'

export type OpenedMedia =
  | { readonly kind: 'static'; readonly format: StaticImageFormat; readonly source: StaticImageSource }
  | { readonly kind: 'animation'; readonly format: string; readonly sequence: AnimationSequence }

export interface OpenMediaOptions extends DecodeOptions {
  readonly onPhase?: (phase: 'reading' | 'decoding') => void
}

/** Source-independent selection; Viewer distinguishes capabilities, never codecs. */
export async function openMedia(file: VirtualFile, options?: OpenMediaOptions): Promise<OpenedMedia> {
  try { assertMediaEncodedSize(file.size) }
  catch (cause) {
    // Preserve archive-entry diagnostics without reading/extracting oversized content.
    if (file.source === 'archive' && cause instanceof MediaError && cause.code === 'RESOURCE_LIMIT_EXCEEDED') {
      throw new MediaError('ARCHIVE_ENTRY_TOO_LARGE', { cause })
    }
    throw cause
  }
  options?.onPhase?.('reading')
  const format = await new BinaryFormatDetector().detect(file, options?.signal)
  if (options?.signal?.aborted) throw new DOMException('Media opening cancelled', 'AbortError')
  if (format.kind === 'jpeg' || format.kind === 'png' || (format.kind === 'webp' && !format.animated)) {
    const source = await StaticImageSource.open(file, format.kind, { ...options, onDecoding: () => options?.onPhase?.('decoding') })
    return { kind: 'static', format: format.kind, source }
  }
  if (format.kind !== 'apng' && format.kind !== 'gif' && format.kind !== 'webp') throw new MediaError('UNSUPPORTED_FORMAT')
  options?.onPhase?.('decoding')
  const animation = await openAnimation(file, options)
  if (options?.signal?.aborted) {
    await animation.sequence.dispose()
    throw new DOMException('Media opening cancelled', 'AbortError')
  }
  return { kind: 'animation', ...animation }
}
