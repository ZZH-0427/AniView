import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { creationErrorMessage } from '../creation/creation-session'
import { EncodeError } from '../creation/gif/model'
import type { VideoInspection } from '../video-source/model'
import ConvertVideo from './ConvertVideo'
import { estimateVideo } from './settings'
import type { VideoSettings } from './settings'
import { VideoConversionSession } from './video-conversion-session'
import type { VideoConversionSnapshot } from './video-conversion-session'

const info: VideoInspection = { container: 'mp4', codec: 'avc', codecString: 'avc1.64000a',
  codedWidth: 64, codedHeight: 48, displayWidth: 64, displayHeight: 48, squarePixelWidth: 64, squarePixelHeight: 48,
  rotation: 0, flip: false, timeResolution: 90000, visibleStartTicks: 0, visibleEndTicks: 90000, durationUs: 1000000,
  firstPacketTimestamp: 0, secureContext: true, apiPresent: true, configSupported: true, decoderInitialized: true,
  firstDecoded: true, firstDraw: true, nativeMemoryBytes: null, colorPolicy: 'SDR8-browser-to-sRGB',
  alpha: false, audio: 'ignored', trackSelection: 'primary' }
const session = new VideoConversionSession()
function prepared(patch: Partial<VideoSettings> = {}, metadata = info): VideoConversionSnapshot {
  const settings = { ...session.getSnapshot().settings, startUs: 0, endUs: 1000000, ...patch }
  return { ...session.getSnapshot(), status: 'ready', sourceName: 'local-fixture.mp4', metadata, settings,
    preflight: estimateVideo(metadata, settings) }
}
const render = (snapshot: VideoConversionSnapshot) => renderToStaticMarkup(
  <ConvertVideo session={session} snapshot={snapshot} onBack={() => {}} onPreview={() => {}} />)
const tag = (html: string, id: string) => html.match(new RegExp(`<[^>]+data-testid="${id}"[^>]*>`))?.[0] ?? ''
const fieldset = (html: string, legend: string) => html.match(new RegExp(`<fieldset[^>]*><legend>${legend}</legend>[\\s\\S]*?</fieldset>`))?.[0] ?? ''
afterEach(() => vi.unstubAllGlobals())

