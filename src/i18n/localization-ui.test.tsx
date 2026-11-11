import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../app/App'
import { CreationSession } from '../creation/creation-session'
import type { StaticAnimationOutput } from '../creation/static-animation-encoder'
import { creationOutput } from '../creation/creation.test-support'
import { staticFixture } from '../formats/static/static-fixtures.test-support'
import type { VirtualFile } from '../input/virtual-file'
import CreateGif from '../pages/CreateGif/CreateGif'
import { PlaybackControls } from '../pages/Viewer/ViewerControls'
import ConvertAnimation from '../pages/ConvertAnimation/ConvertAnimation'
import { ConversionSession } from '../conversion/conversion-session'
import ConvertVideo from '../video-conversion/ConvertVideo'
import { VideoConversionSession } from '../video-conversion/video-conversion-session'
import { estimateVideo } from '../video-conversion/settings'
import type { VideoInspection } from '../video-source/model'
import { localeStore } from './locale'

const source = (name = 'original-photo.png'): VirtualFile => {
  const bytes = staticFixture('quadrants.png')
  return { name, source: 'file', size: bytes.byteLength, read: async () => bytes }
}
const renderCreator = (session: CreationSession) => renderToStaticMarkup(<CreateGif session={session} onBack={() => {}} onPreview={() => {}} />)
const info: VideoInspection = { container: 'mp4', codec: 'avc', codecString: 'avc1.64000a', codedWidth: 64, codedHeight: 48,
  displayWidth: 64, displayHeight: 48, squarePixelWidth: 64, squarePixelHeight: 48, rotation: 0, flip: false,
  timeResolution: 90000, visibleStartTicks: 0, visibleEndTicks: 90000, durationUs: 1000000, firstPacketTimestamp: 0,
  secureContext: true, apiPresent: true, configSupported: true, decoderInitialized: true, firstDecoded: true,
  firstDraw: true, nativeMemoryBytes: null, colorPolicy: 'SDR8-browser-to-sRGB', alpha: false, audio: 'ignored', trackSelection: 'primary' }
afterEach(() => { localeStore.setLocale('en'); vi.unstubAllGlobals() })

