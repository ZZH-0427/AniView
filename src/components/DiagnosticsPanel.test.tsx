import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPanel, ViewerDiagnostics } from './DiagnosticsPanel'
import { RuntimeDiagnosticsPanel } from './RuntimeDiagnostics'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'
import { ViewportController } from '../renderer/viewport-controller'

const metrics = Object.freeze({ cacheBytes: 96, cachedFrames: 6, peakBytes: 96, peakFrames: 6, maxBytes: 16777216, underruns: 0 })
const stepMetrics = Object.freeze({ cacheHits: 2, reconstructions: 1, reconstructedFrames: 28 })
const viewport = new ViewportController()
viewport.resize(400, 300)
viewport.setContent(200, 100)
const info = Object.freeze({ kind: 'animation' as const, width: 200, height: 100,
  name: 'private-local-name.webp', path: 'C:\\private\\local-name.webp' })
const imageDiagnostics = () => <ViewerDiagnostics metrics={metrics} stepMetrics={stepMetrics} view={viewport.snapshot} info={info} />

afterEach(() => vi.unstubAllGlobals())

describe('diagnostics presentation', () => {
  it.each(['', '?debug=0', '?debug=true'])('renders no diagnostic DOM without exact debug=1 (%s)', search => {
    vi.stubGlobal('location', { search })
    expect(renderToStaticMarkup(imageDiagnostics())).toBe('')
    expect(renderToStaticMarkup(<RuntimeDiagnosticsPanel />)).toBe('')
    expect(renderToStaticMarkup(<DiagnosticsPanel title="Private diagnostics">Internal values</DiagnosticsPanel>)).toBe('')
  })

  it('keeps readable groups and original JSON outputs inside two closed disclosures', () => {
    vi.stubGlobal('location', { search: '?debug=1' })
    const html = renderToStaticMarkup(imageDiagnostics())
    expect(html).toContain('<summary>Image diagnostics</summary>')
    expect(html).toContain('data-testid="diagnostics-panel"')
    expect(html).toContain('data-testid="diagnostics-raw"')
    expect(html).toContain('<summary>Raw JSON</summary>')
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/)
    for (const group of ['Playback', 'Frame cache', 'Viewport', 'Media']) expect(html).toContain(`aria-label="${group}"`)
    for (const id of ['playback-metrics', 'step-metrics', 'viewport-metrics', 'media-resource']) expect(html).toContain(`data-testid="${id}"`)
    expect(html).toContain(JSON.stringify(metrics).replaceAll('"', '&quot;'))
    expect(html).toContain(JSON.stringify(stepMetrics).replaceAll('"', '&quot;'))
    expect(html).toContain(JSON.stringify(viewport.snapshot).replaceAll('"', '&quot;'))
  })

  it('shows only the existing numeric media resource fields without local names or paths', () => {
    vi.stubGlobal('location', { search: '?debug=1' })
    const html = renderToStaticMarkup(imageDiagnostics())
    expect(html).not.toContain('private-local-name')
    expect(html).not.toContain('C:\\private')
    expect(html).toContain('{&quot;kind&quot;:&quot;animation&quot;,&quot;width&quot;:200,&quot;height&quot;:100}')
  })

  it('groups runtime snapshots without changing any collection counters', () => {
    vi.stubGlobal('location', { search: '?debug=1' })
    const before = runtimeDiagnostics.getSnapshot()
    const html = renderToStaticMarkup(<RuntimeDiagnosticsPanel />)
    expect(html).toContain('<summary>Resource diagnostics</summary>')
    expect(html).toContain('data-testid="runtime-metrics"')
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/)
    for (const group of ['Resources', 'Archive', 'Errors']) expect(html).toContain(`aria-label="${group}"`)
    expect(html).toContain(JSON.stringify(before).replaceAll('"', '&quot;'))
    expect(runtimeDiagnostics.getSnapshot()).toBe(before)
  })
})
