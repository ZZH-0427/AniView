import { MediaError } from '../../media/errors'
import { APNG_LIMITS } from './apng-parser'
import type { APNGFrameDescriptor } from './apng-parser'

interface DataChunk { readonly start: number; readonly end: number; readonly crc: number }
const signature = [137, 80, 78, 71, 13, 10, 26, 10]
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})
function updateCRC(crc: number, bytes: Uint8Array) {
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!
  return crc
}
const chunkCRC = (type: Uint8Array, data = new Uint8Array(0)) => (updateCRC(updateCRC(0xffffffff, type), data) ^ 0xffffffff) >>> 0
const corrupted = () => new MediaError('CORRUPTED_FILE')
class UnsupportedFilter extends Error {}

async function bytes(blob: Blob, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  let data: ArrayBuffer
  try { data = await blob.slice(start, end).arrayBuffer() }
  catch (cause) { throw new MediaError('FILE_READ_FAILED', { cause }) }
  if (data.byteLength !== end - start) throw corrupted()
  return new Uint8Array(data)
}

/**
 * Narrow opt-in for independent, full-canvas SOURCE/NONE RGBA8/filter-0 PNGs.
 * This preserves stored straight RGBA without Canvas premultiplication rounding.
 * It is not a general PNG decoder; unsupported semantics return to the compositor.
 */
export async function readFullSourceRGBA(frame: APNGFrameDescriptor, width: number, height: number): Promise<ArrayBuffer | undefined> {
  if (frame.left !== 0 || frame.top !== 0 || frame.width !== width || frame.height !== height
    || frame.blendOp !== 0 || frame.disposeOp !== 0) return
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)
    || !Number.isSafeInteger(width * height * 4)) throw corrupted()
  if (width * height * 4 > APNG_LIMITS.maxFrameBytes) throw new MediaError('RESOURCE_LIMIT_EXCEEDED')
  if (typeof DecompressionStream !== 'function') return
  const png = frame.imageData
  if (!(png instanceof Blob) || png.size < 45) throw corrupted()
  if (png.size > APNG_LIMITS.maxReconstructedPNGBytes) throw new MediaError('RESOURCE_LIMIT_EXCEEDED')
  const magic = await bytes(png, 0, 8)
  if (!signature.every((value, index) => magic[index] === value)) throw corrupted()

  const chunks: DataChunk[] = []
  let offset = 8, sawHeader = false, ended = false, count = 0, compressedBytes = 0
  while (offset < png.size) {
    if (++count > APNG_LIMITS.maxChunks) throw new MediaError('RESOURCE_LIMIT_EXCEEDED')
    if (png.size - offset < 12) throw corrupted()
    const header = await bytes(png, offset, offset + 8), length = new DataView(header.buffer).getUint32(0)
    const typeBytes = header.subarray(4), type = String.fromCharCode(...typeBytes)
    if (length > 0x7fffffff || length > png.size - offset - 12 || !/^[A-Za-z]{4}$/.test(type)) throw corrupted()
    const start = offset + 8, end = start + length
    const checksum = new DataView((await bytes(png, end, end + 4)).buffer).getUint32(0)
    if (!sawHeader && type !== 'IHDR') throw corrupted()
    if (type === 'IHDR') {
      if (sawHeader || length !== 13 || offset !== 8) throw corrupted()
      const data = await bytes(png, start, end), view = new DataView(data.buffer)
      if (chunkCRC(typeBytes, data) !== checksum || view.getUint32(0) !== width || view.getUint32(4) !== height) throw corrupted()
      if (data[10] !== 0 || data[11] !== 0 || data[12]! > 1) throw corrupted()
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) return
      sawHeader = true
    } else if (type === 'IDAT') {
      chunks.push({ start, end, crc: checksum }); compressedBytes += length
    } else if (type === 'IEND') {
      if (length !== 0 || chunkCRC(typeBytes) !== checksum || !compressedBytes || end + 4 !== png.size) throw corrupted()
      ended = true
      break
    } else {
      // Ancillary color/profile chunks can change visual interpretation. Leave
      // them, other PNG features and any future format extension to Canvas.
      return
    }
    offset = end + 4
  }
  if (!ended) throw corrupted()

  let decompressor: DecompressionStream
  try { decompressor = new DecompressionStream('deflate') } catch { return }
  const writer = decompressor.writable.getWriter(), reader = decompressor.readable.getReader()
  const rgba = new Uint8Array(width * height * 4)
  const rowBytes = width * 4, scanlineBytes = rowBytes + 1, expected = scanlineBytes * height
  let received = 0, rowOffset = 0, written = 0
  const feed = async () => {
    for (const chunk of chunks) {
      let crc = updateCRC(0xffffffff, Uint8Array.of(73, 68, 65, 84)) // IDAT
      for (let position = chunk.start; position < chunk.end;) {
        const end = Math.min(position + 65536, chunk.end)
        const part = await bytes(png, position, end)
        crc = updateCRC(crc, part)
        // Every compressed input chunk is immutable until native processing ends.
        await writer.write(part)
        position = end
      }
      if (((crc ^ 0xffffffff) >>> 0) !== chunk.crc) throw corrupted()
    }
    await writer.close()
  }
  const drain = async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength > expected - received) throw corrupted()
      received += value.byteLength
      for (let cursor = 0; cursor < value.byteLength;) {
        if (rowOffset === 0) {
          if (value[cursor++] !== 0) throw new UnsupportedFilter()
          rowOffset = 1
        } else {
          const amount = Math.min(scanlineBytes - rowOffset, value.byteLength - cursor)
          rgba.set(value.subarray(cursor, cursor + amount), written)
          cursor += amount; written += amount; rowOffset += amount
          if (rowOffset === scanlineBytes) rowOffset = 0
        }
      }
    }
    if (received !== expected || written !== rgba.byteLength || rowOffset !== 0) throw corrupted()
  }
  // Drain while feeding: retaining a full decompressed scanline image would add
  // another full-canvas allocation. Only the final RGBA and native chunks exist.
  const pumping = feed(), draining = drain()
  try {
    await Promise.all([pumping, draining])
    return rgba.buffer
  } catch (cause) {
    await Promise.allSettled([writer.abort(cause), reader.cancel(cause)])
    await Promise.allSettled([pumping, draining])
    if (cause instanceof UnsupportedFilter) return
    throw cause instanceof MediaError ? cause : new MediaError('CORRUPTED_FILE', { cause })
  } finally {
    writer.releaseLock(); reader.releaseLock()
  }
}
