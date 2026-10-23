import { GifReader } from 'omggif'
import { MediaError } from '../../media/errors'
import { decodedFrameBytes, MAX_AUTOMATIC_FRAME_BYTES } from '../../media/frame-budget'
import { normalizeGifLoop } from './gif-timing'

export interface GIFFrame {
  x: number; y: number; width: number; height: number; delay: number; disposal: number; transparent: number | null;
}
const bad = (): never => { throw new MediaError('CORRUPTED_FILE') }
const limit = (): never => { throw new MediaError('RESOURCE_LIMIT_EXCEEDED') }

/** Structural bounds are checked before the vendor parser touches untrusted bytes. */
export function readGIF(data: ArrayBuffer) {
  const bytes = new Uint8Array(data), view = new DataView(data)
  const text = (p: number, n: number) => String.fromCharCode(...bytes.subarray(p, p + n))
  if (!['GIF87a', 'GIF89a'].includes(text(0, 6))) throw new MediaError('UNSUPPORTED_FORMAT')
  if (bytes.length > 64 * 1024 * 1024) limit()
  let p = 6
  const requireBytes = (n: number) => { if (n > bytes.length - p) bad() }
  const u16 = () => { requireBytes(2); const value = view.getUint16(p, true); p += 2; return value }
  const u8 = () => { requireBytes(1); return bytes[p++]! }
  const width = u16(), height = u16()
  if (!width || !height) bad()
  if (decodedFrameBytes(width, height) > MAX_AUTOMATIC_FRAME_BYTES) limit()
  const packed = u8(), backgroundIndex = u8(); u8()
  const globalColors = packed & 128 ? 1 << ((packed & 7) + 1) : 0
  requireBytes(globalColors * 3)
  const background = globalColors && backgroundIndex < globalColors ? [...bytes.subarray(p + backgroundIndex * 3, p + backgroundIndex * 3 + 3), 255] : [0, 0, 0, 0]
  p += globalColors * 3
  const blocks = () => {
    let count = 0, first: Uint8Array | undefined
    for (let n = u8(); n; n = u8()) {
      if (++count > 1_000_000) limit()
      requireBytes(n)
      if (!first) first = bytes.subarray(p, p + n)
      p += n
    }
    return { count, first }
  }
  const frames: GIFFrame[] = []
  let delay = 0, disposal = 0, transparent: number | null = null, repeats: number | null = null, ended = false, work = 0, blockCount = 0
  while (p < bytes.length) {
    if (++blockCount > 100_000) limit()
    const tag = u8()
    if (tag === 0x3b) { ended = true; break }
    if (tag === 0x21) {
      const label = u8()
      if (label === 0xf9) {
        if (u8() !== 4) bad()
        const control = u8(); disposal = (control >> 2) & 7
        if (disposal > 3 || control & 0xe0) bad()
        if (control & 2) throw new MediaError('UNSUPPORTED_FORMAT')
        delay = u16(); const index = u8(); transparent = control & 1 ? index : null
        if (u8() !== 0) bad()
      } else if (label === 0xff) {
        if (u8() !== 11) bad()
        requireBytes(11); const name = text(p, 11); p += 11
        const parts = blocks()
        if (name === 'NETSCAPE2.0' || name === 'ANIMEXTS1.0') {
          const part = parts.first; if (parts.count !== 1 || part?.length !== 3 || part[0] !== 1) bad()
          repeats = part![1]! | part![2]! << 8
        }
      } else if (label === 0xfe) blocks()
      else throw new MediaError('UNSUPPORTED_FORMAT')
      continue
    }
    if (tag !== 0x2c) bad()
    const x = u16(), y = u16(), w = u16(), h = u16(), flags = u8()
    if (!w || !h || x > width - w || y > height - h || flags & 0x18) bad()
    const colors = flags & 128 ? 1 << ((flags & 7) + 1) : globalColors
    if (!colors || (transparent !== null && transparent >= colors)) bad()
    if (flags & 128) { requireBytes(colors * 3); p += colors * 3 }
    const codeSize = u8(); if (codeSize < 2 || codeSize > 8) bad()
    if (!blocks().count) bad()
    frames.push({ x, y, width: w, height: h, delay, disposal, transparent })
    work += width * height * 4 // Every emitted frame copies the full logical canvas.
    if (frames.length > 10_000 || work > 1024 * 1024 * 1024) limit()
    delay = 0; disposal = 0; transparent = null
  }
  if (!ended || p !== bytes.length || !frames.length) bad()
  try {
    const reader = new GifReader(bytes)
    if (reader.numFrames() !== frames.length || reader.width !== width || reader.height !== height) bad()
    // omggif retains a preceding GCE when the next image has none. Restore the
    // per-image control defaults validated above at this vendor boundary.
    frames.forEach((f, index) => Object.assign(reader.frameInfo(index), { delay: f.delay, disposal: f.disposal, transparent_index: f.transparent }))
    return { reader, width, height, frames, loopCount: normalizeGifLoop(repeats), background }
  } catch (cause) { throw new MediaError('CORRUPTED_FILE', { cause }) }
}
