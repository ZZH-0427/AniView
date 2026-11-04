import { BinaryFormatDetector } from '../formats/binary-detector'
import { inspectStaticDimensions, type StaticImageFormat } from '../formats/static/static-dimensions'
import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'
import { assertMediaDimensions, assertMediaEncodedSize } from '../media/resource-policy'
import { assertCanvasLimits, resolveEncodeLimits } from './gif/gif-validation'
import { EncodeError, type EncodeLimits } from './gif/model'

export interface StaticPreparationMetrics {
  readonly decodeMs: number; readonly sourceReadMs: number; readonly identifyMs: number
  readonly composeMs: number; readonly checkpointMs: number; readonly checkpointCount: number
  readonly peakBitmaps: number; readonly peakRgbaFrames: number; readonly peakFrameBytes: number
  readonly sourceBytes: number; readonly width: number; readonly height: number; readonly frameCount: number
}
export interface StaticOwnership {
  readonly activeBitmaps: number; readonly activeCanvases: number; readonly activeImageData: number
  readonly ownedRgba: number; readonly awaitingAck: number; readonly cleanupErrors: number
}
export const emptyStaticOwnership = (): StaticOwnership => ({ activeBitmaps: 0, activeCanvases: 0,
  activeImageData: 0, ownedRgba: 0, awaitingAck: 0, cleanupErrors: 0 })
export interface StaticPreparationHooks {
  checkpoint(): Promise<void>
  scanned(completed: number, total: number): void
}
export function staticSourceError(cause: unknown): EncodeError {
  if (cause instanceof EncodeError) return cause
  if (cause instanceof RangeError || (cause instanceof MediaError && ['RESOURCE_LIMIT_EXCEEDED', 'OUT_OF_MEMORY'].includes(cause.code))) return new EncodeError('RESOURCE_LIMIT', { cause })
  if (cause instanceof MediaError && cause.code === 'CORRUPTED_FILE') return new EncodeError('CORRUPT_SOURCE', { cause })
  return new EncodeError('DECODE_FAILED', { cause })
}

/** Worker-only native preparation shared by the historical GIF path and canonical source.
 * Encoders, palettes and decoded-frame caches do not belong to this boundary. */
