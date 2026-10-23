export type ViewportMode = 'fit' | 'actual' | 'custom'
export interface ViewportPoint { readonly x: number; readonly y: number }
export interface ViewportSnapshot {
  readonly mode: ViewportMode
  /** Image pixels to CSS pixels, independent of the canvas backing resolution. */
  readonly scale: number
  readonly fitScale: number
  readonly minScale: number
  readonly maxScale: number
  /** CSS-pixel translation of the image's top-left corner. */
  readonly offsetX: number
  readonly offsetY: number
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly contentWidth: number
  readonly contentHeight: number
}

function positive(value: number) { return Number.isFinite(value) && value > 0 }
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)) }

export function fitScale(width: number, height: number, viewportWidth: number, viewportHeight: number) {
  return Math.min(viewportWidth / width, viewportHeight / height)
}

export function zoomBounds(fit: number) {
  // Actual Size must remain reachable when a small image's Fit is already >100%.
  // Tiny artwork may need >8x simply to fit, and still gets a bounded 2x-Fit detail.
  return { minScale: Math.min(fit, 1), maxScale: Math.max(8, 2 * fit) }
}

export function boundedOffset(offset: number, contentExtent: number, viewportExtent: number) {
  return contentExtent <= viewportExtent
    ? (viewportExtent - contentExtent) / 2
    : clamp(offset, viewportExtent - contentExtent, 0)
}

/** Pure geometry and observable display state. No playback, DOM or media ownership. */
export class ViewportController {
  private state: ViewportSnapshot = {
    mode: 'fit', scale: 1, fitScale: 1, minScale: 1, maxScale: 8,
    offsetX: 0, offsetY: 0, viewportWidth: 1, viewportHeight: 1, contentWidth: 1, contentHeight: 1,
  }
  private readonly listeners = new Set<(state: ViewportSnapshot) => void>()

  get snapshot(): ViewportSnapshot { return this.state }

  subscribe(listener: (state: ViewportSnapshot) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setContent(width: number, height: number) {
    if (!positive(width) || !positive(height)) return
    this.update({ ...this.state, contentWidth: width, contentHeight: height, mode: 'fit' })
  }

  resize(width: number, height: number) {
    if (!positive(width) || !positive(height)) return
    const previous = this.state
    // Preserve the content coordinate under the old visual center, then clamp only
    // if the resized viewport exposes an edge. Fit instead recenters and refits.
    const centerX = (previous.viewportWidth / 2 - previous.offsetX) / previous.scale
    const centerY = (previous.viewportHeight / 2 - previous.offsetY) / previous.scale
    const nextFit = fitScale(previous.contentWidth, previous.contentHeight, width, height)
    const scale = Math.min(previous.scale, zoomBounds(nextFit).maxScale)
    this.update({ ...previous, scale, viewportWidth: width, viewportHeight: height,
      offsetX: width / 2 - centerX * scale,
      offsetY: height / 2 - centerY * scale })
  }

  fit() { this.update({ ...this.state, mode: 'fit' }) }
  actual() { this.centerAtScale(1, 'actual') }

  zoomBy(factor: number, x = this.state.viewportWidth / 2, y = this.state.viewportHeight / 2) {
    if (!positive(factor)) return
    this.zoomTo(this.state.scale * factor, x, y)
  }

  zoomTo(scale: number, x = this.state.viewportWidth / 2, y = this.state.viewportHeight / 2) {
    this.transformTo(scale, { x, y })
  }

  /** Maps the content under anchor to target: a pinch combines zoom and pan atomically. */
  transformTo(scale: number, anchor: ViewportPoint, target: ViewportPoint = anchor) {
    if (!positive(scale) || ![anchor.x, anchor.y, target.x, target.y].every(Number.isFinite)) return
    const state = this.state
    const bounded = clamp(scale, state.minScale, state.maxScale)
    if (bounded === state.scale && anchor.x === target.x && anchor.y === target.y) return
    const ratio = bounded / state.scale
    this.update({ ...state, mode: bounded === state.fitScale ? 'fit' : 'custom', scale: bounded,
      offsetX: target.x - (anchor.x - state.offsetX) * ratio,
      offsetY: target.y - (anchor.y - state.offsetY) * ratio })
  }

  panBy(dx: number, dy: number) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    this.update({ ...this.state, offsetX: this.state.offsetX + dx, offsetY: this.state.offsetY + dy })
  }

  toggleDetail(x: number, y: number) {
    if (this.state.mode === 'fit') this.zoomTo(Math.min(this.state.fitScale * 2, this.state.maxScale), x, y)
    else this.fit()
  }

  private centerAtScale(scale: number, mode: ViewportMode) {
    const state = this.state
    const center = { x: state.viewportWidth / 2, y: state.viewportHeight / 2 }
    const ratio = scale / state.scale
    this.update({ ...state, mode, scale,
      offsetX: center.x - (center.x - state.offsetX) * ratio,
      offsetY: center.y - (center.y - state.offsetY) * ratio })
  }

  private update(next: ViewportSnapshot) {
    const fit = fitScale(next.contentWidth, next.contentHeight, next.viewportWidth, next.viewportHeight)
    const bounds = zoomBounds(fit)
    // On resize, preserve custom/actual scale even if it falls below the new Fit.
    // This is the same intentional exception that makes true Actual Size possible.
    const scale = next.mode === 'fit' ? fit : next.mode === 'actual' ? 1 : next.scale
    const updated: ViewportSnapshot = Object.freeze({ ...next, ...bounds, fitScale: fit, scale,
      offsetX: boundedOffset(next.offsetX, next.contentWidth * scale, next.viewportWidth),
      offsetY: boundedOffset(next.offsetY, next.contentHeight * scale, next.viewportHeight),
    })
    if ((Object.keys(updated) as (keyof ViewportSnapshot)[]).every(key => updated[key] === this.state[key])) return
    this.state = updated
    for (const listener of this.listeners) listener(updated)
  }
}
