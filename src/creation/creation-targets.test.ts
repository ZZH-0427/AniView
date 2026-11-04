import { describe, expect, it, vi } from 'vitest'
import { CreationSession } from './creation-session'
import { creationOutput } from './creation.test-support'
import { ConversionError } from '../conversion/model'
import type { ConversionFormat } from '../conversion/model'
import type { VirtualFile } from '../input/virtual-file'
import type { StaticAnimationOptions } from './static-animation-encoder'
import type { inspectCreationOutput } from './output-validation'

const files: VirtualFile[] = [0, 1].map(i => ({ name: `${i}.png`, source: 'file', size: 8, read: vi.fn(async () => new ArrayBuffer(8)) }))
function setup() {
  let options: StaticAnimationOptions
  const encode = vi.fn(async (_files: readonly VirtualFile[], value: StaticAnimationOptions) => { options = value; return creationOutput() })
  const inspect = vi.fn<typeof inspectCreationOutput>(async () => ({ width: 2, height: 1, frameCount: 2, playCount: options.playCount, durationMs: options.durationMs * 2 }))
  const createUrl = vi.fn(() => 'blob:' + createUrl.mock.calls.length), revokeUrl = vi.fn()
  const session = new CreationSession({ encoder: { encode, cancel: async () => {} }, detector: { detect: async () => ({ kind: 'png', animated: false }) }, inspect, createUrl, revokeUrl })
  return { session, encode, inspect, createUrl, revokeUrl }
}
describe('target-aware creation result and validation lifecycle', () => {
  it.each(['gif', 'webp', 'apng'] as const)('validates %s before URL allocation, with independent metadata and target identity', async target => {
    const { session, encode, inspect, createUrl } = setup(); await session.add(files)
    session.updateSettings({ target, loopForever: false, playCount: 3, frameDurationMs: 20 })
    inspect.mockImplementation(async () => { expect(session.getSnapshot().status).toBe('verifying'); expect(createUrl).not.toHaveBeenCalled(); return { width: 2, height: 1, frameCount: 2, playCount: 3, durationMs: 40 } })
    await session.generate(); const result = session.getSnapshot().result!
    const extension = target === 'apng' ? 'png' : target, mime = `image/${extension}`
    expect(encode.mock.calls[0]![1]).toEqual({ target, durationMs: 20, playCount: 3 })
    expect(inspect).toHaveBeenCalledOnce(); expect(result).toMatchObject({ format: target, extension, mime, inputFrameCount: 2, metadata: { playCount: 3, durationMs: 40 } })
    expect(result.blob.type).toBe(mime); expect(result.filename).toMatch(new RegExp(`\\.${extension}$`))
    expect(session.nextDownloadName()).not.toBe(session.nextDownloadName()); await session.dispose()
  })
  it('switches idle targets without reading/mutating sources, settings or the previous result identity', async () => {
    const { session, encode, revokeUrl } = setup(); await session.add(files); await session.generate()
    const previous = session.getSnapshot(), result = previous.result!
    session.updateSettings({ target: 'apng' })
    expect(session.getSnapshot().sources).toBe(previous.sources); expect(session.getSnapshot().result).toBe(result)
    expect(session.getSnapshot().settings).toMatchObject({ frameDurationMs: 500, loopForever: true, playCount: 1, target: 'apng' })
    expect(result.metadata.playCount).toBe(0); expect(result.settings.playCount).toBe(1)
    expect(session.nextDownloadName()).toMatch(/\.gif$/); expect(revokeUrl).not.toHaveBeenCalled(); expect(files[0]!.read).not.toHaveBeenCalled()
    encode.mockRejectedValueOnce(new ConversionError('TARGET_ENCODER_UNSUPPORTED')); await session.generate()
    expect(session.getSnapshot().status).toBe('error'); expect(session.getSnapshot().result).toBe(result); expect(session.nextDownloadName()).toMatch(/\.gif$/)
    await session.generate(); expect(session.getSnapshot().result!.extension).toBe('png'); expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(result.url); await session.dispose()
  })
  it('accepts fewer physical WebP frames while preserving the total timeline and total plays', async () => {
    const { session, inspect } = setup(); await session.add(files); session.updateSettings({ target: 'webp' })
    inspect.mockResolvedValue({ width: 2, height: 1, frameCount: 1, playCount: 0, durationMs: 1000 }); await session.generate()
    expect(session.getSnapshot().result).toMatchObject({ inputFrameCount: 2, metadata: { frameCount: 1, durationMs: 1000 } }); await session.dispose()
  })
  it.each([
    { width: 9 }, { height: 9 }, { frameCount: 1 }, { frameCount: 3 }, { playCount: 2 }, { durationMs: 9990 }, { durationMs: NaN },
  ])('rejects unverified/mismatched output %j and never creates a URL', async changed => {
    const { session, inspect, createUrl } = setup(); await session.add(files)
    inspect.mockResolvedValue({ width: 2, height: 1, frameCount: 2, playCount: 0, durationMs: 1000, ...changed })
    await session.generate(); expect(session.getSnapshot().status).toBe('error'); expect(session.getSnapshot().result).toBeUndefined(); expect(createUrl).not.toHaveBeenCalled(); await session.dispose()
  })
  it('cancels during output inspection, keeps A and ignores late inspection completion before rerunning B', async () => {
    const { session, inspect, createUrl } = setup(); await session.add(files); await session.generate(); const previous = session.getSnapshot().result
    let late!: (value: { width: number; height: number; frameCount: number; playCount: number; durationMs: number }) => void
    inspect.mockImplementationOnce((_blob, _target, signal) => new Promise((resolve, reject) => {
      late = resolve; signal.addEventListener('abort', () => reject(new ConversionError('CANCELLED')), { once: true })
    }))
    const running = session.generate(); await vi.waitFor(() => expect(session.getSnapshot().status).toBe('verifying'))
    session.updateSettings({ target: 'webp' }); expect(session.getSnapshot().settings.target).toBe('gif')
    await session.cancel(); await running; late({ width: 2, height: 1, frameCount: 2, playCount: 0, durationMs: 1000 })
    expect(session.getSnapshot().status).toBe('cancelled'); expect(session.getSnapshot().result).toBe(previous); expect(createUrl).toHaveBeenCalledTimes(1)
    session.updateSettings({ target: 'apng' }); await session.generate(); expect(session.getSnapshot().result!.format).toBe('apng'); await session.dispose()
  })
  it('closes during inspection and joins cancellation without publishing a result URL', async () => {
    const { session, inspect, createUrl } = setup(); await session.add(files)
    inspect.mockImplementationOnce((_blob, _format, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new ConversionError('CANCELLED')), { once: true })))
    const running = session.generate(); await vi.waitFor(() => expect(session.getSnapshot().status).toBe('verifying')); await session.dispose(); await running
    expect(createUrl).not.toHaveBeenCalled(); expect(session.getSnapshot().diagnostics).toMatchObject({ activeObjectUrls: 0, activeValidationDecoderWorkers: 0, activeInspectionWorkers: 0 })
  })
  it.each(['gif', 'webp', 'apng'] as ConversionFormat[])('keeps strict global settings for %s', target => {
    const { session } = setup(); session.updateSettings({ target, frameDurationMs: 27 }); expect(session.getSnapshot().settings.frameDurationMs).toBe(30)
    session.updateSettings({ frameDurationMs: 19 }); expect(session.getSnapshot().settings.frameDurationMs).toBe(30)
  })
})
