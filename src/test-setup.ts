import { beforeEach } from 'vitest'
import { localeStore } from './i18n/locale'

// Existing presentation tests describe English. Never depend on the CI/Windows locale.
// Localization cases explicitly select their own locale after this shared setup.
beforeEach(() => { localeStore.setLocale('en') })
