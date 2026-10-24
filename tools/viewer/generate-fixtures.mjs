// Original acceptance artwork only. ZIP creation and media construction are test tooling.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js'

const ignored = resolve('.tools/fixtures'), fixtureFolder = resolve('tests/fixtures/validation/viewer')
await mkdir(ignored, { recursive: true }); await mkdir(fixtureFolder, { recursive: true })
const original = await readFile('tests/fixtures/zip/original-two-frame.webp')
const frames = [], metadata = []
for (let offset = 12; offset < original.length;) {
  const size = original.readUInt32LE(offset + 4), end = offset + 8 + size + size % 2
  const chunk = Buffer.from(original.subarray(offset, end))
  if (chunk.toString('ascii', 0, 4) === 'ANMF') { chunk.writeUIntLE(20, 20, 3); frames.push(chunk) }
  else metadata.push(chunk)
  offset = end
}
if (frames.length !== 2) throw new Error('Unexpected original WebP fixture')
const body = Buffer.concat([Buffer.from('WEBP'), ...metadata, ...Array.from({ length: 200 }, (_, i) => frames[i % 2])])
const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(body.length, 4)
const longWebP = Buffer.concat([header, body])
await writeFile(join(ignored, 'viewer-long.webp'), longWebP)
await writeFile(join(fixtureFolder, 'long.webp'), longWebP)

const files = [
  ['photos/sample.jpg', await readFile('tests/fixtures/static/quadrants.jpg')],
  ['animations/sample.gif', await readFile('tests/fixtures/gif/previous.gif')],
  ['photos/sample.png', await readFile('tests/fixtures/static/quadrants.png')],
  ['animations/sample.png', await readFile('tests/fixtures/apng/full-infinite.png')],
  ['photos/sample.webp', await readFile('tests/fixtures/static/quadrants.webp')],
  ['animations/sample.webp', longWebP],
]
const options = { useWebWorkers: false, useCompressionStream: false, lastModDate: new Date('2024-01-01T00:00:00Z'),
  rawLastModDate: 0x58210000, extendedTimestamp: false, ntfsTimestamp: false, dataDescriptor: false }
const writer = new ZipWriter(new BlobWriter('application/zip'), options)
for (const [name, data] of files) await writer.add(name, new BlobReader(new Blob([data])), options)
const archive = Buffer.from(await (await writer.close()).arrayBuffer())
await writeFile(join(ignored, 'viewer-mixed.zip'), archive)
await writeFile(join(fixtureFolder, 'mixed-media.zip'), archive)
await writeFile(join(fixtureFolder, 'orientation-6.jpg'), await readFile('tests/fixtures/static/orientation-6.jpg'))
console.log(JSON.stringify({ originalWebPFrames: 200, webpBytes: longWebP.length, zipEntries: files.length, zipBytes: archive.length }))
