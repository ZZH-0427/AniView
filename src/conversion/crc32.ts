const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

/** PNG CRC covers chunk type and data, excluding the length and stored CRC. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.byteLength): number {
  let crc = 0xffffffff
  for (let i = start; i < end; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]!) & 255]!
  return (crc ^ 0xffffffff) >>> 0
}
