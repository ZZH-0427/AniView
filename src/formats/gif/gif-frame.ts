import { MediaError } from '../../media/errors'
import type { readGIF } from './gif-reader'

/** Vendor boundary: omggif owns LZW, palettes and transparency. */
export function decodeGIFFrame(parsed: ReturnType<typeof readGIF>, index: number, canvas: Uint8Array) {
  const info = parsed.reader.frameInfo(index)
  const interlaced = info.interlaced
  const log = console.log
  try {
    // The vendor reports invalid LZW output lengths by logging, rather than throwing.
    // Decoding is synchronous and runs inside our dedicated Worker.
    console.log = () => { throw new MediaError('CORRUPTED_FILE') }
    if (!interlaced) { parsed.reader.decodeAndBlitFrameRGBA(index, canvas); return }

    // omggif 1.0.10 skips empty interlace passes incorrectly on short images.
    // Decode the compressed stream in linear order, then apply the four GIF passes.
    // A zero-alpha scratch pixel preserves the compositor's underlying pixel.
    info.interlaced = false
    const linear = new Uint8Array(canvas.length)
    parsed.reader.decodeAndBlitFrameRGBA(index, linear)
    let sourceRow = 0
    for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) {
      for (let row = start; row < info.height; row += step) {
        const source = ((info.y + sourceRow++) * parsed.width + info.x) * 4
        const target = ((info.y + row) * parsed.width + info.x) * 4
        for (let x = 0; x < info.width * 4; x += 4) {
          if (linear[source + x + 3]) canvas.set(linear.subarray(source + x, source + x + 4), target + x)
        }
      }
    }
  } catch (cause) {
    throw cause instanceof MediaError ? cause : new MediaError('CORRUPTED_FILE', { cause })
  } finally { info.interlaced = interlaced; console.log = log }
}
