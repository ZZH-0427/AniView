function downloadNonce() {
  try {
    const words = globalThis.crypto.getRandomValues(new Uint32Array(2))
    return Array.from(words, word => word.toString(16).padStart(8, '0')).join('')
  } catch {
    // Naming disambiguation only, never a security token. Older runtimes can
    // still download without requiring secure-context-only randomUUID().
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  }
}

/** Different suggestions across results, repeated clicks, tabs and page reloads. */
export function createGifDownloadNamer(now: () => number = Date.now, nonce = downloadNonce()) {
  let sequence = 0
  return () => `aniview-animation-${now().toString(36)}-${nonce}-${++sequence}.gif`
}
