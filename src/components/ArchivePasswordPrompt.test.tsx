import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ArchivePasswordPrompt } from './ArchivePasswordPrompt'
import { localeStore } from '../i18n/locale'

describe('inline archive password input',()=>{
  it.each(['en','zh-CN'] as const)('has explicit %s labels, default hidden input and no account autocomplete',locale=>{
    localeStore.setLocale(locale)
    const html=renderToStaticMarkup(<ArchivePasswordPrompt busy={false} onUnlock={()=>{}} onCancel={()=>{}} />)
    expect(html).toContain('type="password"');expect(html).toContain('autoComplete="off"');expect(html).toContain('spellCheck="false"')
    expect(html).toMatch(/<label for="[^"]+">/);expect(html).toContain('aria-describedby=');expect(html).not.toContain('role="dialog"')
    expect(html).toContain(locale==='en'?'Show password':'显示密码');expect(html).toContain(locale==='en'?'Unlock':'解锁')
    expect(html).not.toMatch(/current-password|new-password|username/)
  })
  it('disables duplicate/empty submission and associates the stable localized error',()=>{
    const html=renderToStaticMarkup(<ArchivePasswordPrompt busy error="ARCHIVE_WRONG_PASSWORD" onUnlock={()=>{}} onCancel={()=>{}} />)
    expect(html).toContain('aria-invalid="true"');expect(html).toContain('role="alert"');expect(html).toContain('The password was not accepted')
    expect(html).toMatch(/<button[^>]+type="submit"[^>]+disabled/);expect(html).toContain('Unlocking entry')
  })
})
