import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

// Original, deterministic tiny conformance fixtures; no external image content.
const directory = new URL('../../tests/fixtures/apng/', import.meta.url)
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
export function pngChunk(type, payload) {
  const result = Buffer.alloc(payload.length + 12)
  result.writeUInt32BE(payload.length)
  result.write(type, 4, 'ascii')
  result.set(payload, 8)
  let crc = 0xffffffff
  for (const byte of result.subarray(4, -4)) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4)
  return result
}

function compressed(frame) {
  const raw = Buffer.alloc(frame.height * (frame.width * 4 + 1))
  for (let row = 0; row < frame.height; row++) raw.set(frame.rgba.slice(row * frame.width * 4, (row + 1) * frame.width * 4), row * (frame.width * 4 + 1) + 1)
  return deflateSync(raw, { level: 9 })
}

export function encodePNG({ width, height, frames, loopCount = 0, hiddenDefault, staticOnly = false }) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 6
  const chunks = [signature, pngChunk('IHDR', header)]
  if (!staticOnly) {
    const animation = Buffer.alloc(8)
    animation.writeUInt32BE(frames.length); animation.writeUInt32BE(loopCount, 4)
    chunks.push(pngChunk('acTL', animation))
  }
  if (hiddenDefault) chunks.push(pngChunk('IDAT', compressed({ width, height, rgba: hiddenDefault })))
  let sequence = 0
  frames.forEach((frame, index) => {
    if (!staticOnly) {
      const control = Buffer.alloc(26)
      control.writeUInt32BE(sequence++)
      control.writeUInt32BE(frame.width, 4); control.writeUInt32BE(frame.height, 8)
      control.writeUInt32BE(frame.left ?? 0, 12); control.writeUInt32BE(frame.top ?? 0, 16)
      control.writeUInt16BE(frame.delayNum ?? 10, 20); control.writeUInt16BE(frame.delayDen ?? 100, 22)
      control[24] = frame.disposeOp ?? 0; control[25] = frame.blendOp ?? 0
      chunks.push(pngChunk('fcTL', control))
    }
    if (!hiddenDefault && index === 0) chunks.push(pngChunk('IDAT', compressed(frame)))
    else {
      const pixels = compressed(frame), payload = Buffer.alloc(4 + pixels.length)
      payload.writeUInt32BE(sequence++); payload.set(pixels, 4)
      chunks.push(pngChunk('fdAT', payload))
    }
  })
  chunks.push(pngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(chunks)
}

const red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255], transparent = [0, 0, 0, 0]
const fill = (color, pixels = 6) => Array.from({ length: pixels }, () => color).flat()
const full = (color, extra = {}) => ({ width: 3, height: 2, rgba: fill(color), ...extra })
const patch = (color, left, top, extra = {}) => ({ width: 1, height: 1, left, top, rgba: color, ...extra })
const specs = {
  'full-infinite.png': { width: 3, height: 2, frames: [full(red, { delayNum: 2 }), full(blue, { delayNum: 4 })] },
  'full-finite.png': { width: 3, height: 2, loopCount: 2, frames: [full(red), full(blue)] },
  'composition.png': { width: 3, height: 2, frames: [
    full(red),
    patch(transparent, 1, 0),
    patch([0, 0, 255, 128], 0, 0, { blendOp: 1 }),
    patch(green, 2, 0, { disposeOp: 1 }),
    patch(blue, 0, 1, { disposeOp: 2 }),
    patch(green, 2, 1, { blendOp: 1 }),
    patch(transparent, 1, 1),
    full(transparent),
  ] },
  'hidden-default.png': { width: 3, height: 2, hiddenDefault: fill([255, 0, 255, 255]), frames: [patch(red, 0, 0), patch(blue, 2, 1)] },
  'first-previous.png': { width: 3, height: 2, frames: [full(red, { disposeOp: 2 }), patch(green, 2, 1, { blendOp: 1 })] },
  'delays.png': { width: 3, height: 2, loopCount: 1, frames: [full(red, { delayNum: 0, delayDen: 0 }), full(green, { delayNum: 3, delayDen: 0 }), full(blue, { delayNum: 1, delayDen: 1000 })] },
  'static.png': { width: 3, height: 2, staticOnly: true, frames: [full(red)] },
  'long-bounded.png': { width: 64, height: 64, frames: Array.from({ length: 100 }, (_, index) => index === 0
    ? { width: 64, height: 64, rgba: fill(red, 64 * 64) }
    : patch(index % 2 ? blue : green, index % 64, Math.floor(index / 64))) },
}

// Deliberately explicit expected full canvases, independent of compositor code.
const expectedComposition = [
  fill(red),
  [...red, ...transparent, ...red, ...red, ...red, ...red],
  [127, 0, 128, 255, ...transparent, ...red, ...red, ...red, ...red],
  [127, 0, 128, 255, ...transparent, ...green, ...red, ...red, ...red],
  [127, 0, 128, 255, ...transparent, ...transparent, ...blue, ...red, ...red],
  [127, 0, 128, 255, ...transparent, ...transparent, ...red, ...red, ...green],
  [127, 0, 128, 255, ...transparent, ...transparent, ...red, ...transparent, ...green],
  fill(transparent),
]
const expectedCanvases = {
  'full-infinite.png': [fill(red), fill(blue)],
  'full-finite.png': [fill(red), fill(blue)],
  'composition.png': expectedComposition,
  'hidden-default.png': [[...red, ...fill(transparent, 5)], [...red, ...fill(transparent, 4), ...blue]],
  'first-previous.png': [fill(red), [...fill(transparent, 5), ...green]],
  'delays.png': [fill(red), fill(green), fill(blue)],
}

export async function generateFixtures() {
  await mkdir(directory, { recursive: true })
  const expectations = {}
  for (const [name, spec] of Object.entries(specs)) {
    const data = encodePNG(spec)
    await writeFile(new URL(name, directory), data)
    if (expectedCanvases[name]) expectations[name] = {
      width: spec.width, height: spec.height, frameCount: spec.frames.length, loopCount: spec.loopCount ?? 0,
      frames: spec.frames.map((frame, index) => ({ width: frame.width, height: frame.height,
        left: frame.left ?? 0, top: frame.top ?? 0, disposeOp: frame.disposeOp ?? 0, blendOp: frame.blendOp ?? 0,
        durationMs: (frame.delayNum ?? 10) * 1000 / ((frame.delayDen ?? 100) || 100), rgba: expectedCanvases[name][index] })),
    }
    process.stdout.write(`${name}: ${data.length} bytes\n`)
  }
  await writeFile(new URL('expectations.json', directory), `${JSON.stringify(expectations, null, 2)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generateFixtures()
