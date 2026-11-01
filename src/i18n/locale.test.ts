import { describe, expect, it, vi } from 'vitest'
import { createLocaleStore, isLocale, LOCALE_STORAGE_KEY, resolveLocale } from './locale'
import type { Locale } from './locale'

describe('locale preference policy', () => {
  it.each(['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-TW', 'zh-HK'])('maps browser %s to the available Simplified Chinese UI', language => {
    expect(resolveLocale(undefined, [language])).toBe('zh-CN')
  })
  it.each(['en-US', 'en-GB', 'fr-FR', 'ja', 'invalid'])('uses English for %s', language => {
    expect(resolveLocale(undefined, [language])).toBe('en')
  })
  it('prefers a valid saved choice to browser detection', () => {
    expect(resolveLocale('en', ['zh-CN'])).toBe('en')
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN')
  })
  it('ignores invalid saved values and uses the first preferred browser language', () => {
    expect(resolveLocale('foo', ['zh-SG'])).toBe('zh-CN')
    expect(resolveLocale(null, ['en-US', 'zh-CN'])).toBe('en')
    expect(resolveLocale(undefined, [])).toBe('en')
    expect(isLocale('zh-TW')).toBe(false)
    expect(LOCALE_STORAGE_KEY).toBe('aniview.locale')
  })
  it('still switches in memory if storage reads and writes are blocked', () => {
    const store = createLocaleStore({ read: () => { throw Error('blocked') }, write: () => { throw Error('blocked') }, languages: () => ['zh-CN'] })
    expect(store.getSnapshot()).toBe('zh-CN')
    store.setLocale('en'); expect(store.getSnapshot()).toBe('en')
  })
  it('falls back safely without browser language access', () => {
    const store = createLocaleStore({ read: () => undefined, write: () => {}, languages: () => { throw Error('unavailable') } })
    expect(store.getSnapshot()).toBe('en')
  })
  it('persists only a locale, survives a new store, and unsubscribes cleanly', () => {
    let preference: unknown
    const write = vi.fn((value: Locale) => { preference = value })
    const environment = { read: () => preference, write, languages: () => ['en-US'] }
    const store = createLocaleStore(environment), changed = vi.fn()
    expect(store.getSnapshot()).toBe('en')
    const unsubscribe = store.subscribe(changed)
    store.setLocale('zh-CN'); store.setLocale('zh-CN')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(write.mock.calls.every(([value]) => value === 'zh-CN')).toBe(true)
    expect(createLocaleStore(environment).getSnapshot()).toBe('zh-CN')
    unsubscribe(); store.setLocale('en'); expect(changed).toHaveBeenCalledTimes(1)
    expect(createLocaleStore(environment).getSnapshot()).toBe('en')
  })
})