export class StaticFramePreparer {
  private readonly dimensions: { width: number; height: number }[] = []
  private canvas: OffscreenCanvas | undefined
  private index = 0
  private closed = false
  private ownership = emptyStaticOwnership()
  private statistics: StaticPreparationMetrics
  private constructor(private readonly count: number, private readonly read: (index: number) => Promise<ArrayBuffer>,
    private readonly hooks: StaticPreparationHooks, private readonly limits: EncodeLimits) {
    this.statistics = { decodeMs: 0, sourceReadMs: 0, identifyMs: 0, composeMs: 0, checkpointMs: 0,
      checkpointCount: 0, peakBitmaps: 0, peakRgbaFrames: 0, peakFrameBytes: 0,
      sourceBytes: 0, width: 0, height: 0, frameCount: count }
  }
  get metrics() { return this.statistics }
  get resources() { return this.ownership }
  private metric(patch: Partial<StaticPreparationMetrics>) { this.statistics = { ...this.statistics, ...patch } }
  private owned(patch: Partial<StaticOwnership>) { this.ownership = { ...this.ownership, ...patch } }
  private async checkpoint() {
    if (this.closed) throw new EncodeError('CANCELLED')
    const start = performance.now()
    try { await this.hooks.checkpoint(); if (this.closed) throw new EncodeError('CANCELLED') }
    finally { this.metric({ checkpointMs: this.statistics.checkpointMs + performance.now() - start,
      checkpointCount: this.statistics.checkpointCount + 1 }) }
  }
  static async open(count: number, read: (index: number) => Promise<ArrayBuffer>, hooks: StaticPreparationHooks, rawLimits: EncodeLimits) {
    const limits = resolveEncodeLimits(rawLimits)
    if (!Number.isSafeInteger(count) || count < limits.minFrames || count > limits.maxFrames) throw new EncodeError('RESOURCE_LIMIT', {
      detail: { kind: 'source-count', actual: count, limit: count < limits.minFrames ? limits.minFrames : limits.maxFrames } })
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new EncodeError('WORKER_FAILED')
    const core = new StaticFramePreparer(count, read, hooks, limits)
    try {
      hooks.scanned(0, count)
      for (let i = 0; i < count; i++) {
        await core.checkpoint()
        const { bitmap, byteLength } = await core.openBitmap(i)
        try {
          core.dimensions.push({ width: bitmap.width, height: bitmap.height })
          core.metric({ sourceBytes: core.statistics.sourceBytes + byteLength })
          if (core.statistics.sourceBytes > limits.maxSourceBytes) throw new EncodeError('RESOURCE_LIMIT', {
            detail: { kind: 'source-bytes', actual: core.statistics.sourceBytes, limit: limits.maxSourceBytes } })
        } finally { core.closeBitmap(bitmap) }
        hooks.scanned(i + 1, count)
      }
      const width = Math.max(...core.dimensions.map(d => d.width)), height = Math.max(...core.dimensions.map(d => d.height))
      assertCanvasLimits(width, height, count, limits); assertMediaDimensions(width, height)
      core.metric({ width, height, peakFrameBytes: width * height * 4 })
      core.canvas = new OffscreenCanvas(width, height); core.owned({ activeCanvases: 1 })
      return core
    } catch (cause) { core.close(); throw staticSourceError(cause) }
  }
  private async identify(data: ArrayBuffer): Promise<StaticImageFormat> {
    assertMediaEncodedSize(data.byteLength)
    const file: VirtualFile = { name: '', size: data.byteLength, source: 'file', read: async (a = 0, b = data.byteLength) => data.slice(a, b) }
    const format = await new BinaryFormatDetector().detect(file)
    if ('animated' in format && format.animated) throw new EncodeError('ANIMATED_INPUT')
    if (format.kind !== 'jpeg' && format.kind !== 'png' && format.kind !== 'webp') throw new EncodeError('UNSUPPORTED_INPUT')
    inspectStaticDimensions(data, format.kind, (width, height) => {
      assertCanvasLimits(width, height, this.count, this.limits); assertMediaDimensions(width, height)
    })
    return format.kind
  }
  private async openBitmap(index: number) {
    let data: ArrayBuffer
    let start = performance.now()
    try { data = await this.read(index) }
    catch (cause) { throw cause instanceof EncodeError ? cause : new EncodeError('FILE_READ_FAILED', { cause }) }
    finally { this.metric({ sourceReadMs: this.statistics.sourceReadMs + performance.now() - start }) }
    await this.checkpoint()
    start = performance.now()
    const format = await this.identify(data)
    this.metric({ identifyMs: this.statistics.identifyMs + performance.now() - start })
    await this.checkpoint()
    let bitmap: ImageBitmap | undefined
    try {
      start = performance.now()
      bitmap = await createImageBitmap(new Blob([data], { type: { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[format] }), { imageOrientation: 'from-image' })
      this.metric({ decodeMs: this.statistics.decodeMs + performance.now() - start, peakBitmaps: Math.max(this.statistics.peakBitmaps, 1) })
      this.owned({ activeBitmaps: 1 })
      await this.checkpoint(); assertMediaDimensions(bitmap.width, bitmap.height)
      return { bitmap, byteLength: data.byteLength }
    } catch (cause) {
      if (bitmap) this.closeBitmap(bitmap)
      if (!bitmap && cause instanceof DOMException && cause.name === 'InvalidStateError') throw new EncodeError('CORRUPT_SOURCE', { cause })
      throw staticSourceError(cause)
    }
  }
  private closeBitmap(bitmap: ImageBitmap) { try { bitmap.close() } finally { this.owned({ activeBitmaps: 0 }) } }
  async next(): Promise<ArrayBuffer | null> {
    if (this.closed || this.ownership.ownedRgba) throw new EncodeError('WORKER_FAILED')
    if (this.index === this.count) return null
    try {
      await this.checkpoint()
      const { bitmap } = await this.openBitmap(this.index), { width, height } = this.statistics
      const start = performance.now()
      const context = this.canvas!.getContext('2d', { willReadFrequently: true })
      try {
        if (!context) throw new EncodeError('WORKER_FAILED')
        const expected = this.dimensions[this.index]!
        if (bitmap.width !== expected.width || bitmap.height !== expected.height) throw new EncodeError('DECODE_FAILED')
        context.clearRect(0, 0, width, height)
        context.drawImage(bitmap, Math.floor((width - bitmap.width) / 2), Math.floor((height - bitmap.height) / 2))
      } finally { this.closeBitmap(bitmap) }
      this.metric({ composeMs: this.statistics.composeMs + performance.now() - start })
      await this.checkpoint()
      const readback = performance.now()
      this.owned({ activeImageData: 1 })
      try {
        const rgba = context.getImageData(0, 0, width, height).data.buffer
        this.metric({ composeMs: this.statistics.composeMs + performance.now() - readback, peakRgbaFrames: 1 })
        this.owned({ ownedRgba: 1 }); this.index++
        return rgba
      } finally { this.owned({ activeImageData: 0 }) }
    } catch (cause) { throw staticSourceError(cause) }
  }
  releaseFrame() { this.owned({ ownedRgba: 0 }) }
  reset() { if (this.closed || this.ownership.ownedRgba) throw new EncodeError('WORKER_FAILED'); this.index = 0 }
  close() {
    this.closed = true
    if (this.canvas) { this.canvas.width = 1; this.canvas.height = 1; this.canvas = undefined }
    this.owned({ activeCanvases: 0, activeImageData: 0, ownedRgba: 0 })
  }
}
