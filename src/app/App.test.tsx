import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('foundation shell', () => {
  it('renders the project identity, target formats, stage and privacy statement', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('<h1>AniView</h1>')
    expect(html).toContain('Local Animated Media Viewer')
    expect(html).toContain('GIF · Animated WebP · APNG')
    expect(html).toContain('Viewer foundation ready')
    expect(html).toContain('Early development.')
    expect(html).toContain('Files are processed locally in your browser.')
  })
})
