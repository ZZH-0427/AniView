import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('foundation shell', () => {
  it('renders the project identity, target formats, stage and privacy statement', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('<h1>AniView</h1>')
    expect(html).toContain('Local Animated Media Viewer')
    expect(html).toContain('GIF · Animated WebP · APNG')
    expect(html).toContain('Open Images')
    expect(html).toContain('Choose Images')
    expect(html).toContain('accept="image/*"')
    expect(html).toContain('Open archive')
    expect(html).toContain('data-testid="archive-input"')
    expect(html).toContain('accept=".zip,.rar,.7z,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/x-7z-compressed"')
    expect(html).toContain('multiple=""')
    expect(html).not.toContain('capture=')
    expect(html).toContain('Files are processed locally in your browser.')
  })

  it.each(['?spike=webp', '?spike=webp&debug=1'])('keeps the ordinary application for production query %s', search => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('window', { location: { search } })
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('<h1>AniView</h1>')
    expect(html).toContain('Choose Images')
    expect(html).toContain('Open archive')
    expect(html).not.toContain('engineering harness')
    expect(html).not.toContain('Animated WebP technical spike')
  })

  it('keeps the separate engineering harness reachable in development', async () => {
    vi.stubEnv('DEV', true)
    vi.stubGlobal('window', { location: { search: '?spike=webp' } })
    const stream = await renderToReadableStream(<App />)
    await stream.allReady
    const html = await new Response(stream).text()
    expect(html).toContain('<h1>Animated WebP technical spike</h1>')
    expect(html).toContain('Start / Decode next')
    expect(html).not.toContain('Choose Images')
  })
})
