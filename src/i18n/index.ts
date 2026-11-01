import { useCallback, useSyncExternalStore } from 'react'
import { localeStore } from './locale'
import { translate, translateMessage } from './messages'
import type { Message, MessageKey, MessageParams } from './messages'

export function useI18n() {
  const locale = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getSnapshot)
  const t = useCallback((key: MessageKey, params?: MessageParams) => translate(locale, key, params), [locale])
  const text = useCallback((message: Message) => translateMessage(locale, message), [locale])
  return { locale, setLocale: localeStore.setLocale, t, text }
}
