import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaError } from '../media/errors'
import { catalog, messages, numberText, translate, translateMessage } from './messages'
import { mediaMessage } from './media-errors'
import { videoErrorMessage } from '../video-conversion/errors'
import { conversionErrorMessage } from '../conversion/conversion-session'
afterEach(() => vi.unstubAllEnvs())

describe('complete bilingual message catalog', () => {
  it('has exactly equal, nonempty keys and placeholder sets in both languages', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages['zh-CN']).sort())
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
    for (const [key, [en, zh]] of Object.entries(catalog)) {
      expect(en.trim(), key).not.toBe(''); expect(zh.trim(), key).not.toBe('')
      expect(placeholders(en), key).toEqual(placeholders(zh))
      expect(/[\u3400-\u9fff]/.test(en), key).toBe(false)
    }
  })
  it('interpolates counts in natural locale-specific sentences', () => {
    expect(translate('en', 'progress.sampling', { current: 20, total: 75 })).toBe('Sampling 20 / 75')
    expect(translate('zh-CN', 'progress.sampling', { current: 20, total: 75 })).toBe('正在采样 20 / 75')
    expect(numberText('en', 1234)).toBe('1,234')
    expect(numberText('zh-CN', 1.2, 3)).toBe('1.200')
  })
  it('renders interpolation as ordinary escaped text without interpreting nested tokens', () => {
    const name = '<script>{format}</script>'
    const text = translate('zh-CN', 'creator.imageLabel', { number: 1, name })
    expect(text).toContain(name)
    const html = renderToStaticMarkup(<p>{text}</p>)
    expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;')
  })
  it('fails loudly for missing keys/parameters in development instead of leaking keys or undefined', () => {
    expect(() => Reflect.apply(translate, undefined, ['en', 'unknown.key'])).toThrow('Missing translation')
    expect(() => Reflect.apply(translate, undefined, ['en', 'toString'])).toThrow('Missing translation')
    expect(() => translate('zh-CN', 'progress.sampling')).toThrow('Missing translation parameters')
  })
  it('maps stable error codes in either locale without using their English sentence', () => {
    const error = new MediaError('ARCHIVE_ENCRYPTED')
    error.message = 'This sentence is intentionally irrelevant'
    expect(translateMessage('zh-CN', mediaMessage(error))).toContain('密码保护')
    expect(videoErrorMessage('VIDEO_CODEC_UNSUPPORTED', 'zh-CN')).toContain('视频编码')
    expect(conversionErrorMessage('VIDEO_MUX_FAILED', 'mp4', 'zh-CN')).toContain('封装')
    expect(translateMessage('zh-CN', mediaMessage(Error('secret raw exception')))).not.toContain('secret')
    expect(Reflect.apply(videoErrorMessage, undefined, ['UNKNOWN', 'zh-CN'])).toContain('无法读取')
    expect(Reflect.apply(conversionErrorMessage, undefined, ['UNKNOWN', 'gif', 'zh-CN'])).toContain('无法生成')
  })
  it('safely falls back in production for unknown keys or incomplete parameters', () => {
    vi.stubEnv('DEV', false)
    expect(Reflect.apply(translate, undefined, ['zh-CN', 'unknown.key'])).toBe(messages['zh-CN']['errors.generic'])
    expect(translate('en', 'progress.sampling')).toBe(messages.en['errors.generic'])
  })
})
