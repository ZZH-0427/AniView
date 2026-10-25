import { describe, expect, it, vi } from 'vitest'
import { CreationSession } from './creation-session'
import { DEFAULT_CREATION_SETTINGS, normalizeCreationSettings } from './creation-types'
import { EncodeError, type EncodedGif, type EncodeOptions } from './gif/model'
import type { EncodeConfiguration } from './gif/encoder-client'
import type { VirtualFile } from '../input/virtual-file'
import { staticFixture } from '../formats/static/static-fixtures.test-support'
import { GIF_CREATION_LIMITS } from './gif/gif-validation'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const file = (name = 'quadrants.png', size?: number): VirtualFile => {
  const data = staticFixture(name)
  return { name, size: size ?? data.byteLength, source: 'file', read: async (start, end) => data.slice(start, end) }
}
const output = (): EncodedGif => ({ data: new Uint8Array([71, 73, 70, 56, 57, 97]).buffer, byteLength: 6,
  metrics: { width: 2, height: 1, frameCount: 2, sourceBytes: 20, outputBytes: 6, outputCapacity: 6,
    decodeMs: 1, quantizeMs: 1, writeMs: 1, totalMs: 4, peakBitmaps: 1, peakRgbaFrames: 1, peakFrameBytes: 8 } })
interface Call { files: readonly VirtualFile[]; options: Partial<EncodeOptions> | undefined; config: EncodeConfiguration | undefined;
  resolve: (result: EncodedGif) => void; reject: (error: Error) => void }
class Encoder {
  calls: Call[] = []
  cancel = vi.fn(async () => {})
  encode(files: readonly VirtualFile[], options?: Partial<EncodeOptions>, config?: EncodeConfiguration) {
    return new Promise<EncodedGif>((resolve, reject) => { this.calls.push({ files, options, config, resolve, reject }) })
  }
}
function setup() {
  const encoder = new Encoder(), revokeUrl = vi.fn(), createUrl = vi.fn(() => `blob:result-${createUrl.mock.calls.length}`)
  const session = new CreationSession({ encoder, createUrl, revokeUrl })
  return { session, encoder, createUrl, revokeUrl }
}
async function ready() { const setupResult = setup(); await setupResult.session.add([file(), file('quadrants.jpg')]); return setupResult }
async function finish(session: CreationSession, encoder: Encoder) { const pending = session.generate(); encoder.calls.at(-1)!.resolve(output()); await pending }

