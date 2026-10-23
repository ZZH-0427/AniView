import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'
import type { DetectedFormat, FormatDetector } from './detector'

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const text = (bytes: Uint8Array, start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count))

/** Reads signatures and PNG chunk headers, never filenames, MIME hints or pixel data. */
export class BinaryFormatDetector implements FormatDetector {
  async detect(file: VirtualFile, signal?: AbortSignal): Promise<DetectedFormat> {
    const read = async (start: number, end: number) => {
      if (signal?.aborted) throw new MediaError('FILE_READ_FAILED')
      try {
        const result = await file.read(start, end)
        if (signal?.aborted || result.byteLength !== end - start) throw new MediaError('FILE_READ_FAILED')
        return new Uint8Array(result)
      } catch (cause) {
        if (cause instanceof MediaError) throw cause
        throw new MediaError('FILE_READ_FAILED', { cause })
      }
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0) throw new MediaError('FILE_READ_FAILED')
    const header = await read(0, Math.min(file.size, 32))
    if (pngSignature.every((byte, index) => header[index] === byte)) {
      let sawHeader = false
      for (let offset = 8, chunks = 0; offset < file.size && chunks++ < 100_000;) {
        if (file.size - offset < 12) throw new MediaError('CORRUPTED_FILE')
        const chunk = await read(offset, offset + 8)
        const length = new DataView(chunk.buffer).getUint32(0)
        const type = text(chunk, 4, 4)
        if (length > 0x7fffffff || length > file.size - offset - 12 || !/^[A-Za-z]{4}$/.test(type)) throw new MediaError('CORRUPTED_FILE')
        if (!sawHeader && (type !== 'IHDR' || length !== 13)) throw new MediaError('CORRUPTED_FILE')
        sawHeader = true
        if (type === 'acTL') {
          if (length !== 8) throw new MediaError('CORRUPTED_FILE')
          return { kind: 'apng', animated: true }
        }
        if (type === 'IEND') {
          if (length || offset + 12 !== file.size) throw new MediaError('CORRUPTED_FILE')
          return { kind: 'png', animated: false }
        }
        offset += length + 12
      }
      throw new MediaError('CORRUPTED_FILE')
    }
    if (text(header, 0, 4) === 'RIFF' && text(header, 8, 4) === 'WEBP') {
      if (header.length < 20) throw new MediaError('CORRUPTED_FILE')
      const riffSize = new DataView(header.buffer).getUint32(4, true) + 8
      if (riffSize > file.size || riffSize < 20) throw new MediaError('CORRUPTED_FILE')
      const extended = text(header, 12, 4) === 'VP8X'
      if (extended && (header.length < 30 || new DataView(header.buffer).getUint32(16, true) !== 10)) throw new MediaError('CORRUPTED_FILE')
      return { kind: 'webp', animated: extended && !!(header[20]! & 2) }
    }
    if (['GIF87a', 'GIF89a'].includes(text(header, 0, 6))) return { kind: 'gif', animated: true }
    if (header[0] === 255 && header[1] === 216 && header[2] === 255) return { kind: 'jpeg', animated: false }
    if (header[0] === 80 && header[1] === 75 && ((header[2] === 3 && header[3] === 4) || (header[2] === 5 && header[3] === 6) || (header[2] === 7 && header[3] === 8))) return { kind: 'zip' }
    return { kind: 'unknown' }
  }
}
