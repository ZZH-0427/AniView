import { GIFEncoder, quantize, applyPalette, type GifEncoderInstance, type Palette } from 'gifenc'
import { EncodeError, type EncodeOptions } from './model'

export interface IndexedGifFrame { readonly indexed: Uint8Array; readonly palette: Palette }

/** Mutates only RGB under discarded alpha; no second full RGBA allocation. */
export function quantizeGifFrame(rgba: Uint8ClampedArray, colors: 64 | 128 | 256, alphaThreshold: number): IndexedGifFrame {
  try {
    // gifenc reads the entire underlying buffer rather than respecting view ranges.
    if (rgba.byteOffset !== 0 || rgba.byteLength !== rgba.buffer.byteLength || rgba.length % 4) throw new EncodeError('QUANTIZATION_FAILED')
    let firstOpaque = -1
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i]! > alphaThreshold) { firstOpaque = i - 3; break }
    }
    if (firstOpaque < 0) return { indexed: new Uint8Array(rgba.length / 4), palette: [[0, 0, 0], [0, 0, 0]] }
    // Transparent black must not consume an opaque palette entry. Replacing it
    // with one existing opaque color avoids an RGBA compaction copy. Very large
    // transparent padding increases that color's histogram weight; this is an
    // explicit spike quality tradeoff, not an opaque-only histogram claim.
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3]! <= alphaThreshold) {
        rgba[i] = rgba[firstOpaque]!
        rgba[i + 1] = rgba[firstOpaque + 1]!
        rgba[i + 2] = rgba[firstOpaque + 2]!
      }
    }
    const opaquePalette = quantize(rgba, colors - 1, { format: 'rgb565' })
    const indexed = applyPalette(rgba, opaquePalette, 'rgb565')
    for (let i = 0; i < indexed.length; i++) indexed[i] = rgba[i * 4 + 3]! <= alphaThreshold ? 0 : indexed[i]! + 1
    // Index zero is always reserved, including fully opaque frames. No opaque
    // color can be accidentally made transparent by palette nearest matching.
    return { indexed, palette: [[0, 0, 0], ...opaquePalette] }
  } catch (cause) {
    throw cause instanceof EncodeError ? cause : new EncodeError('QUANTIZATION_FAILED', { cause })
  }
}

/** The sole dependency boundary; gifenc types do not reach a creation UI. */
export class GifencWriter {
  private encoder: GifEncoderInstance | undefined = GIFEncoder()
  constructor(private readonly options: EncodeOptions) {}
  get outputBytes() { return this.encoder?.bytesView().byteLength ?? 0 }
  get outputCapacity() { return this.encoder?.buffer.byteLength ?? 0 }
  write(frame: IndexedGifFrame, width: number, height: number) {
    if (!this.encoder) throw new EncodeError('ENCODING_FAILED')
    const repeat = this.options.loop.kind === 'forever' ? 0 : this.options.loop.kind === 'once' ? -1 : this.options.loop.repeats
    try {
      this.encoder.writeFrame(frame.indexed, width, height, {
        palette: frame.palette, delay: this.options.frameDurationMs, repeat,
        transparent: true, transparentIndex: 0, dispose: 2,
      })
    } catch (cause) { throw new EncodeError('ENCODING_FAILED', { cause }) }
  }
  finish() {
    if (!this.encoder) throw new EncodeError('ENCODING_FAILED')
    try {
      this.encoder.finish()
      const bytes = this.encoder.bytesView()
      const result = { data: bytes.buffer, byteLength: bytes.byteLength, capacity: bytes.buffer.byteLength }
      // Ownership of the capacity-sized allocation passes to the caller. The
      // exact view length accompanies transfer; bytes() would copy needlessly.
      this.encoder = undefined
      return result
    } catch (cause) { throw new EncodeError('ENCODING_FAILED', { cause }) }
  }
  dispose() { this.encoder = undefined }
}
