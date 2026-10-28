import { describe, expect, it } from 'vitest'
import { GifReader } from 'omggif'
import { GIFAnimationEncoder } from './gif-encoder'
import { convertAnimation, ConversionJob, type ConversionDependencies } from './convert'
import { validateCanonicalMetadata } from './model'
import type { AnimationFrameSource, CanonicalAnimationFrame, CanonicalAnimationMetadata, EncoderResult } from './model'
import type { VirtualFile } from '../input/virtual-file'

const metadata: CanonicalAnimationMetadata = { width: 2, height: 2, frameCount: 2, playCount: 2 }
const frame = (index: number, durationMs = 27): CanonicalAnimationFrame => ({ index, durationMs,
  rgba: new Uint8Array([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255]).buffer })
const file: VirtualFile = { name: 'test-only', source: 'file', size: 1, read: async () => new ArrayBuffer(1) }
const result = (): EncoderResult => ({ data: new ArrayBuffer(1), byteLength: 1, metrics: { encodeMs: 1, outputBytes: 1, outputCapacity: 1 } })
const gate = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
function fixture() {
  const log: string[] = [], buffers: ArrayBuffer[] = []
  let index = 0
  const source: AnimationFrameSource = { metadata, metrics: { decodeMs: 1, decoderHeapBytes: 0, decoderBackupBytes: 0 },
    next: async () => { log.push('next'); const value = frame(index++); buffers.push(value.rgba); return value },
    acknowledgeFrame: () => { log.push('ack') }, reset: async () => { index = 0 }, close: async () => { log.push('source-close') } }
  const dependencies: ConversionDependencies = { source: async () => source, encoder: () => ({
    capabilities: { deflate: true }, open: async () => { log.push('encoder-open') },
    addFrame: async value => { log.push('encode'); structuredClone(value.rgba, { transfer: [value.rgba] }) },
    finish: async () => result(), dispose: () => { log.push('encoder-dispose') },
  }) }
  return { dependencies, source, log, buffers }
}

describe('canonical conversion broker', () => {
  it('forwards the same buffer and requests no next frame until encoder acceptance', async () => {
    const f = fixture(), accepted = gate<void>(), observed = gate<void>()
    const base = f.dependencies.encoder()
    const dependencies = { ...f.dependencies, encoder: () => ({ ...base, addFrame: async (value: CanonicalAnimationFrame) => {
      expect(value.rgba).toBe(f.buffers.at(-1)); structuredClone(value.rgba, { transfer: [value.rgba] })
      observed.resolve(); await accepted.promise
    } }) }
    const pending = convertAnimation(file, 'gif', 'apng', {}, dependencies)
    await observed.promise
    expect(f.log.filter(x => x === 'next')).toHaveLength(1)
    expect(f.log).not.toContain('ack')
    accepted.resolve()
    const value = await pending
    expect(value).toMatchObject({ peakRgbaFrames: 1, peakFrameBytes: 16, transferredFrames: 2 })
    expect(f.buffers.every(b => b.byteLength === 0)).toBe(true)
    expect(f.log.slice(-2)).toEqual(['encoder-dispose', 'source-close'])
  })
  it('rejects a transport that copied rather than transferred the canonical frame', async () => {
    const f = fixture(), encoder = f.dependencies.encoder()
    await expect(convertAnimation(file, 'gif', 'apng', {}, { ...f.dependencies,
      encoder: () => ({ ...encoder, addFrame: async () => {} }) })).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    expect(f.log.filter(x => x === 'next')).toHaveLength(1)
    expect(f.log).toContain('source-close')
  })
  it('cancels and joins cleanup before any further source pull', async () => {
    const f = fixture(), controller = new AbortController()
    await expect(convertAnimation(file, 'gif', 'apng', { signal: controller.signal,
      onProgress: progress => { if (progress.phase === 'encoding') controller.abort() } }, f.dependencies)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(f.log.filter(x => x === 'next')).toHaveLength(1)
    expect(f.log).toContain('encoder-dispose'); expect(f.log).toContain('source-close')
  })
  it('normalizes a source error and keeps the next independent job usable', async () => {
    const f = fixture()
    await expect(convertAnimation(file, 'gif', 'webp', {}, { ...f.dependencies,
      source: async () => { throw Error('private detail') } })).rejects.toMatchObject({ code: 'SOURCE_DECODE_FAILED', message: 'SOURCE_DECODE_FAILED' })
    await expect(convertAnimation(file, 'gif', 'webp', {}, f.dependencies)).resolves.toMatchObject({ transferredFrames: 2 })
  })
  it('prevents a late canceled A from succeeding over B', async () => {
    const f = fixture(), opening = gate<AnimationFrameSource>()
    const aFile = { ...file, size: 2 }
    const job = new ConversionJob({ ...f.dependencies, source: input => input === aFile ? opening.promise : Promise.resolve(f.source) })
    const a = job.run(aFile, 'gif', 'apng').catch(error => error)
    const b = await job.run(file, 'gif', 'webp')
    opening.resolve(f.source)
    expect(await a).toMatchObject({ code: 'CANCELLED' }); expect(b.transferredFrames).toBe(2)
  })
  it('guards experimental workload and metadata before accepting dangerous input', () => {
    expect(() => validateCanonicalMetadata({ ...metadata, width: 2048, height: 2048, frameCount: 4 })).toThrow('RESOURCE_LIMIT')
    expect(() => validateCanonicalMetadata({ ...metadata, frameCount: 201 })).toThrow('RESOURCE_LIMIT')
    expect(() => validateCanonicalMetadata({ ...metadata, playCount: -1 })).toThrow('RESOURCE_LIMIT')
  })
})

describe('existing gifenc canonical target', () => {
  it.each([0,1,2,3])('normalizes total plays %i and independent frame delays', async playCount => {
    const encoder = await GIFAnimationEncoder.create({ ...metadata, playCount })
    await encoder.addFrame(frame(0, 27)); await encoder.addFrame(frame(1, 250))
    const output = await encoder.finish(), reader = new GifReader(new Uint8Array(output.data, 0, output.byteLength))
    expect(reader.numFrames()).toBe(2)
    expect([reader.frameInfo(0).delay,reader.frameInfo(1).delay]).toEqual([3,25])
    expect(reader.loopCount()).toBe(playCount === 1 ? null : playCount === 0 ? 0 : playCount - 1)
    expect(output.metrics.outputBytes).toBe(output.byteLength)
  })
})
