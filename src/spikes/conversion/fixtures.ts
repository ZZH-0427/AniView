import type { CanonicalAnimationFrame, CanonicalAnimationMetadata } from '../../conversion/model'

export type FixtureScene = 'solid' | 'transparent' | 'mixed-alpha' | 'flat' | 'gradient' | 'sparse' | 'full-change'
export interface FixtureOptions {
  readonly width: number
  readonly height: number
  readonly count: number
  readonly scene: FixtureScene
  readonly playCount: number
  readonly durations: readonly number[]
}
export interface FrameFingerprint {
  readonly index: number
  readonly durationMs: number
  readonly rgbaHash: number | null
  readonly visualHash: number | null
  readonly samples: readonly number[]
}
export type FixtureRequest =
  | { readonly id: number; readonly type: 'generate'; readonly options: FixtureOptions; readonly index: number }
  | { readonly id: number; readonly type: 'inspect'; readonly frame: CanonicalAnimationFrame; readonly metadata: CanonicalAnimationMetadata }
export type FixtureResponse =
  | { readonly id: number; readonly type: 'frame'; readonly frame: CanonicalAnimationFrame; readonly fingerprint: FrameFingerprint }
  | { readonly id: number; readonly type: 'fingerprint'; readonly fingerprint: FrameFingerprint }
  | { readonly id: number; readonly type: 'error' }

/** Scalar evidence only: no pixel/frame history. Full-frame hashing is limited to tiny fixtures. */
export function fingerprint(frame: CanonicalAnimationFrame, width: number, height: number): FrameFingerprint {
  const pixels = new Uint8Array(frame.rgba), count = width * height, samples: number[] = []
  const sampleCount = Math.min(64, count)
  for (let i = 0; i < sampleCount; i++) {
    const offset = Math.floor(i * count / sampleCount) * 4
    samples.push(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!, pixels[offset + 3]!)
  }
  let rgbaHash: number | null = null, visualHash: number | null = null
  if (count <= 16_384) {
    let raw = 2166136261, visual = 2166136261
    for (let i = 0; i < pixels.length; i++) {
      raw = Math.imul(raw ^ pixels[i]!, 16777619)
      const visible = i % 4 === 3 || pixels[i - i % 4 + 3] !== 0
      visual = Math.imul(visual ^ (visible ? pixels[i]! : 0), 16777619)
    }
    rgbaHash = raw >>> 0; visualHash = visual >>> 0
  }
  return { index: frame.index, durationMs: frame.durationMs, rgbaHash, visualHash, samples }
}

/** Original deterministic procedural pixels; no imported media or native animation playback. */
export function createFixtureFrame(options: FixtureOptions, index: number): CanonicalAnimationFrame {
  const { width, height, scene } = options, pixels = new Uint8Array(width * height * 4)
  const color = [[231, 37, 51], [31, 188, 89], [42, 79, 223]][index % 3]!
  let random = (0x6d2b79f5 + index * 977) >>> 0
  const ox = index * 7 % Math.max(1, width - 5), oy = index * 3 % Math.max(1, height - 5)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    let r = color[0]!, g = color[1]!, b = color[2]!, alpha = 255
    if (scene === 'transparent') {
      alpha = index % 3 !== 0 && x === index % width && y === index % height ? 255 : 0
      // Hidden RGB remains zero so transparent-pixel comparisons have explicit semantics.
      if (!alpha) r = g = b = 0
    } else if (scene === 'mixed-alpha') {
      r = (x * 17 + index * 31) & 255; g = (y * 29 + index * 19) & 255; b = (x + y + index * 7) & 255
      alpha = ((x + y + index) % 6) * 51
      if (!alpha) r = g = b = 0
    } else if (scene === 'gradient') {
      r = Math.round(x * 255 / Math.max(1, width - 1)); g = Math.round(y * 255 / Math.max(1, height - 1)); b = (x + y + index * 29) & 255
    } else if (scene === 'sparse') {
      if (!(x >= ox && x < ox + 5 && y >= oy && y < oy + 5)) { r = g = b = 0; alpha = 0 }
    } else if (scene === 'flat') {
      const center = Math.abs(x - width / 2) < width / 5 && Math.abs(y - height / 2) < height / 3
      if (!center) { r = 60; g = 112; b = 181 }
      if (y > height * .8) { r = 128; g = 185; b = 102 }
      if (x < 3 + index % Math.max(1, width - 2) && y < Math.max(2, height / 8)) { r = 248; g = 218; b = 136 }
    } else if (scene === 'full-change') {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5
      r = random & 255; g = random >>> 8 & 255; b = random >>> 16 & 255
    }
    pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = alpha
  }
  return { index, durationMs: options.durations[index % options.durations.length]!, rgba: pixels.buffer }
}
