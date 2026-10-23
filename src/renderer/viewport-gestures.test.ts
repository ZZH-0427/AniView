import { describe, expect, it } from 'vitest'
import { ViewportController } from './viewport-controller'
import { pointerDistance, pointerMidpoint, ViewportGestures, wheelZoomFactor, type GesturePointer } from './viewport-gestures'

function fixture() {
  const viewport = new ViewportController()
  viewport.resize(400, 400)
  viewport.setContent(1000, 1000)
  return { viewport, gestures: new ViewportGestures(viewport) }
}
function point(id: number, x: number, y: number, time = 0, pointerType = 'touch'): GesturePointer {
  return { id, x, y, time, pointerType }
}
function tap(gestures: ViewportGestures, x: number, y: number, time: number) {
  gestures.down(point(1, x, y, time))
  gestures.up(point(1, x, y, time + 20))
}

describe('viewport gesture state', () => {
  it('calculates two-pointer distance and midpoint', () => {
    expect(pointerDistance({ x: 10, y: 20 }, { x: 13, y: 24 })).toBe(5)
    expect(pointerMidpoint({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({ x: 20, y: 30 })
  })

  it('pans a zoomed image using one pointer delta', () => {
    const { viewport, gestures } = fixture()
    viewport.actual()
    gestures.down(point(1, 100, 100))
    gestures.move(point(1, 130, 120))
    expect(viewport.snapshot).toMatchObject({ scale: 1, offsetX: -270, offsetY: -280 })
    gestures.move(point(1, 140, 130))
    expect(viewport.snapshot).toMatchObject({ offsetX: -260, offsetY: -270 })
  })

  it('keeps a fitted image centered during a single-pointer drag', () => {
    const { viewport, gestures } = fixture()
    gestures.down(point(1, 100, 100))
    gestures.move(point(1, 350, 350))
    expect(viewport.snapshot).toMatchObject({ scale: 0.4, offsetX: 0, offsetY: 0 })
  })

  it('pinches around the moving midpoint without also applying single-pointer pan', () => {
    const { viewport, gestures } = fixture()
    viewport.actual()
    gestures.down(point(1, 100, 200))
    gestures.down(point(2, 300, 200))
    gestures.move(point(1, 50, 200))
    expect(viewport.snapshot).toMatchObject({ scale: 1.25, offsetX: -450, offsetY: -425 })
    expect((175 - viewport.snapshot.offsetX) / viewport.snapshot.scale).toBe(500)
    expect((200 - viewport.snapshot.offsetY) / viewport.snapshot.scale).toBe(500)
  })

  it('returns from pinch to one-pointer pan without a discontinuous jump', () => {
    const { viewport, gestures } = fixture()
    viewport.actual()
    gestures.down(point(1, 100, 200))
    gestures.down(point(2, 300, 200))
    gestures.move(point(1, 50, 200))
    gestures.up(point(2, 300, 200))
    const previous = viewport.snapshot
    gestures.move(point(1, 60, 205))
    expect(viewport.snapshot.scale).toBe(previous.scale)
    expect(viewport.snapshot.offsetX).toBe(previous.offsetX + 10)
    expect(viewport.snapshot.offsetY).toBe(previous.offsetY + 5)
  })

  it('ignores nearly coincident pinch points instead of dividing by zero', () => {
    const { viewport, gestures } = fixture()
    gestures.down(point(1, 100, 100))
    gestures.down(point(2, 100, 100))
    gestures.move(point(1, 100.1, 100))
    expect(viewport.snapshot.scale).toBe(0.4)
    expect(Number.isFinite(viewport.snapshot.offsetX)).toBe(true)
  })

  it('cancels pointers and ignores late moves after cancellation', () => {
    const { viewport, gestures } = fixture()
    viewport.actual()
    gestures.down(point(1, 100, 100))
    gestures.cancel(1)
    expect(gestures.activePointers).toBe(0)
    const previous = viewport.snapshot
    gestures.move(point(1, 200, 100))
    expect(viewport.snapshot).toBe(previous)
  })

  it('continues bounded one-pointer pan when the other pinch pointer is cancelled', () => {
    const { viewport, gestures } = fixture()
    viewport.actual()
    gestures.down(point(1, 100, 100))
    gestures.down(point(2, 300, 100))
    gestures.cancel(2)
    gestures.move(point(1, 110, 115))
    expect(viewport.snapshot).toMatchObject({ scale: 1, offsetX: -290, offsetY: -285 })
    gestures.cancel()
    expect(gestures.activePointers).toBe(0)
  })

  it('double taps to Detail at the tapped point and back to Fit', () => {
    const { viewport, gestures } = fixture()
    tap(gestures, 100, 120, 0)
    tap(gestures, 100, 120, 150)
    expect(viewport.snapshot).toMatchObject({ mode: 'custom', scale: 0.8, offsetX: -100, offsetY: -120 })
    tap(gestures, 100, 120, 1000)
    tap(gestures, 100, 120, 1150)
    expect(viewport.snapshot).toMatchObject({ mode: 'fit', scale: 0.4 })
  })

  it('retains the first tap after pointerup is followed by lostpointercapture', () => {
    const { viewport, gestures } = fixture()
    tap(gestures, 100, 100, 0)
    gestures.cancel(1)
    tap(gestures, 100, 100, 150)
    expect(viewport.snapshot.scale).toBe(0.8)
  })

  it('does not interpret separate, slow, dragged, or cancelled taps as double tap', () => {
    const { viewport, gestures } = fixture()
    tap(gestures, 100, 100, 0)
    tap(gestures, 150, 100, 150)
    tap(gestures, 150, 100, 700)
    gestures.down(point(1, 150, 100, 850))
    gestures.move(point(1, 180, 100, 870))
    gestures.up(point(1, 180, 100, 890))
    tap(gestures, 180, 100, 1000)
    gestures.down(point(1, 180, 100, 1100))
    gestures.cancel(1)
    tap(gestures, 180, 100, 1200)
    expect(viewport.snapshot.mode).toBe('fit')
  })

  it('leaves mouse double-click recognition to the DOM adapter', () => {
    const { viewport, gestures } = fixture()
    gestures.down(point(1, 100, 100, 0, 'mouse'))
    gestures.up(point(1, 100, 100, 20, 'mouse'))
    gestures.down(point(1, 100, 100, 100, 'mouse'))
    gestures.up(point(1, 100, 100, 120, 'mouse'))
    expect(viewport.snapshot.mode).toBe('fit')
  })
})

describe('normalized wheel zoom', () => {
  it('normalizes pixel, line and page delta modes', () => {
    expect(wheelZoomFactor(16, 0, 400)).toBe(wheelZoomFactor(1, 1, 400))
    expect(wheelZoomFactor(200, 0, 400)).toBe(wheelZoomFactor(0.5, 2, 400))
  })
  it('uses a bounded exponential multiplier in both directions', () => {
    const inward = wheelZoomFactor(-120, 0, 400)
    expect(inward).toBeGreaterThan(1)
    expect(wheelZoomFactor(120, 0, 400)).toBeCloseTo(1 / inward)
    expect(wheelZoomFactor(-1e100, 0, 400)).toBeLessThan(2)
    expect(wheelZoomFactor(Infinity, 0, 400)).toBe(1)
  })
})