describe('localized ordinary UI without workspace reset', () => {
  it.each(['en', 'zh-CN'] as const)('renders a coherent %s Home and accessible language utility', locale => {
    localeStore.setLocale(locale)
    const html = renderToStaticMarkup(<App />), ordinary = html.replace(/<option[\s\S]*?<\/option>/g, '')
    expect(html).toContain('data-testid="locale-switcher"')
    expect(html).toContain(locale === 'en' ? 'aria-label="Language"' : 'aria-label="界面语言"')
    const creatorName = locale === 'en' ? 'Create animation' : '制作动图'
    expect(html).toContain(`aria-label="${creatorName}" title="${creatorName}"`)
    expect(html).toContain(`>${creatorName}</span>`)
    expect(html).not.toContain(locale === 'en' ? 'Create GIF' : '创建 GIF')
    expect(html).toContain(locale === 'en' ? 'Convert video' : '转换视频')
    expect(html).toContain(locale === 'en' ? 'Open archive' : '打开压缩包')
    if (locale === 'en') expect(/[\u3400-\u9fff]/.test(ordinary)).toBe(false)
    else expect(ordinary).not.toContain('Your images, on your device')
  })
  it.each(['en', 'zh-CN'] as const)('names the Creator and its helpers consistently in %s, preserving the GIF action', async locale => {
    localeStore.setLocale(locale)
    const session = new CreationSession(), name = locale === 'en' ? 'Create animation' : '制作动图'
    const empty = renderCreator(session)
    expect(empty).toContain(`<h1>${name}</h1>`)
    expect(empty).toContain(locale === 'en' ? 'Add images to create an animation.' : '添加图片以制作动图。')
    expect(empty).not.toContain(locale === 'en' ? 'Create GIF' : '创建 GIF')
    await session.add([source()])
    const snapshot = session.getSnapshot(), html = renderCreator(session)
    expect(html).toContain(locale === 'en' ? 'Add at least one more static image to create an animation.' : '请至少再添加 1 张静态图片，才能制作动图。')
    expect(html).toContain(locale === 'en' ? 'aria-label="Generate GIF"' : 'aria-label="生成 GIF"')
    expect(html).toMatch(/data-testid="creation-generate"[^>]*disabled=""/)
    expect(session.getSnapshot()).toBe(snapshot)
    await session.dispose()
  })
  it('localizes icon-only playback names, not only visible labels', () => {
    localeStore.setLocale('zh-CN')
    const html = renderToStaticMarkup(<PlaybackControls status="paused" ready busy={false} frame={2} total={5}
      onStep={() => {}} onToggle={() => {}} onReplay={() => {}} />)
    for (const label of ['动画播放', '上一帧', '下一帧', '播放', '从头播放']) expect(html).toContain(`aria-label="${label}"`)
    expect(html).not.toContain('Previous Frame')
  })
  it('switches the one-image helper without changing sources or settings', async () => {
    const session = new CreationSession()
    await session.add([source('original-photo.png')])
    const snapshot = session.getSnapshot()
    expect(renderCreator(session)).toContain('Add at least one more static image')
    localeStore.setLocale('zh-CN')
    const html = renderCreator(session)
    expect(html).toContain('请至少再添加 1 张静态图片')
    expect(html).toContain('original-photo.png')
    expect(session.getSnapshot()).toBe(snapshot)
    await session.add([source('second.png')])
    expect(renderCreator(session)).not.toContain('creation-minimum-sources')
    await session.dispose()
  })
  it('translates an existing settings error from structured metadata without rerunning settings changes', async () => {
    const session = new CreationSession(); session.updateSettings({ frameDurationMs: 1 })
    const snapshot = session.getSnapshot()
    expect(snapshot.errorMessage?.key).toBe('errors.creationDuration')
    expect(renderCreator(session)).toContain('Choose a frame duration')
    localeStore.setLocale('zh-CN')
    expect(renderCreator(session)).toContain('每帧时长须为')
    expect(session.getSnapshot()).toBe(snapshot)
    await session.dispose()
  })
  it('keeps rejected-source reasons localizable after admission finishes', async () => {
    const session = new CreationSession({ detector: { detect: async () => ({ kind: 'gif', animated: true }) } })
    await session.add([source()]); const snapshot = session.getSnapshot()
    expect(renderCreator(session)).toContain('1 image not added')
    localeStore.setLocale('zh-CN')
    const html = renderCreator(session)
    expect(html).toContain('1 张图片未添加'); expect(html).toContain('仅支持静态 JPEG')
    expect(html).not.toContain('Animation creation currently accepts')
    expect(session.getSnapshot()).toBe(snapshot); await session.dispose()
  })
  it('does not restart or cancel an active generation and retains the same result Blob', async () => {
    let finish!: (result: StaticAnimationOutput) => void
    const encode = vi.fn(() => new Promise<StaticAnimationOutput>(resolve => { finish = resolve })), cancel = vi.fn(async () => {})
    const session = new CreationSession({ encoder: { encode, cancel }, inspect: async () => ({ width: 2, height: 1, frameCount: 2, playCount: 0, durationMs: 1000 }),
      createUrl: () => 'blob:one-result', revokeUrl: () => {} })
    await session.add([source(), source('two.png')]); const work = session.generate(), active = session.getSnapshot()
    localeStore.setLocale('zh-CN'); expect(renderCreator(session)).toContain('正在准备图片')
    expect(session.getSnapshot()).toBe(active); expect(encode).toHaveBeenCalledTimes(1); expect(cancel).not.toHaveBeenCalled()
    finish(creationOutput())
    await work; const result = session.getSnapshot().result
    expect(renderCreator(session)).toContain('已生成 GIF')
    localeStore.setLocale('en'); expect(renderCreator(session)).toContain('Generated GIF')
    expect(session.getSnapshot().result).toBe(result); await session.dispose()
  })
  it('updates conversion progress and errors from the same immutable snapshot', () => {
    const session = new ConversionSession(source()), snapshot = { ...session.getSnapshot(), status: 'converting' as const,
      sourceFormat: 'gif' as const, deflate: true, target: 'webp' as const,
      progress: { phase: 'encoding' as const, currentFrame: 1, totalFrames: 6 } }
    const render = () => renderToStaticMarkup(<ConvertAnimation session={session} snapshot={snapshot} onBack={() => {}} onPreview={() => {}} />)
    expect(render()).toContain('Encoding · Frame 2 / 6')
    localeStore.setLocale('zh-CN'); expect(render()).toContain('正在编码 · 第 2 / 6 帧')
    expect(snapshot.progress.currentFrame).toBe(1)
  })
  it('preserves trim, target, FPS, and error IDs while translating an existing preflight', () => {
    const session = new VideoConversionSession(), settings = { ...session.getSnapshot().settings, startUs: 800000, endUs: 600000 }
    const preflight = estimateVideo(info, settings), snapshot = { ...session.getSnapshot(), status: 'ready' as const, metadata: info, settings, preflight }
    const render = () => renderToStaticMarkup(<ConvertVideo session={session} snapshot={snapshot} onBack={() => {}} onPreview={() => {}} />)
    const en = render(); localeStore.setLocale('zh-CN'); const zh = render()
    expect(en).toContain('Start before End'); expect(zh).toContain('开始时间须早于结束时间')
    const described = (html: string) => html.match(/aria-invalid="true" aria-describedby="([^"]+)"/)?.[1]
    expect(described(zh)).toBe(described(en)); expect(described(zh)).toBeTruthy()
    expect(zh).toContain('value="0.8"'); expect(zh).toContain('value="0.6"')
    expect(snapshot.settings).toBe(settings); expect(session.getSnapshot().diagnostics.videoAnimationJobsStarted).toBe(0)
  })
})
