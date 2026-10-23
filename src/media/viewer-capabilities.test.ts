import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireViewerCapabilities } from './viewer-capabilities'

afterEach(() => vi.unstubAllGlobals())
describe('shared viewer capability failures', () => {
  const names = ['AbortController', 'ResizeObserver', 'PointerEvent', 'requestAnimationFrame', 'cancelAnimationFrame']
  it.each(names)('reports an explicit compatibility error when %s is missing', missing => {
    for (const name of names) vi.stubGlobal(name, name === missing ? undefined : () => {})
    expect(requireViewerCapabilities).toThrow('Image viewing requires')
  })
  it('does not require optional Fullscreen or OffscreenCanvas for ordinary viewing', () => {
    for (const name of names) vi.stubGlobal(name, () => {})
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(requireViewerCapabilities).not.toThrow()
  })
})
