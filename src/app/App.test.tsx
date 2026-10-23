import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('foundation shell', () => {
  it('renders the project identity, target formats, stage and privacy statement', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('<h1>AniView</h1>')
    expect(html).toContain('Local Animated Media Viewer')
    expect(html).toContain('GIF · Animated WebP · APNG')
    expect(html).toContain('Open Images')
    expect(html).toContain('选择图片')
    expect(html).toContain('accept="image/*"')
    expect(html).toContain('Open ZIP')
    expect(html).toContain('打开 ZIP 压缩包')
    expect(html).toContain('data-testid="archive-input"')
    expect(html).toContain('accept=".zip,application/zip,application/x-zip-compressed"')
    expect(html).toContain('multiple=""')
    expect(html).not.toContain('capture=')
    expect(html).toContain('Files are processed locally in your browser.')
  })
})
