export type Locale = 'en' | 'zh-CN'
export const LOCALE_STORAGE_KEY = 'aniview.locale'
export const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'zh-CN'

export function resolveLocale(stored: unknown, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}
interface LocaleEnvironment {
  read: () => unknown
  write: (locale: Locale) => void
  languages: () => readonly string[]
}
const browserEnvironment: LocaleEnvironment = {
  read: () => globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY),
  write: locale => globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale),
  languages: () => typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language],
}

/** Stores one language preference only; never media, workspace or job state. */
export function createLocaleStore(environment: LocaleEnvironment = browserEnvironment) {
  let locale: Locale | undefined
  const listeners = new Set<() => void>()
  const getSnapshot = (): Locale => {
    if (!locale) {
      let stored: unknown, languages: readonly string[] = []
      try { stored = environment.read() } catch { /* Storage can be unavailable. */ }
      try { languages = environment.languages() } catch { /* Safe English fallback. */ }
      locale = resolveLocale(stored, languages)
    }
    return locale
  }
  const setLocale = (next: Locale) => {
    if (!isLocale(next)) return
    try { environment.write(next) } catch { /* The selection still works in memory. */ }
    if (getSnapshot() === next) return
    locale = next
    for (const listener of listeners) listener()
  }
  return { getSnapshot, setLocale, subscribe: (listener: () => void) => {
    listeners.add(listener); return () => { listeners.delete(listener) }
  } }
}
export const localeStore = createLocaleStore()
