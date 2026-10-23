import type { DecodedFrame } from '../media/frame'
import type { Renderer, Viewport } from './renderer'
import { MediaError } from '../media/errors'

export function canvasTransform(view: Viewport, width: number, height: number) {
  const scale = Math.min(view.width / width, view.height / height) * view.zoom
  return { scale, x: (view.width - width * scale) / 2 + view.panX, y: (view.height - height * scale) / 2 + view.panY }
}

export class CanvasRenderer implements Renderer {
  private readonly source = document.createElement('canvas')
  private readonly context: CanvasRenderingContext2D
  private viewport: Viewport = { width: 1, height: 1, devicePixelRatio: 1, zoom: 1, panX: 0, panY: 0 }
  private hasFrame = false
  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (!context) throw new MediaError('DECODE_FAILED')
    this.context = context
  }
  setViewport(viewport: Viewport) {
    this.viewport = viewport
    this.canvas.width = Math.max(1, Math.round(viewport.width * viewport.devicePixelRatio))
    this.canvas.height = Math.max(1, Math.round(viewport.height * viewport.devicePixelRatio))
    this.draw()
  }
  render(frame: DecodedFrame) {
    if (!frame.image) throw new MediaError('DECODE_FAILED')
    this.source.width = frame.width
    this.source.height = frame.height
    const context = this.source.getContext('2d')
    if (!context) throw new MediaError('DECODE_FAILED')
    if (frame.image instanceof ImageData) context.putImageData(frame.image, 0, 0)
    else context.drawImage(frame.image, 0, 0)
    this.hasFrame = true
    this.draw() // Canvas owns a current-pixel copy; no borrowed frame is retained.
  }
  private draw() {
    this.context.setTransform(1, 0, 0, 1, 0, 0)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!this.hasFrame) return
    const view = this.viewport
    const transform = canvasTransform(view, this.source.width, this.source.height)
    this.context.setTransform(view.devicePixelRatio, 0, 0, view.devicePixelRatio, 0, 0)
    this.context.drawImage(this.source, transform.x, transform.y, this.source.width * transform.scale, this.source.height * transform.scale)
  }
  clear() { this.hasFrame = false; this.source.width = this.source.height = 1; this.draw() }
  dispose() { this.clear(); this.canvas.width = this.canvas.height = 1 }
}
