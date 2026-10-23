import { MediaError } from '../../media/errors'
import type { GIFFrame } from './gif-reader'

/** CPU composition in the Worker; one canvas and one necessary region backup. */
export class GIFCompositor {
  private pixels: Uint8Array
  private previous: GIFFrame | undefined
  private backup: Uint8Array | undefined
  get backupBytes() { return this.backup?.byteLength ?? 0 }
  constructor(private readonly width: number, height: number) {
    this.pixels = new Uint8Array(width * height * 4)
  }
  private region(frame: GIFFrame, restore?: Uint8Array) {
    const result = restore ? undefined : new Uint8Array(frame.width * frame.height * 4)
    for (let row = 0; row < frame.height; row++) {
      const start = ((frame.y + row) * this.width + frame.x) * 4, offset = row * frame.width * 4
      if (restore) this.pixels.set(restore.subarray(offset, offset + frame.width * 4), start)
      else result!.set(this.pixels.subarray(start, start + frame.width * 4), offset)
    }
    return result
  }
  compose(frame: GIFFrame, decode: (canvas: Uint8Array) => void) {
    if (!this.pixels.length) throw new MediaError('DECODE_FAILED')
    const old = this.previous
    if (old?.disposal === 2) {
      // Matches Chromium's tested GIF behavior even with an opaque logical background:
      // the cleared rectangle is transparent, including opaque-background GIFs.
      for (let y = old.y; y < old.y + old.height; y++) this.pixels.fill(0, (y * this.width + old.x) * 4, (y * this.width + old.x + old.width) * 4)
    } else if (old?.disposal === 3 && this.backup) this.region(old, this.backup)
    this.backup = frame.disposal === 3 ? this.region(frame) : undefined
    decode(this.pixels) // omggif preserves canvas pixels for transparent indices.
    this.previous = frame
    return this.pixels.slice().buffer
  }
  reset() { this.pixels.fill(0); this.previous = undefined; this.backup = undefined }
  dispose() { this.reset(); this.pixels = new Uint8Array(0) }
}
