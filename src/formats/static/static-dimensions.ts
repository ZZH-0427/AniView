import { MediaError } from '../../media/errors'
import { assertMediaDimensions } from '../../media/resource-policy'

export type StaticImageFormat = 'jpeg' | 'png' | 'webp'
export interface ImageDimensions { readonly width: number; readonly height: number }

const corrupted = (): never => { throw new MediaError('CORRUPTED_FILE') }
const text = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
/** Only container dimensions are inspected. Native codecs still validate/decode pixels. */
export function inspectStaticDimensions(data: ArrayBuffer, format: StaticImageFormat,
  validateDimensions: (width: number, height: number) => void = assertMediaDimensions): ImageDimensions {
  const dimensions = (width: number, height: number): ImageDimensions => {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) corrupted()
    validateDimensions(width, height)
    return { width, height }
  }
  const bytes = new Uint8Array(data), view = new DataView(data)
  if (format === 'png') {
    if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
      || view.getUint32(8) !== 13 || text(bytes, 12, 4) !== 'IHDR') corrupted()
    return dimensions(view.getUint32(16), view.getUint32(20))
  }
  if (format === 'jpeg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) corrupted()
    // Skip APP/EXIF and other bounded marker segments; orientation remains native.
    for (let offset = 2; offset < bytes.length;) {
      if (bytes[offset++] !== 0xff) corrupted()
      while (bytes[offset] === 0xff) offset++
      if (offset >= bytes.length) corrupted()
      const marker = bytes[offset++]!
      if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) corrupted()
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) corrupted()
      const length = view.getUint16(offset)
      if (length < 2 || length > bytes.length - offset) corrupted()
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8 || length !== 8 + 3 * bytes[offset + 7]!) corrupted()
        return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3))
      }
      offset += length
    }
    return corrupted()
  }
  if (bytes.length < 20 || text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'WEBP') corrupted()
  const end = view.getUint32(4, true) + 8
  if (end !== bytes.length) corrupted()
  let canvas: ImageDimensions | undefined, image: ImageDimensions | undefined
  for (let offset = 12; offset < end;) {
    if (end - offset < 8) corrupted()
    const type = text(bytes, offset, 4), length = view.getUint32(offset + 4, true), start = offset + 8
    const next = start + length + (length % 2)
    if (next > end) corrupted()
    if (type === 'VP8X') {
      if (offset !== 12 || canvas || length !== 10 || (bytes[start]! & 2)) corrupted()
      const uint24 = (at: number) => bytes[at]! + bytes[at + 1]! * 256 + bytes[at + 2]! * 65536
      canvas = dimensions(1 + uint24(start + 4), 1 + uint24(start + 7))
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (image) corrupted()
      if (type === 'VP8L') {
        if (length < 5 || bytes[start] !== 0x2f) corrupted()
        const bits = view.getUint32(start + 1, true)
        if (bits >>> 29) corrupted()
        image = dimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff))
      } else {
        if (length < 10 || (bytes[start]! & 1) || text(bytes, start + 3, 3) !== '\x9d\x01\x2a') corrupted()
        image = dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff)
      }
    } else if (type === 'ANIM' || type === 'ANMF') corrupted()
    offset = next
  }
  if (!image) return corrupted()
  if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) corrupted()
  return image
}
