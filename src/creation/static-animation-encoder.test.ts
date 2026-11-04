import { describe, expect, it, vi } from 'vitest'
import { StaticAnimationEncoder } from './static-animation-encoder'
import type { StaticPreparationSource } from './static-animation-encoder'
import type { StaticSourceConfiguration } from './static-frame-source'
import type { ConversionFormat, CanonicalAnimationFrame, EncoderResult } from '../conversion/model'
import { ConversionError } from '../conversion/model'
import type { EncoderTransport } from '../conversion/convert'
import type { VirtualFile } from '../input/virtual-file'
import { preparationMetrics } from './creation.test-support'

const files: VirtualFile[] = [0, 1].map(i => ({ name: `${i}.png`, source: 'file', size: 8, read: async () => new ArrayBuffer(8) }))
class Source implements StaticPreparationSource {
  metadata = { width: 2, height: 1, frameCount: 2, playCount: 0 }
  metrics = { decodeMs: 1, decoderHeapBytes: 0, decoderBackupBytes: 0 }
  preparationMetrics = preparationMetrics()
  softClosed = false
  held: ArrayBuffer | undefined
  index = 0
  buffers: ArrayBuffer[] = []
  next = vi.fn(async (): Promise<CanonicalAnimationFrame | null> => {
    if (this.held) throw Error('unacknowledged')
    if (this.index === 2) return null
    const rgba = new Uint8Array([20, 40, 60, 128, 90, 100, 110, 255]).buffer
    this.buffers.push(rgba); this.held = rgba
    return { rgba, index: this.index++, durationMs: 500 }
  })
  acknowledgeFrame = vi.fn(() => { if (!this.held || this.held.byteLength !== 0) throw Error('not transferred'); this.held = undefined })
  reset = vi.fn(async () => { this.index = 0 })
  close = vi.fn(async () => { this.held = undefined; this.softClosed = true })
}
class Encoder implements EncoderTransport {
  capabilities = { deflate: true }
  open = vi.fn(async () => {})
  received: number[][] = []
  addFrame = vi.fn(async (frame: CanonicalAnimationFrame) => {
    const rgba = structuredClone(frame.rgba, { transfer: [frame.rgba] }); this.received.push([...new Uint8Array(rgba)])
  })
  finish = vi.fn(async (): Promise<EncoderResult> => ({ data: new ArrayBuffer(10), byteLength: 8, metrics: { encodeMs: 1, outputBytes: 8, outputCapacity: 10 } }))
  dispose = vi.fn()
}
function setup() {
  const source = new Source(), encoder = new Encoder(), opening = vi.fn(async (_files: readonly VirtualFile[], config: StaticSourceConfiguration) => {
    source.metadata.playCount = config.playCount
    return source
  })
  const broker = new StaticAnimationEncoder({ source: opening, encoder: () => encoder })
  return { source, encoder, broker, opening }
}
describe('static sequence to existing target transport', () => {
  it.each(['gif', 'webp', 'apng'] as const)('dispatches %s directly with original full-color/semi-alpha RGBA', async target => {
    const { source, encoder, broker } = setup()
    const progress: { phase: string; completedFrames: number; totalFrames: number }[] = []
    const result = await broker.encode(files, { target, durationMs: 500, playCount: 3 }, { onProgress: value => progress.push(value) })
    expect(encoder.open).toHaveBeenCalledWith(target, { width: 2, height: 1, frameCount: 2, playCount: 3 })
    expect(encoder.received).toEqual(Array.from({ length: 2 }, () => [20, 40, 60, 128, 90, 100, 110, 255]))
    expect(source.acknowledgeFrame).toHaveBeenCalledTimes(2); expect(source.buffers.every(b => b.byteLength === 0)).toBe(true)
    expect(result).toMatchObject({ peakRgbaFrames: 1, transferredFrames: 2, byteLength: 8 })
    expect(source.close).toHaveBeenCalled(); expect(encoder.dispose).toHaveBeenCalled()
    expect(progress).toEqual([
      { phase: 'encoding', completedFrames: 0, totalFrames: 2 },
      { phase: 'encoding', completedFrames: 1, totalFrames: 2 },
      { phase: 'encoding', completedFrames: 2, totalFrames: 2 },
      { phase: 'finalizing', completedFrames: 2, totalFrames: 2 },
    ])
  })
  it('does not pull the next source before actual target acceptance', async () => {
    const { source, encoder, broker } = setup(); let accept!: () => void
    encoder.addFrame.mockImplementationOnce(frame => { structuredClone(frame.rgba, { transfer: [frame.rgba] }); return new Promise(resolve => { accept = resolve }) })
    const work = broker.encode(files, { target: 'apng', durationMs: 500, playCount: 0 })
    await vi.waitFor(() => expect(encoder.addFrame).toHaveBeenCalledOnce())
    expect(source.next).toHaveBeenCalledOnce(); expect(source.acknowledgeFrame).not.toHaveBeenCalled()
    accept(); await work; expect(source.next).toHaveBeenCalledTimes(2)
  })
  it('rejects a copying encoder instead of acknowledging borrowed pixels', async () => {
    const { source, encoder, broker } = setup(); encoder.addFrame.mockImplementation(async () => {})
    await expect(broker.encode(files, { target: 'webp', durationMs: 500, playCount: 0 })).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    expect(source.next).toHaveBeenCalledOnce(); expect(source.acknowledgeFrame).not.toHaveBeenCalled(); expect(source.close).toHaveBeenCalled()
  })
  it.each(['gif', 'webp', 'apng'] as const)('cancels %s encoding, joins cleanup and reruns', async target => {
    const { encoder, broker, source } = setup(); let stop!: (cause: Error) => void
    encoder.addFrame.mockImplementationOnce(() => new Promise((_resolve, reject) => { stop = reject }))
    encoder.dispose.mockImplementation(() => { stop?.(new ConversionError('CANCELLED')) })
    const work = broker.encode(files, { target, durationMs: 500, playCount: 0 }), rejected = expect(work).rejects.toMatchObject({ code: 'CANCELLED' })
    await vi.waitFor(() => expect(encoder.addFrame).toHaveBeenCalledOnce()); await broker.cancel(); await rejected
    expect(source.close).toHaveBeenCalled()
    source.index = 0; source.held = undefined
    await expect(broker.encode(files, { target, durationMs: 500, playCount: 0 })).resolves.toMatchObject({ transferredFrames: 2 })
  })
  it.each(['TARGET_ENCODER_UNSUPPORTED', 'TARGET_ENCODE_FAILED', 'WORKER_FAILED'] as const)('retains typed %s and cleans source', async code => {
    const { source, encoder, broker } = setup(); encoder.open.mockRejectedValue(new ConversionError(code))
    await expect(broker.encode(files, { target: 'apng', durationMs: 500, playCount: 0 })).rejects.toMatchObject({ code })
    expect(source.next).not.toHaveBeenCalled(); expect(source.close).toHaveBeenCalled()
  })
  it.each([0, 64 * 1024 * 1024 + 1])('rejects invalid final output length %i including post-finalize growth', async byteLength => {
    const { encoder, broker } = setup(); encoder.finish.mockResolvedValue({ data: new ArrayBuffer(10), byteLength, metrics: { encodeMs: 1, outputBytes: byteLength, outputCapacity: 10 } })
    await expect(broker.encode(files, { target: 'gif', durationMs: 500, playCount: 0 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })
  it('applies 16MiB/count limits before opening any source or encoder for every target', async () => {
    for (const target of ['gif', 'webp', 'apng'] as ConversionFormat[]) {
      const { broker, opening, encoder } = setup()
      await expect(broker.encode([{ ...files[0]!, size: 16 * 1024 * 1024 }, files[1]!], { target, durationMs: 500, playCount: 0 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
      expect(opening).not.toHaveBeenCalled(); expect(encoder.open).not.toHaveBeenCalled()
    }
  })
})
