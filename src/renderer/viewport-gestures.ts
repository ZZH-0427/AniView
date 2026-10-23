import { ViewportController, type ViewportPoint } from './viewport-controller'

export interface GesturePointer extends ViewportPoint {
  readonly id: number
  readonly pointerType: string
  readonly time: number
}
interface ActivePointer extends GesturePointer {
  readonly start: ViewportPoint
  readonly startedAt: number
  readonly moved: boolean
}

export function pointerDistance(a: ViewportPoint, b: ViewportPoint) { return Math.hypot(a.x - b.x, a.y - b.y) }
export function pointerMidpoint(a: ViewportPoint, b: ViewportPoint): ViewportPoint { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }

/** Wheel deltaMode 0/1/2 = pixels/lines/pages, with bounded exponential sensitivity. */
export function wheelZoomFactor(delta: number, deltaMode: number, viewportHeight: number) {
  if (!Number.isFinite(delta)) return 1
  const pixels = delta * (deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1)
  return Math.exp(-Math.max(-240, Math.min(240, pixels)) * 0.002)
}

/** Testable gesture state; DOM capture/listener ownership stays in the adapter below. */
export class ViewportGestures {
  private readonly pointers = new Map<number, ActivePointer>()
  private lastTap: { point: ViewportPoint; time: number } | null = null
  constructor(private readonly viewport: ViewportController) {}
  get activePointers() { return this.pointers.size }

  down(point: GesturePointer) {
    this.pointers.set(point.id, { ...point, start: point, startedAt: point.time, moved: false })
    if (this.pointers.size > 1) {
      this.lastTap = null
      for (const [id, pointer] of this.pointers) this.pointers.set(id, { ...pointer, moved: true })
    }
  }

  move(point: GesturePointer) {
    const previous = this.pointers.get(point.id)
    if (!previous) return
    const before = [...this.pointers.values()].slice(0, 2)
    this.pointers.set(point.id, { ...previous, ...point,
      moved: previous.moved || pointerDistance(previous.start, point) > 8 })
    if (this.pointers.size === 1) this.viewport.panBy(point.x - previous.x, point.y - previous.y)
    else {
      const after = [...this.pointers.values()].slice(0, 2)
      const [a, b] = before
      const [c, d] = after
      if (!a || !b || !c || !d) return
      const distance = pointerDistance(a, b)
      const nextDistance = pointerDistance(c, d)
      if (distance < 2 || nextDistance < 2) return
      this.viewport.transformTo(this.viewport.snapshot.scale * nextDistance / distance,
        pointerMidpoint(a, b), pointerMidpoint(c, d))
    }
  }

  up(point: GesturePointer) {
    const previous = this.pointers.get(point.id)
    if (!previous) return
    this.pointers.delete(point.id)
    const tap = previous.pointerType !== 'mouse' && !previous.moved && this.pointers.size === 0 &&
      point.time - previous.startedAt <= 300 && pointerDistance(previous.start, point) <= 8
    if (!tap) { this.lastTap = null; return }
    if (this.lastTap && point.time - this.lastTap.time <= 300 && pointerDistance(this.lastTap.point, point) <= 24) {
      this.viewport.toggleDetail(point.x, point.y)
      this.lastTap = null
    } else this.lastTap = { point, time: point.time }
  }

  cancel(id?: number) {
    if (id === undefined) this.pointers.clear()
    else if (!this.pointers.delete(id)) return
    // pointerup's explicit release emits lostpointercapture too. If the pointer
    // already ended, retain the tap candidate for a following double tap.
    this.lastTap = null
  }
}

/** Surface-local listeners only. Call the returned disposer before removing the surface. */
export function attachViewportGestures(surface: HTMLElement, viewport: ViewportController) {
  const gestures = new ViewportGestures(viewport)
  const captured = new Set<number>()
  let lastTouch = -Infinity
  const oldTouchAction = surface.style.touchAction
  surface.style.touchAction = 'none'
  const local = (event: PointerEvent): GesturePointer => {
    const bounds = surface.getBoundingClientRect()
    return { id: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top,
      pointerType: event.pointerType, time: event.timeStamp }
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (event.pointerType !== 'mouse') lastTouch = event.timeStamp
    gestures.down(local(event))
    try { surface.setPointerCapture(event.pointerId); captured.add(event.pointerId) } catch { /* Detached/cancelled pointer. */ }
  }
  const move = (event: PointerEvent) => { gestures.move(local(event)) }
  const release = (id: number) => {
    captured.delete(id)
    try { if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id) } catch { /* Already released by the browser. */ }
  }
  const up = (event: PointerEvent) => { gestures.up(local(event)); release(event.pointerId) }
  const cancel = (event: PointerEvent) => { gestures.cancel(event.pointerId); release(event.pointerId) }
  const lost = (event: PointerEvent) => { gestures.cancel(event.pointerId); captured.delete(event.pointerId) }
  const doubleClick = (event: MouseEvent) => {
    // Touch is handled by pointer taps; suppress any synthesized compatibility dblclick.
    if (event.timeStamp - lastTouch < 500) return
    const bounds = surface.getBoundingClientRect()
    viewport.toggleDetail(event.clientX - bounds.left, event.clientY - bounds.top)
    event.preventDefault()
  }
  const wheel = (event: WheelEvent) => {
    const before = viewport.snapshot
    const bounds = surface.getBoundingClientRect()
    viewport.zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode, before.viewportHeight),
      event.clientX - bounds.left, event.clientY - bounds.top)
    if (viewport.snapshot.scale !== before.scale) event.preventDefault()
  }
  const interrupt = () => {
    gestures.cancel()
    for (const id of captured) release(id)
  }
  const visibility = () => { if (document.visibilityState === 'hidden') interrupt() }
  surface.addEventListener('pointerdown', down)
  surface.addEventListener('pointermove', move)
  surface.addEventListener('pointerup', up)
  surface.addEventListener('pointercancel', cancel)
  surface.addEventListener('lostpointercapture', lost)
  surface.addEventListener('dblclick', doubleClick)
  surface.addEventListener('wheel', wheel, { passive: false })
  window.addEventListener('resize', interrupt)
  document.addEventListener('fullscreenchange', interrupt)
  document.addEventListener('visibilitychange', visibility)
  return () => {
    gestures.cancel()
    surface.removeEventListener('pointerdown', down)
    surface.removeEventListener('pointermove', move)
    surface.removeEventListener('pointerup', up)
    surface.removeEventListener('pointercancel', cancel)
    surface.removeEventListener('lostpointercapture', lost)
    surface.removeEventListener('dblclick', doubleClick)
    surface.removeEventListener('wheel', wheel)
    window.removeEventListener('resize', interrupt)
    document.removeEventListener('fullscreenchange', interrupt)
    document.removeEventListener('visibilitychange', visibility)
    for (const id of captured) release(id)
    surface.style.touchAction = oldTouchAction
  }
}
