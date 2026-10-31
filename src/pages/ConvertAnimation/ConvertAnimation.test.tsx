import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ConvertAnimation from './ConvertAnimation'
import { ConversionSession } from '../../conversion/conversion-session'
import type { ConversionSnapshot } from '../../conversion/conversion-session'

const file = { name: 'private-source-name.gif', size: 12, source: 'file' as const, read: async () => new ArrayBuffer(12) }
function render(debug = false) {
  const session = new ConversionSession(file)
  const snapshot: ConversionSnapshot = { ...session.getSnapshot(), status: 'ready', sourceFormat: 'gif', deflate: false,
    source: { width: 32, height: 24, frameCount: 2, playCount: 0, durationMs: null } }
  vi.stubGlobal('location', { search: debug ? '?debug=1' : '' })
  try { return renderToStaticMarkup(<ConvertAnimation session={session} snapshot={snapshot} onBack={() => {}} onPreview={() => {}} />) }
  finally { vi.unstubAllGlobals() }
}
describe('conversion product page', () => {
  it('labels targets and controls, disables same-format and unsupported APNG, and reports unknown duration truthfully', () => {
    const html = render()
    expect(html).toContain('Animated WebP'); expect(html).toContain('Already GIF')
    expect(html).toMatch(/disabled=""[^>]*value="gif"/); expect(html).toMatch(/disabled=""[^>]*value="apng"/)
    expect(html).toContain('APNG encoding is not supported'); expect(html).toContain('Not measured yet')
    expect(html).not.toContain('conversion-debug')
  })
  it('keeps diagnostic JSON local numeric/enum only and excludes filenames, media and paths', () => {
    const html = render(true), json = html.match(/<output data-testid="conversion-debug">(.*?)<\/output>/)![1]!
    expect(json).toContain('conversionsStarted'); expect(json).toContain('activeDecoderWorkers')
    expect(json).not.toContain(file.name); expect(json).not.toContain('blob:'); expect(json).not.toContain('rgba')
  })
})
