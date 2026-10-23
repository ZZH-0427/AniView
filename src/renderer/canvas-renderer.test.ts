import { expect, it } from 'vitest'
import { canvasTransform } from './canvas-renderer'
it('fits and centers an image in CSS pixels; zoom/pan stay independent of DPR', () => {
  const viewport = { width: 400, height: 300, devicePixelRatio: 2, zoom: 1, panX: 0, panY: 0 }
  expect(canvasTransform(viewport, 200, 100)).toEqual({ scale: 2, x: 0, y: 50 })
  expect(canvasTransform({ ...viewport, zoom: 2, panX: 10 }, 200, 100)).toEqual({ scale: 4, x: -190, y: -50 })
})
