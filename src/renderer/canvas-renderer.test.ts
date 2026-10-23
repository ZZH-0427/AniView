import { afterEach, describe, expect, it, vi } from 'vitest'
import { canvasBackingSize, CanvasRenderer, canvasTransform } from './canvas-renderer'
import { ViewportController } from './viewport-controller'
it('fits and centers an image in CSS pixels; zoom/pan stay independent of DPR', () => {
  const viewport = { width: 400, height: 300, devicePixelRatio: 2, zoom: 1, panX: 0, panY: 0 }
  expect(canvasTransform(viewport, 200, 100)).toEqual({ scale: 2, x: 0, y: 50 })
  expect(canvasTransform({ ...viewport, zoom: 2, panX: 10 }, 200, 100)).toEqual({ scale: 4, x: -190, y: -50 })
})

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const sourceContext = { clearRect: vi.fn(), putImageData: vi.fn(), drawImage: vi.fn() }
  const displayContext = { clearRect: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn() }
  const source = { width: 1, height: 1, getContext: vi.fn(() => sourceContext) }
  const canvas = { width: 1, height: 1, getContext: vi.fn(() => displayContext) }
  vi.stubGlobal('document', { createElement: vi.fn(() => source) })
  vi.stubGlobal('ImageData', class {
    constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
  })
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const scheduler = {
    request: vi.fn((callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id }),
    cancel: vi.fn((id: number) => { callbacks.delete(id) }),
  }
  const flush = () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(0)) }
  const renderer = new CanvasRenderer(canvas, scheduler)
  const viewport = new ViewportController()
  viewport.resize(400, 300)
  viewport.setContent(200, 100)
  return { source, canvas, renderer, viewport, sourceContext, displayContext, scheduler, callbacks, flush }
}

describe('CanvasRenderer display resource and invalidation', () => {
  it('keeps Actual Size in CSS pixels while DPR changes only the display backing', () => {
    const { renderer, viewport, canvas, displayContext } = fixture()
    viewport.actual()
    renderer.setTransform(viewport.snapshot, 2)
    renderer.renderImage(new ImageData(new Uint8ClampedArray(200 * 100 * 4), 200, 100), 200, 100)
    expect(canvas).toMatchObject({ width: 800, height: 600 })
    expect(displayContext.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
    expect(displayContext.drawImage).toHaveBeenLastCalledWith(expect.anything(), 100, 100, 200, 100)
  })

  it('coalesces repeated viewport changes and does not keep an idle redraw loop', () => {
    const { renderer, viewport, sourceContext, displayContext, callbacks, scheduler, flush } = fixture()
    renderer.renderImage(new ImageData(new Uint8ClampedArray(80_000), 200, 100), 200, 100)
    displayContext.drawImage.mockClear()
    renderer.setTransform(viewport.snapshot, 2)
    viewport.zoomBy(2)
    renderer.setTransform(viewport.snapshot, 2)
    viewport.panBy(40, 10)
    renderer.setTransform(viewport.snapshot, 2)
    expect(callbacks.size).toBe(1)
    expect(scheduler.request).toHaveBeenCalledOnce()
    expect(displayContext.drawImage).not.toHaveBeenCalled()
    flush()
    expect(displayContext.drawImage).toHaveBeenCalledOnce()
    expect(callbacks.size).toBe(0)
    expect(sourceContext.putImageData).toHaveBeenCalledOnce()
    flush()
    expect(displayContext.drawImage).toHaveBeenCalledOnce()
  })

  it('consumes a pending viewport redraw when the player presents a frame', () => {
    const { renderer, viewport, sourceContext, displayContext, callbacks, scheduler, flush } = fixture()
    renderer.setTransform(viewport.snapshot, 1)
    const image = new ImageData(new Uint8ClampedArray(80_000), 200, 100)
    const dispose = vi.fn()
    renderer.render({ index: 0, width: 200, height: 100, durationMs: 100, byteLength: 80_000, image, dispose })
    expect(sourceContext.putImageData).toHaveBeenCalledWith(image, 0, 0)
    expect(displayContext.drawImage).toHaveBeenCalledOnce()
    expect(scheduler.cancel).toHaveBeenCalledOnce()
    expect(callbacks.size).toBe(0)
    flush()
    expect(displayContext.drawImage).toHaveBeenCalledOnce()
    expect(dispose).not.toHaveBeenCalled()
  })

  it('copies borrowed bitmaps and redraws its own pixel surface without retaining or closing them', () => {
    const { renderer, viewport, source, sourceContext, displayContext, flush } = fixture()
    const bitmap = { width: 200, height: 100, close: vi.fn() } as ImageBitmap
    renderer.renderImage(bitmap, 200, 100)
    expect(sourceContext.clearRect).toHaveBeenCalledWith(0, 0, 200, 100)
    expect(sourceContext.drawImage).toHaveBeenCalledWith(bitmap, 0, 0)
    renderer.setTransform(viewport.snapshot, 1)
    flush()
    expect(displayContext.drawImage.mock.calls.every(call => call[0] === source)).toBe(true)
    expect(sourceContext.drawImage).toHaveBeenCalledOnce()
    renderer.dispose()
    expect(bitmap.close).not.toHaveBeenCalled()
  })

  it('cancels pending redraw and releases both canvas backings on dispose', () => {
    const { renderer, viewport, source, canvas, callbacks, scheduler, flush } = fixture()
    renderer.renderImage(new ImageData(new Uint8ClampedArray(80_000), 200, 100), 200, 100)
    renderer.setTransform(viewport.snapshot, 2)
    renderer.dispose()
    expect(scheduler.cancel).toHaveBeenCalledOnce()
    expect(callbacks.size).toBe(0)
    expect(source).toMatchObject({ width: 1, height: 1 })
    expect(canvas).toMatchObject({ width: 1, height: 1 })
    renderer.setTransform(viewport.snapshot, 2)
    flush()
    expect(canvas.width).toBe(1)
    expect(callbacks.size).toBe(0)
  })

  it('rejects unsafe source dimensions before allocating their canvas', () => {
    const { renderer, source } = fixture()
    const image = new ImageData(new Uint8ClampedArray(4), 1, 1)
    for (const [width, height] of [[50000, 50000], [16385, 1], [8192, 8192], [0, 1], [2.5, 1]]) {
      expect(() => renderer.renderImage(image, width!, height!)).toThrow(expect.objectContaining({ code: 'OUT_OF_MEMORY' }))
      expect(source).toMatchObject({ width: 1, height: 1 })
    }
  })
})

describe('display backing safety', () => {
  it('uses native DPR when the viewport fits within the budget', () => {
    expect(canvasBackingSize(400, 300, 2)).toEqual({ width: 800, height: 600 })
  })
  it('bounds total display pixels and edges even for large fullscreen DPR surfaces', () => {
    const large = canvasBackingSize(16000, 9000, 4)
    expect(large.width * large.height).toBeLessThanOrEqual(16 * 1024 * 1024)
    expect(Math.max(large.width, large.height)).toBeLessThanOrEqual(8192)
    const narrow = canvasBackingSize(20000, 1, 4)
    expect(narrow).toEqual({ width: 8192, height: 1 })
  })
  it('rejects nonfinite or empty backing dimensions', () => {
    expect(() => canvasBackingSize(Infinity, 100, 2)).toThrow()
    expect(() => canvasBackingSize(100, 0, 2)).toThrow()
    expect(() => canvasBackingSize(100, 100, NaN)).toThrow()
  })
})
