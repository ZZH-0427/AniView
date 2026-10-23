import parseAPNGModule from 'apng-js'
import { MediaError } from '../../media/errors'
import { MAX_AUTOMATIC_FRAME_BYTES } from '../../media/frame-budget'

export const APNG_LIMITS = {
  maxEncodedBytes: 64 * 1024 * 1024,
  // Keep two full frames within the shared automatic cache ceiling of 32 MiB.
  maxFrameBytes: MAX_AUTOMATIC_FRAME_BYTES,
  maxFrames: 10_000,
  maxChunks: 100_000,
  maxTotalInflatedBytes: 1024 * 1024 * 1024,
  maxSharedMetadataBytes: 2 * 1024 * 1024,
  maxReconstructedPNGBytes: 128 * 1024 * 1024,
} as const

export interface APNGFrameDescriptor {
  readonly width: number
  readonly height: number
  readonly left: number
  readonly top: number
  readonly durationMs: number
  readonly disposeOp: 0 | 1 | 2
  readonly blendOp: 0 | 1
  /** Compressed, standalone PNG. No decoded pixels or vendor objects escape here. */
  readonly imageData: Blob
}

export interface ParsedAPNG {
  readonly width: number
  readonly height: number
  readonly frameCount: number
  readonly loopCount: number
  readonly frames: readonly APNGFrameDescriptor[]
}

type RawFrame = Omit<APNGFrameDescriptor, 'imageData'> & {
  dataBytes: number
  dataChunks: number
  dataKind: 'IDAT' | 'fdAT'
}

const signature = [137, 80, 78, 71, 13, 10, 26, 10]
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(bytes: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff
  for (let offset = start; offset < end; offset++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[offset]!) & 255]!
  return (crc ^ 0xffffffff) >>> 0
}

function corrupted(): never { throw new MediaError('CORRUPTED_FILE') }
function resourceLimit(): never { throw new MediaError('RESOURCE_LIMIT_EXCEEDED') }

/** Includes PNG filter bytes and Adam7 passes, even for 16-bit sample formats. */
function inflatedBytes(width: number, height: number, bitsPerPixel: number, interlace: number) {
  if (!interlace) return (Math.ceil(width * bitsPerPixel / 8) + 1) * height
  const passes: readonly (readonly [number, number, number, number])[] = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
  return passes.reduce((total, pass) => {
    const [x, y, stepX, stepY] = pass
    const columns = Math.max(0, Math.ceil((width - x) / stepX))
    const rows = Math.max(0, Math.ceil((height - y) / stepY))
    return total + (columns ? (Math.ceil(columns * bitsPerPixel / 8) + 1) * rows : 0)
  }, 0)
}

