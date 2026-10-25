// Original, generated inputs stay ignored; never copied to public/ or dist/.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js'
import { renderFixtures } from './fixture-paint.mjs'
import { launchBrowser } from './browser.mjs'

export async function generateFixtures(evaluate, folder = resolve('.tools/creation')) {
  await mkdir(folder, { recursive: true })
  const manifest = { originalProgrammaticSources: true, groups: {}, archives: {} }
  const specs = [
    ['small-200', { count: 200, width: 320, height: 240 }],
    ['large-10', { count: 10, width: 1024, height: 1024 }],
    ['boundary-4', { count: 4, width: 2048, height: 2048 }],
    ['quality-flat', { count: 3, width: 384, height: 256, kind: 'flat' }],
    ['quality-gradient', { count: 3, width: 384, height: 256, kind: 'gradient' }],
    ['quality-high-color', { count: 3, width: 384, height: 256, kind: 'high-color' }],
    ['mixed-jpeg', { count: 1, width: 32, height: 24, kind: 'solid', type: 'image/jpeg', prefix: 'red' }],
    ['mixed-png', { count: 1, width: 16, height: 12, kind: 'transparent', prefix: 'transparent' }],
    ['mixed-webp', { count: 1, width: 24, height: 16, kind: 'solid', type: 'image/webp', prefix: 'webp' }],
    ['side-too-large', { count: 2, width: 2049, height: 32, kind: 'solid' }],
  ]
  for (const [group, spec] of specs) {
    console.log(`Generate original fixtures: ${group}`)
    const rows = await evaluate(`(${renderFixtures.toString()})(${JSON.stringify(spec)})`, 90_000)
    const directory = join(folder, 'fixtures', group); await mkdir(directory, { recursive: true })
    const paths = [], sizes = []
    for (const row of rows) {
      const path = join(directory, row.name), bytes = Buffer.from(row.base64, 'base64')
      await writeFile(path, bytes); paths.push(path); sizes.push(bytes.length)
    }
    manifest.groups[group] = { ...spec, files: paths, sourceBytes: sizes.reduce((sum, size) => sum + size, 0), maxSourceBytes: Math.max(...sizes) }
  }
  const small = manifest.groups['small-200'].files
  await copyFile(small[0], join(folder, 'fixtures', 'small-200', 'frame-201.png'))
  manifest.groups['small-201'] = { files: [...small, join(folder, 'fixtures', 'small-200', 'frame-201.png')], count: 201 }
  const corrupted = Buffer.from(await readFile(manifest.groups['mixed-png'].files[0]))
  for (let p = 8; p + 12 <= corrupted.length;) {
    const length = corrupted.readUInt32BE(p), tag = corrupted.toString('ascii', p + 4, p + 8)
    if (tag === 'IDAT' && length) { corrupted[p + 8] ^= 0xff; break }
    p += length + 12
  }
  const bad = join(folder, 'fixtures', 'corrupt.png'); await writeFile(bad, corrupted)
  manifest.corruptPNG = bad
  const oversized = join(folder, 'fixtures', 'encoded-source-over-16MiB.png')
  await writeFile(oversized, Buffer.alloc(16 * 1024 * 1024 + 1))
  manifest.oversizedSource = oversized // Admission must reject by size before reading/decoding.
  const wrongName = join(folder, 'fixtures', 'png-with-wrong-extension.jpg')
  await copyFile(manifest.groups['mixed-png'].files[0], wrongName); manifest.wrongExtension = wrongName
  const longName = join(folder, 'fixtures', 'a-very-long-original-programmatic-static-image-filename-that-must-not-hide-row-actions-or-overflow-the-small-mobile-viewport.png')
  await copyFile(small[0], longName); manifest.longFilename = longName

  const zipOptions = { useWebWorkers: false, useCompressionStream: false, level: 0, lastModDate: new Date('2024-01-01T00:00:00Z'), extendedTimestamp: false, ntfsTimestamp: false }
  for (const [name, paths] of [['mobile-40.zip', small.slice(0, 40)], ['mobile-10-large.zip', manifest.groups['large-10'].files],
    ['mixed-static.zip', [manifest.groups['mixed-jpeg'].files[0], manifest.groups['mixed-png'].files[0], manifest.groups['mixed-webp'].files[0]]]]) {
    const writer = new ZipWriter(new BlobWriter('application/zip'), zipOptions)
    for (const [index, path] of paths.entries()) {
      const bytes = await readFile(path), extension = path.split('.').at(-1)
      await writer.add(`frame-${String(index + 1).padStart(3, '0')}.${extension}`, new BlobReader(new Blob([bytes])), zipOptions)
    }
    const bytes = Buffer.from(await (await writer.close()).arrayBuffer())
    await writeFile(join(folder, name), bytes)
    manifest.archives[name] = { bytes: bytes.length, entries: paths.length }
  }
  await writeFile(join(folder, 'fixtures.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const browser = await launchBrowser()
  try {
    const manifest = await generateFixtures(browser.evaluate)
    console.log(JSON.stringify({ generatedGroups: Object.keys(manifest.groups).length, archives: manifest.archives, destination: '.tools/creation' }))
  } finally { await browser.close() }
}
