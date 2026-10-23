import { MediaError } from './errors'

/** Check the shared viewer's required capabilities before allocating media work. */
export function requireViewerCapabilities() {
  if (typeof AbortController !== 'function' || typeof ResizeObserver !== 'function' ||
    typeof PointerEvent !== 'function' || typeof requestAnimationFrame !== 'function' ||
    typeof cancelAnimationFrame !== 'function') throw new MediaError('VIEWER_RUNTIME_UNAVAILABLE')
}