/** Validate before entering apng-js, whose parser assumes trustworthy chunk lengths. */
function inspect(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new MediaError('UNSUPPORTED_FORMAT')
  if (bytes.byteLength > APNG_LIMITS.maxEncodedBytes) resourceLimit()
  const view = new DataView(data)
  let width = 0, height = 0, declaredFrames = 0, loopCount = 0, bitsPerPixel = 0, interlace = 0
  let colorType = 0, paletteEntries = 0, chunkCount = 0, nextSequence = 0, totalInflated = 0
  let sawHeader = false, sawAnimation = false, sawIDAT = false, endedIDAT = false, sawEnd = false, sawTransparency = false
  let defaultDataBytes = 0, sharedMetadataBytes = 0
  const frames: RawFrame[] = []
  let current: RawFrame | undefined
  for (let offset = 8; offset < bytes.byteLength;) {
    if (++chunkCount > APNG_LIMITS.maxChunks) resourceLimit()
    if (bytes.byteLength - offset < 12) corrupted()
    const length = view.getUint32(offset)
    if (length > 0x7fffffff || length > bytes.byteLength - offset - 12) corrupted()
    const start = offset + 8, end = start + length
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2]!.toUpperCase()) corrupted()
    if (view.getUint32(end) !== crc32(bytes, offset + 4, end)) corrupted()
    if (!sawHeader && type !== 'IHDR') corrupted()
    if (sawIDAT && type !== 'IDAT') endedIDAT = true
    switch (type) {
      case 'IHDR': {
        if (sawHeader || offset !== 8 || length !== 13) corrupted()
        sawHeader = true
        width = view.getUint32(start); height = view.getUint32(start + 4)
        if (!width || !height || width > 0x7fffffff || height > 0x7fffffff) corrupted()
        if (width * height * 4 > APNG_LIMITS.maxFrameBytes) resourceLimit()
        const depth = bytes[start + 8]!
        colorType = bytes[start + 9]!
        const depths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
        const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
        if (!depths[colorType]?.includes(depth) || bytes[start + 10] !== 0 || bytes[start + 11] !== 0 || bytes[start + 12]! > 1) corrupted()
        bitsPerPixel = depth * channels[colorType]!
        interlace = bytes[start + 12]!
        break
      }
      case 'acTL':
        if (sawAnimation || sawIDAT || length !== 8) corrupted()
        sawAnimation = true
        declaredFrames = view.getUint32(start); loopCount = view.getUint32(start + 4)
        if (!declaredFrames) corrupted()
        if (declaredFrames > APNG_LIMITS.maxFrames) resourceLimit()
        break
      case 'fcTL': {
        if (!sawAnimation || length !== 26 || (current && !current.dataBytes)) corrupted()
        if (view.getUint32(start) !== nextSequence++) corrupted()
        const frameWidth = view.getUint32(start + 4), frameHeight = view.getUint32(start + 8)
        const left = view.getUint32(start + 12), top = view.getUint32(start + 16)
        const dispose = bytes[start + 24]!, blend = bytes[start + 25]!
        if (!frameWidth || !frameHeight || frameWidth > width || frameHeight > height || left > width - frameWidth || top > height - frameHeight || dispose > 2 || blend > 1) corrupted()
        if (!sawIDAT && (frames.length || left || top || frameWidth !== width || frameHeight !== height)) corrupted()
        current = {
          width: frameWidth, height: frameHeight, left, top,
          durationMs: 1000 * view.getUint16(start + 20) / (view.getUint16(start + 22) || 100),
          disposeOp: dispose as 0 | 1 | 2, blendOp: blend as 0 | 1,
          dataBytes: 0, dataChunks: 0, dataKind: sawIDAT ? 'fdAT' : 'IDAT',
        }
        frames.push(current)
        if (frames.length > declaredFrames) corrupted()
        totalInflated += inflatedBytes(frameWidth, frameHeight, bitsPerPixel, interlace)
        if (totalInflated > APNG_LIMITS.maxTotalInflatedBytes) resourceLimit()
        break
      }
      case 'IDAT':
        if (endedIDAT || (colorType === 3 && !paletteEntries)) corrupted()
        sawIDAT = true
        defaultDataBytes += length
        if (current) {
          if (current.dataKind !== 'IDAT') corrupted()
          current.dataBytes += length
          current.dataChunks++
        }
        break
      case 'fdAT':
        if (!sawAnimation || !sawIDAT || !current || current.dataKind !== 'fdAT' || length < 4) corrupted()
        if (view.getUint32(start) !== nextSequence++) corrupted()
        current.dataBytes += length - 4
        current.dataChunks++
        break
      case 'PLTE':
        if (sawIDAT || paletteEntries || !length || length > 768 || length % 3 || colorType === 0 || colorType === 4) corrupted()
        paletteEntries = length / 3
        break
      case 'tRNS':
        if (sawIDAT || sawTransparency || (colorType === 0 ? length !== 2 : colorType === 2 ? length !== 6 : colorType !== 3 || !paletteEntries || !length || length > paletteEntries)) corrupted()
        sawTransparency = true
        break
      case 'IEND':
        if (length || !sawIDAT || !defaultDataBytes || (current && !current.dataBytes) || end + 4 !== bytes.byteLength) corrupted()
        sawEnd = true
        break
      default:
        if (type[0] === type[0]!.toUpperCase()) throw new MediaError('UNSUPPORTED_FORMAT')
    }
    if (!['IHDR', 'acTL', 'fcTL', 'IDAT', 'fdAT', 'IEND'].includes(type)) {
      sharedMetadataBytes += length + 12
      if (sharedMetadataBytes > APNG_LIMITS.maxSharedMetadataBytes) resourceLimit()
    }
    offset = end + 4
    if (sawEnd) break
  }
  if (!sawEnd) corrupted()
  if (!sawAnimation) throw new MediaError('UNSUPPORTED_FORMAT')
  if (frames.length !== declaredFrames) corrupted()
  // apng-js repeats shared ancillary chunks in every reconstructed PNG. Blob
  // implementations may share their storage, so this bounds logical decode work
  // conservatively, not measured heap allocation. 45 = signature + IHDR + IEND.
  const reconstructedBytes = frames.reduce((total, frame) => total + 45 + sharedMetadataBytes + frame.dataBytes + frame.dataChunks * 12, 0)
  if (reconstructedBytes > APNG_LIMITS.maxReconstructedPNGBytes) resourceLimit()
  return { width, height, loopCount, frames }
}

/** The published UMD package has different default interop in native Node and Vite. */
function vendorParser(): typeof parseAPNGModule {
  const candidate: unknown = parseAPNGModule
  if (typeof candidate === 'function') return parseAPNGModule
  if (candidate && typeof candidate === 'object' && 'default' in candidate && typeof candidate.default === 'function') {
    return candidate.default as typeof parseAPNGModule
  }
  throw new MediaError('DECODE_FAILED')
}

export function parseAPNGFile(data: ArrayBuffer): ParsedAPNG {
  const checked = inspect(data)
  try {
    // apng-js rewrites IHDR dimensions while building standalone PNG blobs. Keep the
    // transferred source intact; this temporary copy dies after compressed blobs exist.
    const parsed = vendorParser()(data.slice(0))
    if (parsed instanceof Error || parsed.width !== checked.width || parsed.height !== checked.height || parsed.frames.length !== checked.frames.length) corrupted()
    const frames = checked.frames.map((raw, index): APNGFrameDescriptor => {
      const frame = parsed.frames[index]!
      if (!(frame.imageData instanceof Blob) || !frame.imageData.size || frame.width !== raw.width || frame.height !== raw.height || frame.left !== raw.left || frame.top !== raw.top) corrupted()
      // Restore the container's real delay (including zero) and first PREVIOUS;
      // apng-js otherwise applies its own player-specific timing/disposal policy.
      return { width: raw.width, height: raw.height, left: raw.left, top: raw.top,
        durationMs: raw.durationMs, disposeOp: raw.disposeOp, blendOp: raw.blendOp, imageData: frame.imageData }
    })
    return { width: checked.width, height: checked.height, frameCount: frames.length, loopCount: checked.loopCount, frames }
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError('CORRUPTED_FILE', { cause: error })
  }
}
