import type { DecodedFrame } from '../media/frame'

export interface Viewport {
  readonly width: number
  readonly height: number
  readonly devicePixelRatio: number
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

/** Drawing only: playback scheduling and resource ownership belong to the caller. */
export interface Renderer {
  /** CSS-pixel viewport, pan and dimensions; the renderer applies the pixel ratio. */
  setViewport(viewport: Viewport): void
  /** Borrow the frame synchronously; do not retain or dispose it. */
  render(frame: DecodedFrame): void
  clear(): void
  dispose(): void
}
