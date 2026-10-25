import { describe, expect, it, vi } from 'vitest'
import { createGifDownloadNamer } from './download-name'

describe('GIF download names', () => {
  it('keeps different results and repeated saves distinct even within one clock tick', () => {
    const next = createGifDownloadNamer(() => 1792890000000, 'session-one')
    const names = [next(), next(), next(), next()]
    expect(new Set(names).size).toBe(4)
    expect(names.every(name => /^aniview-animation-[a-z0-9-]+\.gif$/.test(name))).toBe(true)
    expect(names.every(name => name.length < 120)).toBe(true)
  })
  it('separates sessions when timestamps and download counts match', () => {
    const first = createGifDownloadNamer(() => 1000, 'first-page')
    const second = createGifDownloadNamer(() => 1000, 'second-page')
    expect(first()).not.toBe(second())
  })
  it('works without a secure-context randomUUID implementation', () => {
    vi.stubGlobal('crypto', undefined)
    try { expect(createGifDownloadNamer()()).toMatch(/^aniview-animation-[a-z0-9-]+\.gif$/) }
    finally { vi.unstubAllGlobals() }
  })
})
