import type { DecodedFrame } from '../media/frame'
import type { Renderer, Viewport } from './renderer'
import { MediaError } from '../media/errors'
import type { ViewportSnapshot } from './viewport-controller'

const MAX_SOURCE_EDGE = 16_384
const MAX_SOURCE_PIXELS = 16 * 1024 * 1024
const MAX_BACKING_EDGE = 8_192
const MAX_BACKING_PIXELS = 16 * 1024 * 1024

/** Bound the display surface independently from zoom, CSS size and source pixels. */
export function canvasBackingSize(width: number, height: number, devicePixelRatio: number) {
  if (![width, height, devicePixelRatio].every(value => Number.isFinite(value) && value > 0)) throw new MediaError('OUT_OF_MEMORY')
  const ratio = Math.min(devicePixelRatio, MAX_BACKING_EDGE / width, MAX_BACKING_EDGE / height,
    Math.sqrt(MAX_BACKING_PIXELS / width / height))
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) }
}

interface RedrawScheduler {
  request(callback: FrameRequestCallback): number
  cancel(id: number): void
}

type DisplayContext = Pick<CanvasRenderingContext2D, 'setTransform' | 'clearRect' | 'drawImage'>
interface DisplayCanvas {
  width: number
  height: number
  getContext(contextId: '2d'): DisplayContext | null
}

export function canvasTransform(view: Viewport, width: number, height: number) {
  const scale = Math.min(view.width / width, view.height / height) * view.zoom
  return { scale, x: (view.width - width * scale) / 2 + view.panX, y: (view.height - height * scale) / 2 + view.panY }
}

export class CanvasRenderer implements Renderer {
  private readonly source = document.createElement('canvas')
  private readonly context: DisplayContext
  private viewport: Viewport = { width: 1, height: 1, devicePixelRatio: 1, zoom: 1, panX: 0, panY: 0 }
  private transform: Pick<ViewportSnapshot, 'scale' | 'offsetX' | 'offsetY'> | null = null
  private hasFrame = false
  private pendingDraw: number | null = null
  private disposed = false
  constructor(private readonly canvas: DisplayCanvas, private readonly scheduler: RedrawScheduler = {
    request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id),
  }) {
    const context = canvas.getContext('2d')
    if (!context) throw new MediaError('VIEWER_RUNTIME_UNAVAILABLE')
    this.context = context
  }
  setViewport(viewport: Viewport) {
    if (this.disposed) return
    this.viewport = viewport
    this.transform = null
    this.resizeBacking()
    this.invalidate()
  }
  /** Preferred display transform in image-to-CSS-pixel coordinates. */
  setTransform(viewport: ViewportSnapshot, devicePixelRatio: number) {
    if (this.disposed) return
    this.viewport = { width: viewport.viewportWidth, height: viewport.viewportHeight, devicePixelRatio, zoom: 1, panX: 0, panY: 0 }
    this.transform = viewport
    this.resizeBacking()
    this.invalidate()
  }
  render(frame: DecodedFrame) {
    if (!frame.image) throw new MediaError('DECODE_FAILED')
    this.renderImage(frame.image, frame.width, frame.height)
  }
  /** Synchronous borrow/copy: no ImageBitmap or cache-owned frame is retained. */
  renderImage(image: ImageBitmap | ImageData, width: number, height: number) {
    if (this.disposed) return
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE || width * height > MAX_SOURCE_PIXELS) throw new MediaError('OUT_OF_MEMORY')
    if (this.source.width !== width) this.source.width = width
    if (this.source.height !== height) this.source.height = height
    const context = this.source.getContext('2d')
    if (!context) throw new MediaError('VIEWER_RUNTIME_UNAVAILABLE')
    context.clearRect(0, 0, width, height)
    if (image instanceof ImageData) context.putImageData(image, 0, 0)
    else context.drawImage(image, 0, 0)
    this.hasFrame = true
    // Playback has its own clock. Consume any pending viewport invalidation here
    // rather than keeping a second animation loop alive or drawing the same frame twice.
    this.cancelDraw()
    this.draw()
  }
  private resizeBacking() {
    const backing = canvasBackingSize(this.viewport.width, this.viewport.height, this.viewport.devicePixelRatio)
    if (this.canvas.width !== backing.width) this.canvas.width = backing.width
    if (this.canvas.height !== backing.height) this.canvas.height = backing.height
  }
  private invalidate() {
    if (this.pendingDraw !== null) return
    this.pendingDraw = this.scheduler.request(() => { this.pendingDraw = null; if (!this.disposed) this.draw() })
  }
  private cancelDraw() {
    if (this.pendingDraw !== null) this.scheduler.cancel(this.pendingDraw)
    this.pendingDraw = null
  }
  private draw() {
    this.context.setTransform(1, 0, 0, 1, 0, 0)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!this.hasFrame) return
    const view = this.viewport
    const transform = this.transform ? { scale: this.transform.scale, x: this.transform.offsetX, y: this.transform.offsetY }
      : canvasTransform(view, this.source.width, this.source.height)
    this.context.setTransform(this.canvas.width / view.width, 0, 0, this.canvas.height / view.height, 0, 0)
    this.context.drawImage(this.source, transform.x, transform.y, this.source.width * transform.scale, this.source.height * transform.scale)
  }
  clear() { this.cancelDraw(); this.hasFrame = false; this.source.width = this.source.height = 1; this.draw() }
  dispose() { this.clear(); this.disposed = true; this.canvas.width = this.canvas.height = 1 }
}
