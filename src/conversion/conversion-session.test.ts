import { describe, expect, it, vi } from 'vitest'
import { ConversionSession, resultVirtualFile } from './conversion-session'
import type { ConversionDependencies } from './convert'
import type { AnimationFrameSource, CanonicalAnimationMetadata, ConversionFormat } from './model'
import { ConversionError } from './model'
import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'

const gate = () => { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }
function fixture(meta: CanonicalAnimationMetadata = { width: 2, height: 2, frameCount: 2, playCount: 2 }) {
  const release = vi.fn(), revokeUrl = vi.fn(), createUrl = vi.fn(() => 'blob:local-result')
  const file: VirtualFile = { name: 'borrowed-source.gif', size: 1, source: 'archive', read: async () => new ArrayBuffer(1), release }
  const options = { target: 'webp' as ConversionFormat, deflate: true, hold: undefined as ReturnType<typeof gate> | undefined }
  const accepted = gate()
  const source = vi.fn(async (): Promise<AnimationFrameSource> => {
    let index = 0
    return { metadata: meta, metrics: { decodeMs: 1, decoderHeapBytes: 0, decoderBackupBytes: 0 },
      next: async () => index < meta.frameCount ? { index: index++, durationMs: 27, rgba: new ArrayBuffer(meta.width * meta.height * 4) } : null,
      acknowledgeFrame: () => {}, reset: async () => { index = 0 }, close: vi.fn(async () => {}) }
  })
  const pipeline: ConversionDependencies = { source, encoder: () => ({ capabilities: { deflate: options.deflate }, open: async () => {},
    addFrame: async frame => { structuredClone(frame.rgba, { transfer: [frame.rgba] }); accepted.resolve(); await options.hold?.promise },
    finish: async () => ({ data: new ArrayBuffer(12), byteLength: 9, metrics: { encodeMs: 1, outputBytes: 9, outputCapacity: 12 } }),
    dispose: () => options.hold?.resolve() }) }
  const detector = { detect: vi.fn(async (input: VirtualFile) => input === file
    ? { kind: 'gif' as const, animated: true as const }
    : options.target === 'webp' ? { kind: 'webp' as const, animated: true as const }
      : options.target === 'apng' ? { kind: 'apng' as const, animated: true as const } : { kind: 'gif' as const, animated: true as const }) }
  const inspect = vi.fn(async () => ({ ...meta, frameCount: options.target === 'webp' ? 1 : meta.frameCount, durationMs: 54 }))
  const session = new ConversionSession(file, { pipeline, detector, inspect, createUrl, revokeUrl })
  return { session, file, options, detector, source, inspect, createUrl, revokeUrl, release, accepted }
}
describe('conversion product ownership', () => {
  it('prepares binary-verified metadata without consuming or releasing the borrowed archive source', async () => {
    const f = fixture(); await f.session.prepare()
    expect(f.session.getSnapshot()).toMatchObject({ status: 'ready', sourceFormat: 'gif', target: 'webp', source: { durationMs: null }, deflate: true,
      diagnostics: { activeDecoderWorkers: 0, activeEncoderWorkers: 0 } })
    await f.session.dispose(); expect(f.release).not.toHaveBeenCalled()
  })
  it.each(['png', 'jpeg', 'webp'] as const)('rejects static %s even with an animated-looking filename', async kind => {
    const file: VirtualFile = { name: 'false.gif', size: 1, source: 'file', read: async () => new ArrayBuffer(1) }
    const session = new ConversionSession(file, { detector: { detect: async () => ({ kind, animated: false }) } })
    await session.prepare(); expect(session.getSnapshot().error).toBe('SOURCE_UNSUPPORTED'); await session.dispose()
  })
  it('keeps same-format disabled and refuses unsupported APNG before a job starts', async () => {
    const f = fixture(); f.options.deflate = false; await f.session.prepare()
    f.session.selectTarget('gif'); expect(f.session.getSnapshot().target).toBe('webp')
    f.session.selectTarget('apng'); expect(f.session.getSnapshot().target).toBe('webp')
    expect(f.session.getSnapshot().diagnostics.conversionsStarted).toBe(0); await f.session.dispose()
  })
  it('publishes inspected output frame count and duration rather than source metadata', async () => {
    const f = fixture(); await f.session.prepare(); await f.session.start()
    const state = f.session.getSnapshot()
    expect(state).toMatchObject({ status: 'success', source: { frameCount: 2, durationMs: 54 }, result: { metadata: { frameCount: 1, durationMs: 54 }, format: 'webp' },
      diagnostics: { conversionsStarted: 1, conversionsCompleted: 1, peakRgbaFrames: 1, activeDecoderWorkers: 0, activeEncoderWorkers: 0, activeObjectUrls: 1 } })
    expect(state.result!.blob.size).toBe(9)
    expect((await resultVirtualFile(state.result!).read()).byteLength).toBe(9)
    await f.session.dispose(); expect(f.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:local-result')
  })
  it('uses PNG extension/MIME for APNG and a distinct actual name on every activation', async () => {
    const f = fixture(); await f.session.prepare(); f.options.target = 'apng'; f.session.selectTarget('apng'); await f.session.start()
    expect(f.session.getSnapshot().result!.blob.type).toBe('image/png')
    const names = [f.session.nextDownloadName(), f.session.nextDownloadName(), f.session.nextDownloadName()]
    expect(new Set(names).size).toBe(3); expect(names.every(name => name.startsWith('borrowed-source-') && name.endsWith('.png'))).toBe(true)
    await f.session.dispose()
  })
  it('releases a replaced result URL and retains neither decoded frames nor source ownership', async () => {
    const f = fixture(); await f.session.prepare(); await f.session.start(); f.session.selectTarget('apng')
    expect(f.revokeUrl).toHaveBeenCalledTimes(1); expect(f.session.getSnapshot().result).toBeUndefined()
    expect(f.session.getSnapshot().diagnostics.activeObjectUrls).toBe(0); await f.session.dispose(); expect(f.release).not.toHaveBeenCalled()
  })
  it('cancels A, prevents stale publication, retains target/source and completes B', async () => {
    const f = fixture(); await f.session.prepare(); f.options.hold = gate()
    const a = f.session.start(); await f.accepted.promise; await f.session.cancel(); await a
    expect(f.session.getSnapshot()).toMatchObject({ status: 'cancelled', target: 'webp', diagnostics: { conversionsCompleted: 0, cancellations: 1, activeDecoderWorkers: 0, activeEncoderWorkers: 0 } })
    expect(f.createUrl).not.toHaveBeenCalled(); f.options.hold = undefined; await f.session.start()
    expect(f.session.getSnapshot()).toMatchObject({ status: 'success', diagnostics: { conversionsStarted: 2, conversionsCompleted: 1 } }); await f.session.dispose()
  })
  it('closes an active conversion without publishing a stale result', async () => {
    const f = fixture(); await f.session.prepare(); f.options.hold = gate()
    const task = f.session.start(); await f.accepted.promise; await f.session.dispose(); await task
    expect(f.createUrl).not.toHaveBeenCalled(); expect(f.session.getSnapshot().diagnostics.activeEncoderWorkers).toBe(0)
    expect(f.release).not.toHaveBeenCalled()
  })
  it.each([
    { width: 2, height: 2, frameCount: 201, playCount: 0 },
    { width: 2049, height: 1, frameCount: 1, playCount: 0 },
    { width: 2048, height: 2049, frameCount: 1, playCount: 0 },
    { width: 2048, height: 2048, frameCount: 4, playCount: 0 },
  ])('rejects unsafe source metadata before encoding: %o', async meta => {
    const f = fixture(meta); await f.session.prepare(); await f.session.start()
    expect(f.session.getSnapshot()).toMatchObject({ status: 'error', error: 'RESOURCE_LIMIT', diagnostics: { conversionsStarted: 0, activeDecoderWorkers: 0, activeEncoderWorkers: 0 } }); await f.session.dispose()
  })
  it('classifies unreadable source as source failure, not target encode failure', async () => {
    const f = fixture(); f.detector.detect.mockRejectedValue(new MediaError('FILE_READ_FAILED'))
    await f.session.prepare(); expect(f.session.getSnapshot().error).toBe('SOURCE_DECODE_FAILED'); await f.session.dispose()
  })
  it('refuses unverified output and releases the job without creating a URL', async () => {
    const f = fixture(); f.inspect.mockRejectedValue(new ConversionError('SOURCE_DECODE_FAILED'))
    await f.session.prepare(); await f.session.start()
    expect(f.session.getSnapshot().error).toBe('TARGET_ENCODE_FAILED'); expect(f.createUrl).not.toHaveBeenCalled(); await f.session.dispose()
  })
  it('refuses output with changed dimensions, loop or timeline instead of labelling it successful', async () => {
    const f = fixture(); f.inspect.mockResolvedValue({ width: 3, height: 2, frameCount: 1, playCount: 2, durationMs: 54 })
    await f.session.prepare(); await f.session.start()
    expect(f.session.getSnapshot().error).toBe('TARGET_ENCODE_FAILED'); expect(f.createUrl).not.toHaveBeenCalled(); await f.session.dispose()
  })
})
