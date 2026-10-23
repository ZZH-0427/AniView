// Generated stress archives remain ignored; no user media or downloaded artwork.
// node tools/stability/archive-fixtures.mjs [--large]
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomFillSync } from 'node:crypto'
import { ZipWriter, BlobWriter, BlobReader, Uint8ArrayReader } from '@zip.js/zip.js'

const options = { useWebWorkers: false, useCompressionStream: false,
  lastModDate: new Date('2024-01-01T00:00:00Z'), rawLastModDate: 0x58210000,
  extendedTimestamp: false, ntfsTimestamp: false, dataDescriptor: false }

export async function generateArchiveFixtures({ large = false, output = resolve('.tools/fixtures/stability') } = {}) {
  await mkdir(output, { recursive: true })
  const sources = [
    ['animation.gif', await readFile('tests/fixtures/gif/previous.gif')],
    ['animation.webp', await readFile('tests/fixtures/zip/original-two-frame.webp')],
    ['animation.png', await readFile('tests/fixtures/apng/full-infinite.png')],
    ['photo.jpg', await readFile('tests/fixtures/static/quadrants.jpg')],
    ['photo.png', await readFile('tests/fixtures/static/quadrants.png')],
    ['photo.webp', await readFile('tests/fixtures/static/quadrants.webp')],
  ]
  const archives = {}
  const archive = async (key, filename, items) => {
    const writer = new ZipWriter(new BlobWriter('application/zip'), options)
    for (const item of items) await writer.add(item.name, new BlobReader(new Blob([item.bytes])), { ...options, ...item.options })
    const data = Buffer.from(await (await writer.close()).arrayBuffer())
    const path = join(output, filename)
    await writeFile(path, data)
    archives[key] = { path, encodedBytes: data.length, entries: items.length,
      declaredBytes: items.reduce((sum, item) => sum + item.bytes.length, 0) }
    return data
  }
  await archive('manyEntries', 'archive-1008-entries.zip', [
    ...Array.from({ length: 1000 }, (_, index) => ({ name: `metadata/note-${String(index).padStart(4, '0')}.txt`, bytes: Buffer.from(String(index)) })),
    ...Array.from({ length: 8 }, (_, index) => ({ name: `images/${index}-${sources[index % 6][0]}`, bytes: sources[index % 6][1] })),
  ])
  await archive('manyMedia', 'archive-96-media.zip', Array.from({ length: 96 }, (_, index) => ({
    name: `album/${String(index).padStart(3, '0')}-${sources[index % 6][0]}`, bytes: sources[index % 6][1],
  })))
  const recovery = await archive('recovery', 'archive-recovery.zip', [
    { name: '01-good.gif', bytes: sources[0][1] },
    { name: '02-broken.webp', bytes: sources[1][1].subarray(0, 21) },
    { name: '03-encrypted.webp', bytes: sources[1][1], options: { password: 'AniView-stability-test', zipCrypto: true } },
    { name: '04-good.jpg', bytes: sources[3][1] },
    { name: '05-unsupported.svg', bytes: Buffer.from('<svg>This format is not supported.</svg>') },
    { name: '06-good.png', bytes: sources[2][1] },
    { name: '07-bad-crc.gif', bytes: sources[0][1], options: { level: 0 } },
    { name: '08-good.webp', bytes: sources[5][1] },
    { name: 'unsupported.bin', bytes: Buffer.from('Non-media extensions remain filtered by the existing policy.') },
  ])
  // Damage only a stored entry's payload, retaining original CRC and safe siblings.
  const target = Buffer.from('07-bad-crc.gif')
  for (let offset = 0; offset <= recovery.length - 30; offset++) {
    if (recovery.readUInt32LE(offset) !== 0x04034b50) continue
    const nameLength = recovery.readUInt16LE(offset + 26), extraLength = recovery.readUInt16LE(offset + 28)
    if (!recovery.subarray(offset + 30, offset + 30 + nameLength).equals(target)) continue
    recovery[offset + 30 + nameLength + extraLength + 13] ^= 1
    await writeFile(archives.recovery.path, recovery)
    break
  }
  for (const [key, source] of [['truncated', 'truncated.zip'], ['unsupportedCompression', 'unsupported-compression.zip']]) {
    const data = await readFile(join('tests/fixtures/zip', source)), path = join(output, `archive-${source}`)
    await writeFile(path, data)
    archives[key] = { path, encodedBytes: data.length }
  }
  const central = Buffer.from(recovery)
  const directory = central.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  central.writeUInt32LE(0xdeadbeef, directory)
  const centralPath = join(output, 'archive-bad-directory.zip')
  await writeFile(centralPath, central)
  archives.badDirectory = { path: centralPath, encodedBytes: central.length }

  if (large) {
    // STORE avoids a fake compressible bomb:100MiB of explicitly bounded random
    // non-media padding, plus six tiny real media entries for lazy navigation.
    const writer = new ZipWriter(new BlobWriter('application/zip'), options)
    for (let index = 0; index < 100; index++) {
      const chunk = randomFillSync(new Uint8Array(1024 * 1024))
      await writer.add(`padding/${String(index).padStart(3, '0')}.bin`, new Uint8ArrayReader(chunk), { ...options, level: 0 })
    }
    for (const [name, bytes] of sources) await writer.add(`images/${name}`, new BlobReader(new Blob([bytes])), options)
    const path = join(output, 'archive-100MiB.zip')
    await writeFile(path, Buffer.from(await (await writer.close()).arrayBuffer()))
    archives.large = { path, encodedBytes: (await stat(path)).size, entries: 106,
      mediaEntries: 6, declaredBytes: 100 * 1024 * 1024 + sources.reduce((sum, [, bytes]) => sum + bytes.length, 0) }
  }
  const manifest = { originalArtwork: true, generatedLargeArchive: large,
    passwordForEncryptedTestOnly: 'AniView-stability-test', archives }
  await writeFile(join(output, 'archive-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  console.log(JSON.stringify(await generateArchiveFixtures({ large: process.argv.includes('--large') }), null, 2))
