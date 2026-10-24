// Test-only ZIP creation. The application never imports this writer or creates ZIPs.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js'

const folder = resolve('tests/fixtures/zip')
await mkdir(folder, { recursive: true })
const fixed = { useWebWorkers: false, useCompressionStream: false, lastModDate: new Date('2024-01-01T00:00:00Z'),
  rawLastModDate: 0x58210000, extendedTimestamp: false, ntfsTimestamp: false, dataDescriptor: false }
const gif = await readFile('tests/fixtures/gif/previous.gif')
const apng = await readFile('tests/fixtures/apng/full-infinite.png')
const chunk = (name, bytes) => {
  const header = Buffer.alloc(8); header.write(name); header.writeUInt32LE(bytes.length, 4)
  return Buffer.concat([header, bytes, ...(bytes.length % 2 ? [Buffer.alloc(1)] : [])])
}
// Original solid red/green 2x2 pixels encoded losslessly by Edge's canvas encoder.
// These VP8L payloads omit the encoder's unrelated ICC profile. No copied artwork.
const payloads = ['2f014000000710fd8ffe0722a2ff0100', '2f014000000750c088fe0722a2ff0100']
const extended = Buffer.alloc(10); extended[0] = 2; extended.writeUIntLE(1, 4, 3); extended.writeUIntLE(1, 7, 3)
const body = Buffer.concat([Buffer.from('WEBP'), chunk('VP8X', extended), chunk('ANIM', Buffer.alloc(6)),
  ...payloads.map(hex => {
    const frame = Buffer.alloc(16); frame.writeUIntLE(1, 6, 3); frame.writeUIntLE(1, 9, 3); frame.writeUIntLE(100, 12, 3); frame[15] = 2
    return chunk('ANMF', Buffer.concat([frame, chunk('VP8L', Buffer.from(hex, 'hex'))]))
  })])
const riff = Buffer.alloc(8); riff.write('RIFF'); riff.writeUInt32LE(body.length, 4)
const webp = Buffer.concat([riff, body])
await writeFile(join(folder, 'original-two-frame.webp'), webp)
const manifest = {}
async function archive(name, entries, options = {}) {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { ...fixed, ...options })
  for (const item of entries) await writer.add(item.name, item.directory ? undefined : new BlobReader(new Blob([item.data])), { ...fixed, ...item.options, directory: item.directory })
  const data = Buffer.from(await (await writer.close()).arrayBuffer())
  await writeFile(join(folder, name), data)
  manifest[name] = { encodedBytes: data.length, entries: entries.map(e => ({ name: e.name, bytes: e.data?.length ?? 0, encrypted: !!e.options?.password })) }
  return data
}
await archive('empty.zip', [])
await archive('single-gif.zip', [{ name: 'first.gif', data: gif }])
await archive('single-webp.zip', [{ name: 'second.webp', data: webp }])
await archive('single-apng.zip', [{ name: 'third.png', data: apng }])
const mixed = await archive('mixed.zip', [
  { name: 'nested/', directory: true }, { name: 'first.gif', data: gif },
  { name: 'nested/second.webp', data: webp }, { name: 'nested/third.png', data: apng },
  { name: '__MACOSX/._first.gif', data: Buffer.from('metadata') }, { name: '.DS_Store', data: Buffer.from('metadata') },
  { name: 'notes.txt', data: Buffer.from('not media') },
])
await archive('no-media.zip', [{ name: 'notes.txt', data: Buffer.from('not media') }, { name: 'folder/', directory: true }])
await archive('wrong-extension.zip', [{ name: 'really-gif.jpg', data: gif }, { name: 'without-extension', data: apng }, { name: 'fake.gif', data: Buffer.from('not an image') }])
await archive('unsafe-paths.zip', ['../escape.gif', '/absolute.gif', 'C:\\folder\\image.gif', 'safe/../nested/image.gif'].map(name => ({ name, data: gif })))
await archive('zip64.zip', [{ name: 'first.gif', data: gif, options: { zip64: true } }], { zip64: true })
for (const [name, options] of [['zipcrypto', { zipCrypto: true }], ['aes', { encryptionStrength: 3 }]])
  await archive(`encrypted-${name}.zip`, [{ name: 'private.gif', data: gif, options: { ...options, password: 'AniView-test' } }])
await archive('encrypted-mixed.zip', [
  { name: 'public.gif', data: gif }, { name: 'private.webp', data: webp, options: { password: 'AniView-test', zipCrypto: true } },
  { name: 'private.png', data: apng, options: { password: 'AniView-test', encryptionStrength: 3 } }, { name: 'public-again.gif', data: gif },
])
const stored = await archive('stored.zip', [{ name: 'first.gif', data: gif, options: { level: 0 } }])
const central = data => data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
const mutated = async (name, source, mutate) => {
  const bytes = Buffer.from(source); mutate(bytes); await writeFile(join(folder, name), bytes)
  manifest[name] = { encodedBytes: bytes.length, mutation: true }
}
await mutated('bad-crc.zip', stored, bytes => {
  const start = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28)
  bytes[start + 13] ^= 1 // corrupt payload while preserving both declared CRC fields
})
await mutated('unsupported-compression.zip', stored, bytes => { bytes.writeUInt16LE(12, 8); bytes.writeUInt16LE(12, central(bytes) + 10) })
await mutated('oversize-declared.zip', stored, bytes => { bytes.writeUInt32LE(100 * 1024 * 1024, 22); bytes.writeUInt32LE(100 * 1024 * 1024, central(bytes) + 24) })
await mutated('ratio-limit.zip', stored, bytes => { bytes.writeUInt32LE(1, 18); bytes.writeUInt32LE(1, central(bytes) + 20); bytes.writeUInt32LE(1_000_001, 22); bytes.writeUInt32LE(1_000_001, central(bytes) + 24) })
await writeFile(join(folder, 'truncated.zip'), mixed.subarray(0, mixed.length - 24))
await writeFile(join(folder, 'corrupt.zip'), Buffer.from('PK\x03\x04This ZIP header is truncated'))
await writeFile(join(folder, 'not-a-zip.zip'), Buffer.from('This is not a ZIP archive.'))
await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

// Keep historical Android acceptance samples in the test corpus, outside public/.
const acceptanceSamples = resolve('tests/fixtures/validation/zip')
await mkdir(acceptanceSamples, { recursive: true })
for (const name of ['mixed.zip', 'encrypted-mixed.zip'])
  await writeFile(join(acceptanceSamples, name), await readFile(join(folder, name)))

// Optional representative desktop smoke test; downloaded artwork remains ignored.
if (process.argv.includes('--large')) {
  const dest = resolve('.tools/fixtures'); await mkdir(dest, { recursive: true })
  const sources = [
    ['earth.gif', await readFile(join(dest, 'rotating-earth.gif'))],
    ['animation.webp', await readFile(join(dest, 'animated.webp'))],
    ['ball.png', await readFile(join(dest, 'bouncing-beach-ball.png'))],
  ]
  const writer = new ZipWriter(new BlobWriter('application/zip'), fixed)
  for (let i = 0; i < 60; i++) {
    const [name, data] = sources[i % 3]
    await writer.add(`batch/${String(i).padStart(3, '0')}-${name}`, new BlobReader(new Blob([data])), fixed)
  }
  await writeFile(join(dest, 'archive-large.zip'), Buffer.from(await (await writer.close()).arrayBuffer()))
}
console.log('Generated ZIP fixtures in tests/fixtures/zip' + (process.argv.includes('--large') ? ' and ignored 60-entry archive-large.zip' : ''))
