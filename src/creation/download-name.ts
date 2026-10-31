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
  return createDownloadNamer('aniview-animation', 'gif', now, nonce)
}

/** Same per-activation naming strategy for conversion, with a safe source basename. */
export function createAnimationDownloadNamer(name: string, extension: 'gif' | 'webp' | 'png', now: () => number = Date.now, nonce = downloadNonce()) {
  const base = (name.split(/[\\/]/).at(-1) ?? '').replace(/\.[^.]*$/, '').slice(0, 100)
  const safe = [...base].filter(char => char.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/, '') || 'animation'
  return createDownloadNamer(`${safe}-aniview`, extension, now, nonce)
}

function createDownloadNamer(stem: string, extension: string, now: () => number, nonce: string) {
  let sequence = 0
  return () => `${stem}-${now().toString(36)}-${nonce}-${++sequence}.${extension}`
}
