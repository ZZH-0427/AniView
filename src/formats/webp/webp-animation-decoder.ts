import type { AnimationDecoder, DecodeOptions } from '../animation-decoder'
import type { DetectedFormat } from '../detector'
import type { VirtualFile } from '../../input/virtual-file'
import type { AnimationSequence } from '../../media/animation'
import type { DecodedFrame } from '../../media/frame'
import { MediaError } from '../../media/errors'
import { WebPDecoder } from './webp-decoder'

export class WebPAnimationDecoder implements AnimationDecoder {
  canDecode(format: DetectedFormat) { return format.kind === 'webp' }
  async decode(file: VirtualFile, options?: DecodeOptions): Promise<AnimationSequence> {
    const transport = new WebPDecoder()
    let disposed = false
    let active = false
    const abort = () => transport.dispose()
    options?.signal?.addEventListener('abort', abort, { once: true })
    try {
      if (options?.signal?.aborted) throw new MediaError('WORKER_FAILED')
      const ready = await transport.open(file) // Binary WebP validation stays in libwebp.
      if (ready.type !== 'ready') throw new MediaError('DECODE_FAILED')
      return {
        ...ready.metadata, // WebP ANIM loop count is total plays; 0 is infinite.
        async *frames(signal?: AbortSignal) {
          if (disposed || active || signal?.aborted) throw new MediaError('DECODE_FAILED')
          active = true
          signal?.addEventListener('abort', abort, { once: true })
          try {
            await transport.reset()
            while (!disposed && !signal?.aborted) {
              const response = await transport.next()
              if (response.type === 'end') return
              if (response.type !== 'frame') throw new MediaError('DECODE_FAILED')
              let image: ImageData | null = new ImageData(new Uint8ClampedArray(response.rgba), response.width, response.height)
              const frame: DecodedFrame = {
                index: response.frameIndex, width: response.width, height: response.height,
                durationMs: response.durationMs, byteLength: response.rgba.byteLength,
                get image() { return image }, dispose() { image = null },
              }
              yield frame
            }
          } finally { active = false; signal?.removeEventListener('abort', abort) }
        },
        async dispose() {
          if (disposed) return
          disposed = true
          options?.signal?.removeEventListener('abort', abort)
          try { await transport.close() } catch { /* Pending decode is cancelled by termination. */ }
          finally { transport.dispose() }
        },
      }
    } catch (error) {
      options?.signal?.removeEventListener('abort', abort)
      transport.dispose()
      throw error
    }
  }
}
