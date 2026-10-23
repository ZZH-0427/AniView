import { afterEach, describe, expect, it, vi } from 'vitest'
import { APNGCompositor } from './apng-compositor'
import type { APNGCompositionSurface, APNGPixelRegion } from './apng-compositor'
import type { APNGFrameDescriptor } from './apng-parser'

type RGBA = readonly [number, number, number, number]
const RED: RGBA = [255, 0, 0, 255]
const BLUE: RGBA = [0, 0, 255, 255]
const GREEN: RGBA = [0, 255, 0, 255]
const CLEAR: RGBA = [0, 0, 0, 0]
type Frame = Pick<APNGFrameDescriptor, 'left' | 'top' | 'width' | 'height' | 'disposeOp' | 'blendOp'>

class PixelsBitmap implements ImageBitmap {
  readonly close = vi.fn()
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
  constructor(readonly width: number, readonly height: number, pixels: readonly RGBA[]) {
    this.pixels = new Uint8ClampedArray(pixels.flat())
  }
}

/** CPU raster test surface, with independent straight-alpha source-over math.
 * Actual OffscreenCanvas integration is also checked by the browser harness. */
class PixelSurface implements APNGCompositionSurface {
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
  readonly dispose = vi.fn()
  readonly readRegions: { width: number; height: number }[] = []
  constructor(readonly width: number, readonly height: number) {
    this.pixels = new Uint8ClampedArray(width * height * 4)
  }
  clear(left: number, top: number, width: number, height: number) {
    for (let y = top; y < top + height; y++) {
      this.pixels.fill(0, (y * this.width + left) * 4, (y * this.width + left + width) * 4)
    }
  }
  draw(bitmap: ImageBitmap, left: number, top: number) {
    if (!(bitmap instanceof PixelsBitmap)) throw new Error('Test bitmap required')
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        const source = (y * bitmap.width + x) * 4
        const target = ((y + top) * this.width + x + left) * 4
        const alpha = bitmap.pixels[source + 3]! / 255
        const oldAlpha = this.pixels[target + 3]! / 255
        const outAlpha = alpha + oldAlpha * (1 - alpha)
        for (let channel = 0; channel < 3; channel++) {
          this.pixels[target + channel] = outAlpha === 0 ? 0
            : (bitmap.pixels[source + channel]! * alpha
              + this.pixels[target + channel]! * oldAlpha * (1 - alpha)) / outAlpha
        }
        this.pixels[target + 3] = outAlpha * 255
      }
    }
  }
  read(left: number, top: number, width: number, height: number): APNGPixelRegion {
    this.readRegions.push({ width, height })
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      const start = ((y + top) * this.width + left) * 4
      data.set(this.pixels.subarray(start, start + width * 4), y * width * 4)
    }
    return { width, height, data }
  }
  write(region: APNGPixelRegion, left: number, top: number) {
    for (let y = 0; y < region.height; y++) {
      const row = region.data.subarray(y * region.width * 4, (y + 1) * region.width * 4)
      this.pixels.set(row, ((top + y) * this.width + left) * 4)
    }
  }
}

function setup(width = 3, height = 2) {
  const surface = new PixelSurface(width, height)
  const compositor = new APNGCompositor(width, height, () => surface)
  return { compositor, surface }
}
function frame(width: number, height: number, changes: Partial<Frame> = {}): Frame {
  return { left: 0, top: 0, width, height, disposeOp: 0, blendOp: 0, ...changes }
}
function pixels(buffer: ArrayBuffer) { return [...new Uint8ClampedArray(buffer)] }
function expected(...colors: RGBA[]) { return colors.flat() }

afterEach(() => vi.unstubAllGlobals())

