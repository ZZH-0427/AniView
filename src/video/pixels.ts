import { codedSize, VideoError } from './model'
import type { CanonicalAnimationMetadata } from '../conversion/model'
/** Canonical is straight RGBA8. Composite in place; odd sizes require one padded scratch frame. */
export function compositeWhite(buffer: ArrayBuffer, meta: CanonicalAnimationMetadata) {
  if (buffer.byteLength !== meta.width * meta.height * 4) throw new VideoError('VIDEO_FRAME_FAILED')
  const size = codedSize(meta), src = new Uint8Array(buffer), padded = size.width !== meta.width || size.height !== meta.height
  const pixels = padded ? new Uint8Array(size.width * size.height * 4).fill(255) : src
  for (let y = 0; y < meta.height; y++) for (let x = 0; x < meta.width; x++) {
    const a = (y * meta.width + x) * 4, b = (y * size.width + x) * 4, alpha = src[a + 3]!
    for (let c = 0; c < 3; c++) pixels[b + c] = Math.floor((src[a + c]! * alpha + 255 * (255 - alpha) + 127) / 255)
    pixels[b + 3] = 255
  }
  return { pixels, ...size, temporaryRgbaFrames: padded ? 1 : 0 }
}
/** Bounded private comparison samples, never emitted as diagnostics or retained as full frames. */
export function sampleRgb(pixels: Uint8Array) {
  const count = pixels.length / 4, result = new Uint8Array(Math.min(256, count) * 3)
  for (let i = 0; i < result.length / 3; i++) {
    const at = Math.floor(i * count / (result.length / 3)) * 4
    result.set(pixels.subarray(at, at + 3), i * 3)
  }
  return result
}
