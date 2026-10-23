import { MediaError } from '../../media/errors'
import type { APNGFrameDescriptor } from './apng-parser'

type FrameRectangle = Pick<APNGFrameDescriptor, 'left' | 'top' | 'width' | 'height'>
type CompositionFrame = FrameRectangle & Pick<APNGFrameDescriptor, 'blendOp' | 'disposeOp'>

export interface APNGPixelRegion {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray<ArrayBuffer>
}

/** Narrow canvas boundary; tests can exercise pixel semantics without a DOM. */
export interface APNGCompositionSurface {
  clear(left: number, top: number, width: number, height: number): void
  draw(bitmap: ImageBitmap, left: number, top: number): void
  read(left: number, top: number, width: number, height: number): APNGPixelRegion
  write(region: APNGPixelRegion, left: number, top: number): void
  dispose(): void
}

type SurfaceFactory = (width: number, height: number) => APNGCompositionSurface

function createSurface(width: number, height: number): APNGCompositionSurface {
  let canvas: OffscreenCanvas
  let context: OffscreenCanvasRenderingContext2D | null
  try {
    canvas = new OffscreenCanvas(width, height)
    context = canvas.getContext('2d', { willReadFrequently: true })
  } catch (cause) {
    throw new MediaError('APNG_RUNTIME_UNAVAILABLE', { cause })
  }
  if (!context) throw new MediaError('APNG_RUNTIME_UNAVAILABLE')
  context.globalCompositeOperation = 'source-over'
  return {
    clear: (left, top, rectWidth, rectHeight) => context.clearRect(left, top, rectWidth, rectHeight),
    draw: (bitmap, left, top) => context.drawImage(bitmap, left, top),
    read: (left, top, rectWidth, rectHeight) => context.getImageData(left, top, rectWidth, rectHeight),
    write: (region, left, top) => context.putImageData(new ImageData(region.data, region.width, region.height), left, top),
    dispose() { canvas.width = canvas.height = 1 },
  }
}

/** One composition canvas and, only for PREVIOUS, one rectangle-sized backup. */
export class APNGCompositor {
  private surface: APNGCompositionSurface | null
  private previous: (FrameRectangle & { disposeOp: 0 | 1 | 2; backup: APNGPixelRegion | null }) | null = null

  get backupBytes() { return this.previous?.backup?.data.byteLength ?? 0 }

  constructor(readonly width: number, readonly height: number, surfaceFactory: SurfaceFactory = createSurface) {
    if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)
      || !Number.isSafeInteger(width * height * 4)) throw new MediaError('CORRUPTED_FILE')
    // The parser enforces the decoded-canvas budget before this allocation.
    this.surface = surfaceFactory(width, height)
    this.surface.clear(0, 0, width, height)
  }

  /** Takes bitmap ownership, including when validation or composition fails. */
  compose(bitmap: ImageBitmap, frame: CompositionFrame, frameIndex: number): ArrayBuffer {
    try {
      const surface = this.surface
      if (!surface) throw new MediaError('DECODE_FAILED')
      if (!Number.isSafeInteger(frameIndex) || frameIndex < 0
        || ![frame.left, frame.top, frame.width, frame.height].every(Number.isSafeInteger)
        || frame.left < 0 || frame.top < 0 || frame.width <= 0 || frame.height <= 0
        || frame.width > this.width - frame.left || frame.height > this.height - frame.top
        || bitmap.width !== frame.width || bitmap.height !== frame.height
        || ![0, 1, 2].includes(frame.disposeOp) || ![0, 1].includes(frame.blendOp)) {
        throw new MediaError('CORRUPTED_FILE')
      }

      // Disposal belongs to the preceding frame, after its output was emitted.
      this.applyDisposal(surface)
      const disposeOp = frameIndex === 0 && frame.disposeOp === 2 ? 1 : frame.disposeOp
      const backup = disposeOp === 2 ? surface.read(frame.left, frame.top, frame.width, frame.height) : null

      // SOURCE replaces transparent pixels too; source-over alone cannot do so.
      if (frame.blendOp === 0) surface.clear(frame.left, frame.top, frame.width, frame.height)
      surface.draw(bitmap, frame.left, frame.top)
      this.previous = {
        left: frame.left, top: frame.top, width: frame.width, height: frame.height,
        disposeOp, backup,
      }
      // getImageData produces an independent full-canvas buffer. Its ownership
      // passes to the caller, which transfers it; the compositor retains none.
      return surface.read(0, 0, this.width, this.height).data.buffer
    } finally {
      bitmap.close()
    }
  }

  private applyDisposal(surface: APNGCompositionSurface) {
    const previous = this.previous
    this.previous = null
    if (!previous) return
    if (previous.disposeOp === 1) surface.clear(previous.left, previous.top, previous.width, previous.height)
    else if (previous.disposeOp === 2 && previous.backup) surface.write(previous.backup, previous.left, previous.top)
  }

  reset() {
    if (!this.surface) throw new MediaError('DECODE_FAILED')
    this.previous = null
    this.surface.clear(0, 0, this.width, this.height)
  }

  dispose() {
    this.previous = null
    this.surface?.dispose()
    this.surface = null
  }
}
