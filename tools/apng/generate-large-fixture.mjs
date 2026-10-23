import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { encodePNG } from './generate-fixtures.mjs'

// Original synthetic media. Generated binaries stay ignored in .tools; this is
// a dimensions/resource-policy regression, not a copy of the user's phone file.
const directory = new URL('../../.tools/fixtures/', import.meta.url)
const solid = (width, height, rgba) => Buffer.alloc(width * height * 4).fill(Buffer.from(rgba))

export async function generateLargeFixtures() {
  await mkdir(directory, { recursive: true })
  const width = 1280, height = 1910
  const frames = [{ width, height, rgba: solid(width, height, [12, 28, 44, 255]) }]
  for (let index = 1; index < 12; index++) frames.push({
    width: 128, height: 192,
    left: 64 + index * 80, top: 96 + index * 120,
    rgba: solid(128, 192, [index * 19, 255 - index * 13, index * 7, index % 2 ? 255 : 160]),
    disposeOp: index % 3 === 1 ? 2 : index % 3 === 2 ? 1 : 0,
    blendOp: index % 2,
    delayNum: 10, delayDen: 100,
  })
  const cases = [
    { name: 'large-apng-1280x1910.png', spec: { width, height, frames },
      purpose: 'Same canvas dimensions as the reported phone APNG; synthetic compressed content and frame count.' },
    { name: 'over-limit-apng-4096x1025.png', spec: { width: 4096, height: 1025, frames: [
      { width: 4096, height: 1025, rgba: solid(4096, 1025, [32, 48, 64, 255]) },
      { width: 1, height: 1, rgba: Buffer.from([255, 0, 0, 255]) },
    ] }, purpose: 'One full RGBA canvas exceeds 16 MiB; reject by policy before decode.' },
  ]
  const summary = []
  for (const { name, spec, purpose } of cases) {
    const bytes = encodePNG(spec)
    await writeFile(new URL(name, directory), bytes)
    summary.push({ fixture: name, width: spec.width, height: spec.height,
      frames: spec.frames.length, encodedBytes: bytes.length,
      fullRGBABytes: spec.width * spec.height * 4, purpose })
  }
  return summary
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await generateLargeFixtures(), null, 2))
}