describe('release-required video UI presentation', () => {
  it('keeps useful estimates without an engineering budget in ordinary mode', () => {
    const html = render(prepared())
    for (const label of ['Selected duration', 'FPS', 'Sampled frames', 'Output dimensions']) expect(html).toContain(label)
    expect(html).not.toMatch(/frame.pixel|workload|15\.36|15360000/i)
    expect(html).not.toContain('video-conversion-debug')
  })
  it('retains the exact plan and limit in local debug diagnostics', () => {
    vi.stubGlobal('location', { search: '?debug=1' })
    const html = render(prepared())
    const raw = html.match(/data-testid="video-conversion-debug">([^<]*)</)?.[1]?.replaceAll('&quot;', '"')
    const debug = JSON.parse(raw ?? '{}')
    expect(debug.plan.framePixels).toBe(64 * 48 * 15)
    expect(debug.estimate.framePixels).toBe(debug.plan.framePixels)
    expect(debug.limits.maxFramePixels).toBe(15360000)
    expect(html).not.toContain('<dt>Frame-pixel workload</dt>')
  })
  it('retains an over-budget estimate in debug without weakening rejection', () => {
    vi.stubGlobal('location', { search: '?debug=1' })
    const snapshot = prepared({ endUs: 5000000, longSide: 720 }, { ...info, displayWidth: 1280, displayHeight: 720, durationUs: 10000000 })
    expect(snapshot.preflight).toMatchObject({ ok: false, issue: 'workload' })
    const html = render(snapshot), raw = html.match(/data-testid="video-conversion-debug">([^<]*)</)?.[1]?.replaceAll('&quot;', '"')
    const debug = JSON.parse(raw ?? '{}')
    expect(debug.plan).toBeNull()
    expect(debug.estimate.framePixels).toBeGreaterThan(debug.limits.maxFramePixels)
    expect(debug.preflightIssue).toBe('workload')
    expect(tag(html, 'video-convert')).toContain('disabled=""')
  })
  it('keeps the Creator workload error actionable without exposing the budget', () => {
    const message = creationErrorMessage(new EncodeError('RESOURCE_LIMIT', { detail: {
      kind: 'workload', width: 2048, height: 2048, frameCount: 4, actual: 16777216, limit: 15360000 } }))
    expect(message).toContain('Reduce the number of images or use smaller images')
    expect(message).not.toMatch(/frame.pixel|15,?360,?000/i)
  })
  it.each(['VIDEO_CONTAINER_UNSUPPORTED', 'VIDEO_CODEC_UNSUPPORTED', 'VIDEO_DECODE_FAILED'] as const)(
    'puts admission failure %s beside the file input, once', error => {
      const html = render({ ...session.getSnapshot(), status: 'error', sourceName: 'local-fixture.mp4', error })
      const source = html.match(/<section[^>]+data-testid="video-source-section">[\s\S]*?<\/section>/)?.[0] ?? ''
      expect(source).toContain('data-error-location="source"')
      expect(tag(html, 'video-input')).toContain('aria-invalid="true"')
      const id = source.match(/role="alert" id="([^"]+)"/)?.[1]
      expect(id).toBeTruthy()
      expect(tag(html, 'video-input')).toContain(`aria-describedby="${id}"`)
      expect(html.match(/role="alert"/g)).toHaveLength(1)
      expect(html).not.toContain('data-error-location="job"')
    })
  it('puts source preparation beside the picker without a second job announcement', () => {
    const html = render({ ...session.getSnapshot(), status: 'preparing', sourceName: 'local-fixture.mp4' })
    expect(html.indexOf('Preparing video…')).toBeLessThan(html.indexOf('<legend>Trim</legend>'))
    expect(html.match(/role="status"/g)).toHaveLength(1)
  })
  it.each([
    { startUs: 800000, endUs: 600000 }, { endUs: 1100000 }, { startUs: NaN },
  ])('associates an invalid trim with its group and both inputs: %j', patch => {
    const html = render(prepared(patch)), trim = fieldset(html, 'Trim')
    expect(trim).toContain('aria-invalid="true"')
    const id = trim.match(/<p id="([^"]+)" data-testid="video-preflight-error"/)?.[1]
    expect(id).toBeTruthy()
    for (const testId of ['video-start-time', 'video-end-time']) expect(tag(html, testId)).toContain(`aria-describedby="${id}"`)
    expect(trim).toContain('data-error-location="trim"')
    expect(trim).not.toContain('role="alert"')
    expect(html.match(/data-testid="video-preflight-error"/g)).toHaveLength(1)
    expect(tag(html, 'video-convert')).toContain('disabled=""')
  })
  it('keeps the 30-second error in Trim, then clears associations after correction', () => {
    const long = prepared({ endUs: 31000000 }, { ...info, durationUs: 60000000 })
    expect(long.preflight).toMatchObject({ ok: false, issue: 'duration' })
    expect(fieldset(render(long), 'Trim')).toContain('up to 30 seconds')
    const corrected = render(prepared())
    expect(corrected).not.toContain('aria-invalid="true"')
    expect(tag(corrected, 'video-start-time')).not.toContain('aria-describedby')
    expect(tag(corrected, 'video-convert')).not.toContain('disabled=')
  })
  it('associates a frame budget error with Output, not Trim', () => {
    const html = render(prepared({ endUs: 6000000, fps: 30 }, { ...info, durationUs: 10000000 }))
    expect(html).toContain('Reduce the clip duration or FPS')
    expect(html).toContain('data-error-location="output"')
    expect(fieldset(html, 'Output')).toContain('aria-describedby=')
    expect(fieldset(html, 'Trim')).not.toContain('aria-invalid=')
    expect(html.indexOf('data-error-location="output"')).toBeLessThan(html.indexOf('data-testid="video-convert"'))
  })
  it.each(['WORKER_FAILED', 'VIDEO_DECODE_FAILED', 'TARGET_ENCODE_FAILED'] as const)(
    'leaves runtime failure %s in the job area after admission', error => {
      const html = render({ ...prepared(), status: 'error', error })
      expect(html).toContain('data-error-location="job"')
      expect(html.indexOf('data-error-location="job"')).toBeGreaterThan(html.indexOf('data-testid="video-convert"'))
      expect(html).not.toContain('data-error-location="source"')
      expect(html.match(/role="alert"/g)).toHaveLength(1)
    })
})