describe('independent CreationSession', () => {
  it('appends more sources, permits duplicate handles and preserves exact order', async () => {
    const { session } = setup(), a = file(), b = file('quadrants.jpg')
    await session.add([a, b]); await session.add([a])
    expect(session.getSnapshot().sources.map(s => s.file)).toEqual([a, b, a])
    expect(new Set(session.getSnapshot().sources.map(s => s.id)).size).toBe(3)
    expect(session.getSnapshot().totalSourceBytes).toBe(a.size * 2 + b.size)
  })
  it('moves up/down with clamped boundaries and removes without disturbing remaining order', async () => {
    const { session } = setup(), sources = [file(), file('quadrants.jpg'), file('quadrants.webp')]
    await session.add(sources)
    const [a, b, c] = session.getSnapshot().sources
    session.move(a!.id, 'up'); session.move(c!.id, 'down')
    expect(session.getSnapshot().sources.map(s => s.file)).toEqual(sources)
    session.move(c!.id, 'up'); session.move(a!.id, 'down')
    expect(session.getSnapshot().sources.map(s => s.file)).toEqual([sources[2], sources[0], sources[1]])
    session.remove(a!.id)
    expect(session.getSnapshot().sources.map(s => s.id)).toEqual([c!.id, b!.id])
  })
  it('accepts exactly 200 and reports extra input without silently truncating', async () => {
    const { session } = setup()
    await session.add(Array.from({ length: 201 }, () => file()))
    expect(session.getSnapshot().sources).toHaveLength(200)
    expect(session.getSnapshot().notice).toContain('1 image not added')
    expect(session.getSnapshot().notice).toContain('200')
  })
  it('accepts exactly 16 MiB and reports files exceeding the cumulative byte budget', async () => {
    const { session } = setup()
    await session.add([file('quadrants.jpg', 8 * 1024 * 1024), file('quadrants.jpg', 8 * 1024 * 1024), file()])
    expect(session.getSnapshot().sources).toHaveLength(2)
    expect(session.getSnapshot().totalSourceBytes).toBe(16 * 1024 * 1024)
    expect(session.getSnapshot().notice).toContain('16 MiB')
  })
  it('accepts later fitting sources after a rejected oversized source', async () => {
    const { session } = setup()
    await session.add([file('quadrants.png', 16 * 1024 * 1024 + 1), file('quadrants.jpg')])
    expect(session.getSnapshot().sources.map(s => s.format)).toEqual(['jpeg'])
    expect(session.getSnapshot().notice).toContain('1 image not added')
  })
  it('detects a wrong extension from bytes and rejects animated/unsupported/corrupt sources with explanations', async () => {
    const { session } = setup(), png = file()
    const bad: VirtualFile = { name: 'animation.png', size: 8, source: 'file', read: async () => new Uint8Array([71,73,70,56,57,97,0,0]).buffer }
    const unknown: VirtualFile = { name: 'unknown.png', size: 4, source: 'file', read: async () => new ArrayBuffer(4) }
    await session.add([{ ...png, name: 'wrong.jpg' }, bad, unknown])
    expect(session.getSnapshot().sources.map(s => s.format)).toEqual(['png'])
    expect(session.getSnapshot().notice).toContain('static JPEG, PNG and WebP')
    expect(session.getSnapshot().notice).toContain('2 images not added')
  })
  it('treats picker cancellation as no change', async () => {
    const { session } = await ready(), before = session.getSnapshot()
    await session.add([])
    expect(session.getSnapshot()).toBe(before)
  })
  it('releases a shared handle only when its last duplicate is removed', async () => {
    const { session } = setup(), release = vi.fn(async () => {}), a = { ...file(), release }
    await session.add([a, a])
    session.remove(session.getSnapshot().sources[0]!.id)
    expect(release).not.toHaveBeenCalled()
    session.remove(session.getSnapshot().sources[0]!.id)
    expect(release).toHaveBeenCalledOnce()
  })
  it('starts with 500 ms forever and publishes no decoded source cache', () => {
    const { session } = setup()
    expect(session.getSnapshot().settings).toEqual(DEFAULT_CREATION_SETTINGS)
    expect(session.getSnapshot().sources).toEqual([])
    expect(session.getSnapshot().result).toBeUndefined()
  })
  it.each([20, 500, 10000])('accepts %i ms', duration => {
    expect(normalizeCreationSettings({ ...DEFAULT_CREATION_SETTINGS, frameDurationMs: duration }).frameDurationMs).toBe(duration)
  })
  it('rounds duration to GIF 10 ms units', () => {
    expect(normalizeCreationSettings({ ...DEFAULT_CREATION_SETTINGS, frameDurationMs: 27 }).frameDurationMs).toBe(30)
  })
  it.each([0, 19, 10001, NaN, Infinity])('rejects invalid duration %s without changing valid settings', duration => {
    const { session } = setup()
    session.updateSettings({ frameDurationMs: duration })
    expect(session.getSnapshot().settings.frameDurationMs).toBe(500)
    expect(session.getSnapshot().error).toContain('20 to 10000')
  })
  it.each([0, -1, 101, 1.5])('rejects invalid total play count %s', playCount => {
    expect(() => normalizeCreationSettings({ ...DEFAULT_CREATION_SETTINGS, playCount })).toThrow('1 to 100')
  })
  it.each([[true, 1, { kind: 'forever' }], [false, 1, { kind: 'once' }], [false, 3, { kind: 'repeat', repeats: 2 }]] as const)(
    'maps forever=%s total plays=%s without leaking vendor repeat semantics', async (loopForever, playCount, loop) => {
      const { session, encoder } = await ready()
      session.updateSettings({ loopForever, playCount, frameDurationMs: 250 })
      await finish(session, encoder)
      expect(encoder.calls[0]!.options).toEqual({ loop, frameDurationMs: 250, colors: 256, alphaThreshold: 127 })
      expect(encoder.calls[0]!.config!.limits).toEqual(GIF_CREATION_LIMITS)
      expect(session.getSnapshot().result?.metadata).toMatchObject({ frameDurationMs: 250, loopForever, playCount })
    },
  )
  it('does not generate with zero or one image', async () => {
    const { session, encoder } = setup()
    await session.generate(); await session.add([file()]); await session.generate()
    expect(encoder.calls).toHaveLength(0)
    expect(session.getSnapshot().error).toContain('2 static images')
  })
  it('forwards real phases, locks conflicting edits and publishes exact Blob metadata', async () => {
    const { session, encoder } = await ready(), original = session.getSnapshot().sources
    const pending = session.generate(), call = encoder.calls[0]!
    expect(session.getSnapshot().status).toBe('preparing')
    session.move(original[0]!.id, 'down'); session.remove(original[0]!.id); session.updateSettings({ frameDurationMs: 100 })
    await session.add([file()])
    expect(session.getSnapshot().sources).toEqual(original)
    expect(session.getSnapshot().settings.frameDurationMs).toBe(500)
    call.config!.onProgress!({ phase: 'quantizing', currentFrame: 1, totalFrames: 2, completedWork: 3, totalWork: 4 })
    expect(session.getSnapshot().status).toBe('encoding')
    call.config!.onProgress!({ phase: 'finalizing', currentFrame: 2, totalFrames: 2, completedWork: 4, totalWork: 4 })
    expect(session.getSnapshot().status).toBe('finalizing')
    call.resolve(output()); await pending
    expect(session.getSnapshot().status).toBe('success')
    expect(session.getSnapshot().result?.blob.type).toBe('image/gif')
    expect(session.getSnapshot().result?.blob.size).toBe(6)
    expect(session.getSnapshot().result?.metadata).toMatchObject({ width: 2, height: 1, frameCount: 2, bytes: 6 })
  })
  it('cancels and immediately reruns while ignoring a late old result/progress', async () => {
    const { session, encoder, createUrl } = await ready(), sources = session.getSnapshot().sources
    const oldJob = session.generate(), old = encoder.calls[0]!
    await session.cancel()
    expect(old.config!.signal!.aborted).toBe(true)
    expect(session.getSnapshot().status).toBe('cancelled')
    expect(session.getSnapshot().sources).toEqual(sources)
    const nextJob = session.generate(), current = encoder.calls[1]!
    old.config!.onProgress!({ phase: 'finalizing', currentFrame: 2, totalFrames: 2 })
    old.resolve(output()); await oldJob
    expect(session.getSnapshot().status).toBe('preparing')
    expect(createUrl).not.toHaveBeenCalled()
    current.resolve(output()); await nextJob
    expect(session.getSnapshot().status).toBe('success')
    expect(session.getSnapshot().diagnostics).toMatchObject({ generations: 2, cancellations: 1 })
  })
  it('replaces/revokes old result only after success, retaining it after errors', async () => {
    const { session, encoder, revokeUrl } = await ready()
    await finish(session, encoder)
    const first = session.getSnapshot().result!
    const failure = session.generate(); encoder.calls.at(-1)!.reject(new EncodeError('DECODE_FAILED')); await failure
    expect(session.getSnapshot().result).toBe(first)
    expect(revokeUrl).not.toHaveBeenCalled()
    await finish(session, encoder)
    expect(session.getSnapshot().result!.url).not.toBe(first.url)
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(first.url)
  })
  it('clears sources/result, revokes URL and leaves settings intact', async () => {
    const { session, encoder, revokeUrl } = await ready()
    session.updateSettings({ frameDurationMs: 100 })
    await finish(session, encoder)
    const url = session.getSnapshot().result!.url
    await session.clear()
    expect(session.getSnapshot()).toMatchObject({ sources: [], totalSourceBytes: 0, status: 'idle', settings: { frameDurationMs: 100 } })
    expect(session.getSnapshot().result).toBeUndefined()
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(url)
  })
  it('disposes idempotently, cancels active work and releases result/source ownership', async () => {
    const { session, encoder, revokeUrl } = await ready()
    await finish(session, encoder)
    const pending = session.generate(), call = encoder.calls.at(-1)!
    const a = session.dispose(), b = session.dispose()
    expect(a).toBe(b)
    await a
    call.resolve(output()); await pending
    expect(revokeUrl).toHaveBeenCalledOnce()
    expect(session.getSnapshot().sources).toEqual([])
    expect(session.getSnapshot().result).toBeUndefined()
  })
  it('does not append source inspection results after clear', async () => {
    let done: (format: { kind: 'png'; animated: false }) => void = () => {}
    const session = new CreationSession({ encoder: new Encoder(), detector: { detect: () => new Promise(resolve => { done = resolve }) } })
    const adding = session.add([file()])
    const clearing = session.clear()
    await tick(); done({ kind: 'png', animated: false })
    await adding; await clearing
    expect(session.getSnapshot().sources).toEqual([])
  })
  it('joins asynchronous source release on dispose, including already removed sources', async () => {
    const { session } = setup()
    let releaseSource: () => void = () => {}
    const release = vi.fn(() => new Promise<void>(resolve => { releaseSource = resolve }))
    await session.add([{ ...file(), release }, file('quadrants.jpg')])
    session.remove(session.getSnapshot().sources[0]!.id)
    let disposed = false
    const ending = session.dispose().then(() => { disposed = true })
    await tick()
    expect(disposed).toBe(false)
    releaseSource()
    await ending
    expect(disposed).toBe(true)
    expect(release).toHaveBeenCalledOnce()
  })
})