describe('APNG compositor pixel semantics', () => {
  it('SOURCE replaces transparent pixels while retaining pixels outside the offset rectangle', () => {
    const { compositor } = setup()
    const first = compositor.compose(new PixelsBitmap(3, 2, Array(6).fill(RED)), frame(3, 2), 0)
    const bitmap = new PixelsBitmap(2, 1, [CLEAR, BLUE])
    const result = compositor.compose(bitmap, frame(2, 1, { left: 1, top: 1 }), 1)
    expect(pixels(result)).toEqual(expected(RED, RED, RED, RED, CLEAR, BLUE))
    expect(pixels(first)).toEqual(expected(RED, RED, RED, RED, RED, RED))
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('OVER uses alpha and leaves the canvas intact beneath transparent pixels', () => {
    const { compositor } = setup(2, 1)
    compositor.compose(new PixelsBitmap(2, 1, [BLUE, BLUE]), frame(2, 1), 0)
    const result = compositor.compose(new PixelsBitmap(2, 1, [[255, 0, 0, 128], CLEAR]), frame(2, 1, { blendOp: 1 }), 1)
    expect(pixels(result)).toEqual(expected([128, 0, 127, 255], BLUE))
  })

  it('NONE retains previous content before a later partial frame is drawn', () => {
    const { compositor } = setup(2, 1)
    compositor.compose(new PixelsBitmap(1, 1, [RED]), frame(1, 1), 0)
    const result = compositor.compose(new PixelsBitmap(1, 1, [GREEN]), frame(1, 1, { left: 1 }), 1)
    expect(pixels(result)).toEqual(expected(RED, GREEN))
  })

  it('BACKGROUND clears only the previous rectangle before the next frame', () => {
    const { compositor } = setup()
    compositor.compose(new PixelsBitmap(3, 2, Array(6).fill(RED)), frame(3, 2), 0)
    const displayed = compositor.compose(new PixelsBitmap(1, 1, [BLUE]), frame(1, 1, { left: 1, top: 1, disposeOp: 1 }), 1)
    expect(pixels(displayed)).toEqual(expected(RED, RED, RED, RED, BLUE, RED))
    const result = compositor.compose(new PixelsBitmap(1, 1, [GREEN]), frame(1, 1), 2)
    expect(pixels(result)).toEqual(expected(GREEN, RED, RED, RED, CLEAR, RED))
  })

  it('PREVIOUS restores the region from before drawing the current frame', () => {
    const { compositor } = setup()
    compositor.compose(new PixelsBitmap(3, 2, Array(6).fill(RED)), frame(3, 2), 0)
    const displayed = compositor.compose(new PixelsBitmap(1, 1, [BLUE]), frame(1, 1, { left: 1, top: 1, disposeOp: 2 }), 1)
    expect(pixels(displayed)).toEqual(expected(RED, RED, RED, RED, BLUE, RED))
    expect(compositor.backupBytes).toBe(4)
    const result = compositor.compose(new PixelsBitmap(1, 1, [GREEN]), frame(1, 1), 2)
    expect(pixels(result)).toEqual(expected(GREEN, RED, RED, RED, RED, RED))
    expect(compositor.backupBytes).toBe(0)
  })

  it('first animation frame PREVIOUS is treated as BACKGROUND without taking a backup', () => {
    const { compositor, surface } = setup(2, 1)
    compositor.compose(new PixelsBitmap(2, 1, [RED, RED]), frame(2, 1, { disposeOp: 2 }), 0)
    expect(compositor.backupBytes).toBe(0)
    expect(surface.readRegions).toEqual([{ width: 2, height: 1 }])
    const result = compositor.compose(new PixelsBitmap(1, 1, [GREEN]), frame(1, 1, { left: 1 }), 1)
    expect(pixels(result)).toEqual(expected(CLEAR, GREEN))
  })

  it('keeps one region-sized PREVIOUS backup across many consecutive frames', () => {
    const { compositor } = setup()
    compositor.compose(new PixelsBitmap(3, 2, Array(6).fill(RED)), frame(3, 2), 0)
    for (let index = 1; index <= 100; index++) {
      const result = compositor.compose(new PixelsBitmap(1, 1, [BLUE]), frame(1, 1, { left: index % 3, top: 1, disposeOp: 2 }), index)
      const target = [RED, RED, RED, RED, RED, RED]
      target[3 + index % 3] = BLUE
      expect(pixels(result)).toEqual(expected(...target))
      expect(compositor.backupBytes).toBe(4)
    }
    compositor.dispose()
    expect(compositor.backupBytes).toBe(0)
  })

  it('reset clears both canvas content and pending disposal/backup', () => {
    const { compositor } = setup(2, 1)
    compositor.compose(new PixelsBitmap(2, 1, [RED, RED]), frame(2, 1), 0)
    compositor.compose(new PixelsBitmap(1, 1, [BLUE]), frame(1, 1, { disposeOp: 2 }), 1)
    expect(compositor.backupBytes).toBe(4)
    compositor.reset()
    expect(compositor.backupBytes).toBe(0)
    const result = compositor.compose(new PixelsBitmap(1, 1, [GREEN]), frame(1, 1, { left: 1 }), 0)
    expect(pixels(result)).toEqual(expected(CLEAR, GREEN))
  })

  it('closes bitmaps when validation or surface output fails', () => {
    const { compositor, surface } = setup()
    const invalid = new PixelsBitmap(1, 1, [BLUE])
    expect(() => compositor.compose(invalid, frame(1, 1, { left: 3 }), 0)).toThrow()
    expect(invalid.close).toHaveBeenCalledOnce()
    const valid = new PixelsBitmap(1, 1, [BLUE])
    vi.spyOn(surface, 'read').mockImplementationOnce(() => { throw new Error('Canvas read failed') })
    expect(() => compositor.compose(valid, frame(1, 1), 0)).toThrow('Canvas read failed')
    expect(valid.close).toHaveBeenCalledOnce()
  })

  it('dispose releases the surface once and prevents further output', () => {
    const { compositor, surface } = setup()
    compositor.dispose()
    compositor.dispose()
    expect(surface.dispose).toHaveBeenCalledOnce()
    const bitmap = new PixelsBitmap(1, 1, [RED])
    expect(() => compositor.compose(bitmap, frame(1, 1), 0)).toThrow()
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(() => compositor.reset()).toThrow()
  })

  it('reports unavailable OffscreenCanvas 2D support as a capability error', () => {
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return null } })
    expect(() => new APNGCompositor(1, 1)).toThrow(expect.objectContaining({ code: 'APNG_RUNTIME_UNAVAILABLE' }))
    vi.stubGlobal('OffscreenCanvas', class { constructor() { throw new Error('OffscreenCanvas unavailable') } })
    expect(() => new APNGCompositor(1, 1)).toThrow(expect.objectContaining({ code: 'APNG_RUNTIME_UNAVAILABLE' }))
  })
})
