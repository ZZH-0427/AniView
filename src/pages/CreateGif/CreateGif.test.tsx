import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreationSession } from '../../creation/creation-session'
import type { CreationSnapshot } from '../../creation/creation-types'
import type { EncodedGif } from '../../creation/gif/model'
import type { VirtualFile } from '../../input/virtual-file'
import CreateGif from './CreateGif'

const source = (name: string): VirtualFile => ({ name, source: 'file', size: 256, read: async () => new ArrayBuffer(256) })
const output = (): EncodedGif => ({ data: new ArrayBuffer(4096), byteLength: 300, metrics: {
  decodeMs: 1, quantizeMs: 2, writeMs: 1, totalMs: 6, peakBitmaps: 1, peakRgbaFrames: 1,
  peakFrameBytes: 32, outputBytes: 300, outputCapacity: 4096, frameCount: 2, width: 4, height: 2, sourceBytes: 512,
} })
function session() {
  return new CreationSession({ detector: { detect: async () => ({ kind: 'png', animated: false }) },
    encoder: { encode: async () => output(), cancel: async () => {} }, createUrl: () => 'blob:local-generated-gif', revokeUrl: () => {} })
}
const render = (value: CreationSession) => renderToStaticMarkup(<CreateGif session={value} onBack={() => {}} onPreview={() => {}} />)
const tag = (html: string, id: string) => html.match(new RegExp(`<[^>]+data-testid="${id}"[^>]*>`))?.[0] ?? ''
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('GIF creation presentation', () => {
  it('starts with a static multiple picker, honest limits and disabled generation', () => {
    const html = render(session())
    expect(html).toContain('Create an animated GIF from static images.')
    expect(tag(html, 'creation-input')).toContain('accept="image/*"')
    expect(tag(html, 'creation-input')).toContain('multiple=""')
    expect(html).not.toContain('capture=')
    expect(html).toContain('0 / 200 images')
    expect(html).toContain('0.00 MiB / 16 MiB')
    expect(tag(html, 'creation-generate')).toContain('disabled=""')
    expect(html).not.toContain('data-testid="creation-debug"')
    expect(html).not.toContain('Creation diagnostics')
  })
  it('associates labels with conservative duration and total-play settings', () => {
    const html = render(session())
    expect(html).toContain('for="creation-duration"')
    expect(html).toMatch(/id="creation-duration"[^>]+min="20"[^>]+max="10000"[^>]+step="10"[^>]+value="500"/)
    expect(html).toContain('for="creation-loop-forever"')
    expect(html).toMatch(/id="creation-loop-forever"[^>]+checked=""/)
    expect(html).not.toContain('id="creation-play-count"')
    expect(html).toContain('original pixel size')
    expect(html).toContain('256 colors and 1-bit transparency')
    expect(html).toContain('visible banding or hard edges')
    expect(html).not.toContain('Alpha threshold')
    expect(html).not.toContain('quality slider')
  })
  it('requires at least two sources and exposes accessible ordering/removal', async () => {
    const value = session()
    await value.add([source('first.png')])
    expect(tag(render(value), 'creation-generate')).toContain('disabled=""')
    await value.add([source('very-long-file-name-with-original-order.png')])
    const html = render(value)
    expect(tag(html, 'creation-generate')).not.toContain('disabled=')
    expect(html.indexOf('first.png')).toBeLessThan(html.indexOf('very-long-file-name-with-original-order.png'))
    expect(html.match(/data-testid="creation-source-row"/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Move up" title="Move up"')
    expect(html).toContain('data-action="down"')
    expect(html).toContain('data-action="remove"')
    expect(html).toContain('title="very-long-file-name-with-original-order.png"')
    expect(html).toContain('PNG · 256 B')
    expect(html).toContain('2 / 200 images')
    expect(html).not.toContain('<img')
    await value.dispose()
  })
  it('shows bounded total play count rather than vendor repeat semantics', () => {
    const value = session()
    value.updateSettings({ loopForever: false, playCount: 3 })
    const html = render(value)
    expect(html).toContain('for="creation-play-count"')
    expect(html).toMatch(/id="creation-play-count"[^>]+min="1"[^>]+max="100"[^>]+value="3"/)
    expect(html).toContain('Total complete plays, from 1 to 100.')
    expect(html).not.toContain('gifenc')
    expect(html).not.toContain('centisecond')
  })
  it('publishes result metadata and local preview/download actions without native animation', async () => {
    const value = session()
    await value.add([source('one.png'), source('two.png')])
    value.updateSettings({ frameDurationMs: 250, loopForever: false, playCount: 2 })
    await value.generate()
    const html = render(value)
    expect(html).toContain('data-testid="creation-result"')
    expect(html).toContain('4 × 2')
    expect(html).toContain('250 ms')
    expect(html).toContain('2 plays')
    expect(html).toContain('300 B')
    expect(tag(html, 'creation-download')).toContain('href="blob:local-generated-gif"')
    expect(tag(html, 'creation-download')).toContain('download="aniview-animation.gif"')
    expect(tag(html, 'creation-preview')).not.toContain('disabled=')
    expect(html).not.toContain('<img')
    await value.dispose()
  })
  it('locks conflicting edits while showing real progress and cancellation', async () => {
    const value = session()
    await value.add([source('one.png'), source('two.png')])
    const snapshot: CreationSnapshot = { ...value.getSnapshot(), status: 'encoding',
      progress: { phase: 'quantizing', currentFrame: 1, totalFrames: 2, completedWork: 3, totalWork: 4 } }
    vi.spyOn(value, 'getSnapshot').mockReturnValue(snapshot)
    const html = render(value)
    expect(html).toContain('Encoding 2 / 2')
    expect(tag(html, 'creation-progress')).toContain('value="3"')
    expect(tag(html, 'creation-progress')).toContain('max="4"')
    expect(tag(html, 'creation-input')).toContain('disabled=""')
    expect(tag(html, 'creation-generate')).toContain('disabled=""')
    expect(tag(html, 'creation-cancel')).not.toContain('disabled=')
    expect(html).toMatch(/id="creation-duration"[^>]+disabled=""/)
    expect(html).toMatch(/data-action="remove"[^>]+disabled=""/)
    await value.dispose()
  })
  it('presents cancellation as recoverable state and keeps raw diagnostics nested and numeric', async () => {
    const value = session()
    await value.add([source('local-private-name.png'), source('other.png')])
    vi.spyOn(value, 'getSnapshot').mockReturnValue({ ...value.getSnapshot(), status: 'cancelled', notice: 'Sources and settings retained.' })
    vi.stubGlobal('location', { search: '?debug=1' })
    const html = render(value)
    expect(html).toContain('Generation cancelled')
    expect(html).not.toContain('role="alert"')
    expect(html).toContain('<details class="diagnostics-panel"')
    expect(html).toContain('<details class="diagnostics-raw">')
    expect(html).not.toContain('open=""')
    const debug = html.match(/<output data-testid="creation-debug">([^<]*)<\/output>/)?.[1]
    expect(debug).toContain('generations')
    expect(debug).toContain('activeWorkers')
    expect(debug).not.toContain('local-private-name')
    expect(debug).not.toContain('other.png')
    expect(tag(html, 'creation-generate')).not.toContain('disabled=')
    await value.dispose()
  })
})
