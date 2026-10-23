import { describe, expect, it, vi } from 'vitest'
import { boundedOffset, fitScale, ViewportController } from './viewport-controller'

function create(width = 1_000, height = 800, viewportWidth = 500, viewportHeight = 400) {
  const viewport = new ViewportController()
  viewport.resize(viewportWidth, viewportHeight)
  viewport.setContent(width, height)
  return viewport
}

function contentAt(viewport: ViewportController, x: number, y: number) {
  const state = viewport.snapshot
  return { x: (x - state.offsetX) / state.scale, y: (y - state.offsetY) / state.scale }
}

describe('ViewportController geometry', () => {
  it('fits within the available surface with aspect ratio and centered letterboxing', () => {
    expect(fitScale(200, 100, 400, 300)).toBe(2)
    expect(create(200, 100, 400, 300).snapshot).toMatchObject({ mode: 'fit', scale: 2, offsetX: 0, offsetY: 50 })
    expect(create(100, 200, 400, 300).snapshot).toMatchObject({ scale: 1.5, offsetX: 125, offsetY: 0 })
  })

  it('defines Actual Size as one CSS pixel per image pixel, including below Fit', () => {
    const viewport = create(200, 100, 400, 300)
    viewport.actual()
    expect(viewport.snapshot).toMatchObject({ mode: 'actual', scale: 1, fitScale: 2, offsetX: 100, offsetY: 100 })
  })

  it('clamps ordinary zoom between Fit and eight times Actual Size', () => {
    const viewport = create()
    viewport.zoomBy(1e10)
    expect(viewport.snapshot.scale).toBe(8)
    viewport.zoomBy(1e-20)
    expect(viewport.snapshot).toMatchObject({ scale: 0.5, mode: 'fit', offsetX: 0, offsetY: 0 })
  })

  it('allows tiny artwork to reach Fit, Detail, and Actual Size', () => {
    const viewport = create(2, 2, 400, 300)
    expect(viewport.snapshot.scale).toBe(150)
    expect(viewport.snapshot.maxScale).toBe(300)
    viewport.toggleDetail(200, 150)
    expect(viewport.snapshot.scale).toBe(300)
    viewport.zoomBy(100)
    expect(viewport.snapshot.scale).toBe(300)
    viewport.actual()
    expect(viewport.snapshot.scale).toBe(1)
    viewport.fit()
    expect(viewport.snapshot.scale).toBe(150)
  })

  it('keeps the content coordinate under the zoom point stable when not constrained by an edge', () => {
    const viewport = create()
    const point = contentAt(viewport, 100, 125)
    viewport.zoomBy(2, 100, 125)
    expect(contentAt(viewport, 100, 125)).toEqual(point)
    viewport.zoomBy(2, 100, 125)
    expect(contentAt(viewport, 100, 125)).toEqual(point)
  })

  it('uses the visual center for button zoom', () => {
    const viewport = create()
    const center = contentAt(viewport, 250, 200)
    viewport.zoomBy(1.25)
    expect(contentAt(viewport, 250, 200)).toEqual(center)
  })

  it('maps a pinch anchor to a moving midpoint as one transform', () => {
    const viewport = create()
    viewport.actual()
    const imagePoint = contentAt(viewport, 250, 200)
    viewport.transformTo(2, { x: 250, y: 200 }, { x: 300, y: 230 })
    expect(contentAt(viewport, 300, 230)).toEqual(imagePoint)
  })

  it('prevents panning a fully fitted image out of view', () => {
    const viewport = create(200, 100, 400, 300)
    viewport.panBy(1e6, -1e6)
    expect(viewport.snapshot).toMatchObject({ mode: 'fit', offsetX: 0, offsetY: 50 })
  })

  it('bounds pan to the displayed image edges independently on each axis', () => {
    expect(boundedOffset(-999, 200, 300)).toBe(50)
    const viewport = create()
    viewport.actual()
    viewport.panBy(1e6, -1e6)
    expect(viewport.snapshot).toMatchObject({ offsetX: 0, offsetY: -400 })
    viewport.panBy(-1e6, 1e6)
    expect(viewport.snapshot).toMatchObject({ offsetX: -500, offsetY: 0 })
  })

  it('refits and recenters after resizing in Fit mode', () => {
    const viewport = create()
    viewport.resize(800, 300)
    expect(viewport.snapshot).toMatchObject({ mode: 'fit', fitScale: 0.375, scale: 0.375, offsetX: 212.5, offsetY: 0 })
  })

  it('preserves scale and visual center on resize in custom mode when edges permit', () => {
    const viewport = create(2000, 1200)
    viewport.zoomTo(1)
    viewport.panBy(250, 100)
    const center = contentAt(viewport, 250, 200)
    viewport.resize(700, 500)
    expect(viewport.snapshot).toMatchObject({ mode: 'custom', scale: 1 })
    expect(contentAt(viewport, 350, 250)).toEqual(center)
  })

  it('keeps Actual Size on resize and recenters axes that now fit', () => {
    const viewport = create()
    viewport.actual()
    const center = contentAt(viewport, 250, 200)
    viewport.resize(600, 500)
    expect(viewport.snapshot).toMatchObject({ mode: 'actual', scale: 1 })
    expect(contentAt(viewport, 300, 250)).toEqual(center)
    viewport.resize(1200, 1000)
    expect(viewport.snapshot).toMatchObject({ mode: 'actual', scale: 1, offsetX: 100, offsetY: 100 })
  })

  it('preserves a custom scale below the resized Fit instead of unexpectedly magnifying it', () => {
    const viewport = create()
    viewport.zoomTo(0.75)
    viewport.resize(2000, 1600)
    expect(viewport.snapshot).toMatchObject({ mode: 'custom', scale: 0.75, fitScale: 2, offsetX: 625, offsetY: 500 })
  })

  it('clamps an extreme tiny-image detail when resize lowers its maximum zoom', () => {
    const viewport = create(2, 2, 400, 300)
    viewport.toggleDetail(200, 150)
    expect(viewport.snapshot.scale).toBe(300)
    viewport.resize(10, 10)
    expect(viewport.snapshot).toMatchObject({ mode: 'custom', scale: 10, maxScale: 10, offsetX: -5, offsetY: -5 })
  })

  it('toggles Detail around the action point, then restores Fit', () => {
    const viewport = create()
    const point = contentAt(viewport, 110, 130)
    viewport.toggleDetail(110, 130)
    expect(viewport.snapshot.scale).toBe(1)
    expect(contentAt(viewport, 110, 130)).toEqual(point)
    viewport.toggleDetail(110, 130)
    expect(viewport.snapshot).toMatchObject({ mode: 'fit', scale: 0.5, offsetX: 0, offsetY: 0 })
  })

  it('resets transformed media to Fit when content changes', () => {
    const viewport = create()
    viewport.zoomBy(4)
    viewport.panBy(100, 100)
    viewport.setContent(200, 100)
    expect(viewport.snapshot).toMatchObject({ mode: 'fit', scale: 2.5, offsetX: 0, offsetY: 75 })
  })

  it('ignores invalid inputs without corrupting the current transform', () => {
    const viewport = create()
    const state = viewport.snapshot
    viewport.resize(0, 100)
    viewport.setContent(Infinity, 20)
    viewport.zoomBy(-1)
    viewport.zoomTo(NaN)
    viewport.panBy(10, Infinity)
    viewport.transformTo(2, { x: NaN, y: 0 })
    expect(viewport.snapshot).toBe(state)
  })

  it('does not leave Fit or publish redundant updates at a zoom bound', () => {
    const viewport = create()
    const changed = vi.fn()
    const unsubscribe = viewport.subscribe(changed)
    viewport.zoomBy(0.5)
    expect(changed).not.toHaveBeenCalled()
    expect(viewport.snapshot.mode).toBe('fit')
    viewport.actual()
    expect(changed).toHaveBeenCalledOnce()
    unsubscribe()
    viewport.fit()
    expect(changed).toHaveBeenCalledOnce()
  })
})
