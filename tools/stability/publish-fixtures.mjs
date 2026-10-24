// Stage original acceptance inputs in the repository corpus, never the website.
// The historical command name is retained; the 100 MiB ZIP stays ignored.
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const media = JSON.parse(await readFile('.tools/fixtures/stability/manifest.json', 'utf8')).metadata
const archives = JSON.parse(await readFile('.tools/fixtures/stability/archive-manifest.json', 'utf8')).archives
const directory = 'tests/fixtures/validation/stability'
await mkdir(directory, { recursive: true })
const samples = []
for (const [key, name] of [
  ['boundaryJPEG', 'boundary-2048.jpg'], ['boundaryPNG', 'boundary-2048.png'], ['boundaryWebP', 'boundary-2048.webp'],
  ['phone12MPJPEG', 'phone-12mp-rejected.jpg'], ['longWebP', 'long-1000.webp'],
  ['longAPNG', 'long-1000.png'], ['longGIF', 'long-1000.gif'], ['largeAPNG', 'large-2048-apng.png'],
]) {
  const { path, ...metadata } = media[key]
  await copyFile(path, join(directory, name))
  samples.push({ name, ...metadata, nativeEncoder: undefined })
}
for (const [key, name] of [['manyEntries', 'many-entries.zip'], ['manyMedia', 'mixed-96.zip'], ['recovery', 'recovery.zip']]) {
  const { path, ...metadata } = archives[key]
  await copyFile(path, join(directory, name)); samples.push({ name, ...metadata })
}
await writeFile(join(directory, 'samples.json'), JSON.stringify({ license: 'CC0-1.0',
  source: 'Original AniView generated solid pixels/quadrants and existing original conformance media. No private user files.',
  generators: ['tools/stability/media-fixtures.mjs', 'tools/stability/archive-fixtures.mjs', 'tools/stability/publish-fixtures.mjs'], samples }, null, 2) + '\n')
console.log(JSON.stringify({ samples: samples.length, bytes: samples.reduce((sum, sample) => sum + (sample.bytes ?? sample.encodedBytes), 0) }))
