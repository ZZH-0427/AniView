import { useId } from 'react'
import { useI18n } from './index'
import { isLocale } from './locale'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n(), id = useId()
  return <label className="language-switcher" htmlFor={id}>
    <span>{t('language.label')}</span>
    <select id={id} aria-label={t('language.label')} value={locale} data-testid="locale-switcher"
      onChange={event => { if (isLocale(event.currentTarget.value)) setLocale(event.currentTarget.value) }}>
      <option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">简体中文</option>
    </select>
  </label>
}
