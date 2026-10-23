import type { VirtualFile } from '../../input/virtual-file'
import { MediaError } from '../../media/errors'
import { assertMediaDimensions, assertMediaEncodedSize } from '../../media/resource-policy'
import type { DecodeOptions } from '../animation-decoder'
import { inspectStaticDimensions, type StaticImageFormat } from './static-dimensions'

export interface StaticImageOpenOptions extends DecodeOptions { readonly onDecoding?: () => void }

const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Static image opening cancelled', 'AbortError')
}

/** Owns exactly one native bitmap. No animation, frame-cache or object-URL lifetime. */
export class StaticImageSource {
  readonly width: number
  readonly height: number
  private bitmap: ImageBitmap | null
  private readonly signal: AbortSignal | undefined
  private readonly abort = () => this.dispose()

  private constructor(bitmap: ImageBitmap, signal?: AbortSignal) {
    this.width = bitmap.width
    this.height = bitmap.height
    this.bitmap = bitmap
    this.signal = signal
    signal?.addEventListener('abort', this.abort, { once: true })
  }

  get image() { return this.bitmap }

  static async open(file: VirtualFile, format: StaticImageFormat, options?: StaticImageOpenOptions): Promise<StaticImageSource> {
    const signal = options?.signal
    abortIfNeeded(signal)
    assertMediaEncodedSize(file.size)
    let data: ArrayBuffer
    try { data = await file.read() }
    catch (cause) {
      abortIfNeeded(signal)
      if (cause instanceof MediaError) throw cause
      throw new MediaError('FILE_READ_FAILED', { cause })
    }
    abortIfNeeded(signal)
    if (data.byteLength !== file.size) throw new MediaError('FILE_READ_FAILED')
    assertMediaEncodedSize(data.byteLength)
    inspectStaticDimensions(data, format) // Reject hostile dimensions before native allocation.
    if (typeof createImageBitmap !== 'function') throw new MediaError('STATIC_IMAGE_RUNTIME_UNAVAILABLE')
    options?.onDecoding?.()
    let bitmap: ImageBitmap | undefined
    try {
      const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[format]
      // Native decode is asynchronous; EXIF orientation is applied by the browser.
      bitmap = await createImageBitmap(new Blob([data], { type: mime }), { imageOrientation: 'from-image' })
      abortIfNeeded(signal)
      assertMediaDimensions(bitmap.width, bitmap.height)
      return new StaticImageSource(bitmap, signal)
    } catch (cause) {
      // createImageBitmap cannot be aborted: close a result arriving after cancellation.
      bitmap?.close()
      abortIfNeeded(signal)
      if (cause instanceof MediaError) throw cause
      if (cause instanceof RangeError) throw new MediaError('OUT_OF_MEMORY', { cause })
      throw new MediaError('DECODE_FAILED', { cause })
    }
  }

  dispose() {
    this.signal?.removeEventListener('abort', this.abort)
    this.bitmap?.close()
    this.bitmap = null
  }
}
