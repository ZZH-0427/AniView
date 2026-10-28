import { crc32 } from './crc32'
import { GrowingByteWriter } from './byte-writer'
import { CONVERSION_LIMITS, ConversionError, validateCanonicalFrame, validateCanonicalMetadata } from './model'
import type { AnimationEncoder, CanonicalAnimationFrame, CanonicalAnimationMetadata, EncoderMetrics, EncoderResult } from './model'

function gcd(a: number, b: number): number { while (b) { const next = a % b; a = b; b = next } return a }

/** PNG delay is a bounded seconds fraction; integer milliseconds usually stay exact. */
export function apngDelay(durationMs: number): readonly [number, number] {
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 655350) throw new ConversionError('RESOURCE_LIMIT')
  if (durationMs === 0) return [0, 1]
  if (Number.isSafeInteger(durationMs)) {
    const factor = gcd(durationMs, 1000)
    if (durationMs / factor <= 65535) return [durationMs / factor, 1000 / factor]
  }
  const seconds = durationMs / 1000
  const maxDenominator = Math.min(65535, Math.floor((65535 + 0.5) / seconds))
  let numerator = 0, denominator = 1, error = seconds
  for (let candidate = 1; candidate <= maxDenominator; candidate++) {
    const rounded = Math.round(seconds * candidate)
    if (rounded > 65535) continue
    const difference = Math.abs(rounded / candidate - seconds)
    if (difference < error) { numerator = rounded; denominator = candidate; error = difference }
    if (error === 0) break
  }
  const factor = gcd(numerator, denominator)
  return [numerator / factor, denominator / factor]
}

/** Worker-side PNG3 APNG writer. No input rectangle, blend or disposal state escapes here. */
export class APNGAnimationEncoder implements AnimationEncoder {
  private writer: GrowingByteWriter | undefined
  private firstStream: CompressionStream | undefined
  private activeReader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined
  private activeWriter: WritableStreamDefaultWriter<BufferSource> | undefined
  private index = 0
  private sequence = 0
  private busy = false
  private closed = false
  private encodeMs = 0
  private outputBytes = 0
  private outputCapacity = 0
  private peakCompressedChunkBytes = 0
  private peakScanlineBytes = 0
  private lastFrameCompressedBytes = 0
  private peakCompressedFrameBytes = 0

  private constructor(private readonly metadata: CanonicalAnimationMetadata, stream: CompressionStream) {
    this.firstStream = stream
    this.writer = new GrowingByteWriter(CONVERSION_LIMITS.maxOutputBytes)
    this.writer.append(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10))
    const header = new Uint8Array(13), view = new DataView(header.buffer)
    view.setUint32(0, metadata.width); view.setUint32(4, metadata.height)
    header[8] = 8; header[9] = 6 // RGBA8, zlib, filter methods 0, no interlacing.
    this.chunk('IHDR', header)
    const animation = new Uint8Array(8), animationView = new DataView(animation.buffer)
    animationView.setUint32(0, metadata.frameCount); animationView.setUint32(4, metadata.playCount)
    this.chunk('acTL', animation)
  }

  static async create(metadata: CanonicalAnimationMetadata): Promise<APNGAnimationEncoder> {
    validateCanonicalMetadata(metadata)
    let stream: CompressionStream
    try {
      if (typeof CompressionStream !== 'function') throw new Error('CompressionStream unavailable')
      stream = new CompressionStream('deflate')
    } catch (cause) { throw new ConversionError('TARGET_ENCODER_UNSUPPORTED', { cause }) }
    return new APNGAnimationEncoder(metadata, stream)
  }

  get metrics(): EncoderMetrics {
    return { encodeMs: this.encodeMs, outputBytes: this.writer?.byteLength ?? this.outputBytes,
      outputCapacity: this.writer?.capacity ?? this.outputCapacity,
      peakCompressedChunkBytes: this.peakCompressedChunkBytes, peakScanlineBytes: this.peakScanlineBytes,
      lastFrameCompressedBytes: this.lastFrameCompressedBytes, peakCompressedFrameBytes: this.peakCompressedFrameBytes }
  }

  private assertActive() { if (this.closed || !this.writer) throw new ConversionError('TARGET_ENCODE_FAILED') }
  private chunk(type: string, data: Uint8Array, sequence?: number) {
    const writer = this.writer
    if (!writer) throw new ConversionError('TARGET_ENCODE_FAILED')
    const length = data.byteLength + (sequence === undefined ? 0 : 4)
    writer.ensure(length + 12)
    writer.uint32(length)
    const crcStart = writer.byteLength
    for (let i = 0; i < 4; i++) writer.uint8(type.charCodeAt(i))
    if (sequence !== undefined) writer.uint32(sequence)
    writer.append(data)
    writer.uint32(crc32(writer.view(), crcStart, writer.byteLength))
  }

  async addFrame(frame: CanonicalAnimationFrame): Promise<void> {
    this.assertActive()
    if (this.busy || this.index >= this.metadata.frameCount) throw new ConversionError('TARGET_ENCODE_FAILED')
    validateCanonicalFrame(frame, this.metadata, this.index)
    this.busy = true
    const start = performance.now()
    let writer: WritableStreamDefaultWriter<BufferSource> | undefined
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined
    try {
      const control = new Uint8Array(26), view = new DataView(control.buffer)
      const [numerator, denominator] = apngDelay(frame.durationMs)
      view.setUint32(0, this.sequence++); view.setUint32(4, this.metadata.width); view.setUint32(8, this.metadata.height)
      view.setUint16(20, numerator); view.setUint16(22, denominator)
      // Full-canvas SOURCE replaces every pixel; NONE requires no saved previous frame.
      this.chunk('fcTL', control)
      const stream = this.firstStream ?? new CompressionStream('deflate')
      this.firstStream = undefined
      writer = stream.writable.getWriter(); reader = stream.readable.getReader()
      this.activeReader = reader; this.activeWriter = writer
      const rowBytes = this.metadata.width * 4
      const filter = new Uint8Array(1)
      this.peakScanlineBytes = Math.max(this.peakScanlineBytes, filter.byteLength)
      const rgba = new Uint8Array(frame.rgba)
      let compressedBytes = 0
      const input = async () => {
        for (let row = 0; row < this.metadata.height; row++) {
          if (this.closed) throw new ConversionError('CANCELLED')
          // CompressionStream may retain a chunk after write() resolves. Never mutate
          // an already-written row: use stable views of the current owned RGBA instead.
          // Deflate input chunk boundaries need not coincide with PNG scanline boundaries.
          await writer!.write(filter)
          await writer!.write(rgba.subarray(row * rowBytes, (row + 1) * rowBytes))
        }
        await writer!.close()
      }
      const output = async () => {
        for (;;) {
          const { value, done } = await reader!.read()
          if (done) break
          if (this.closed) throw new ConversionError('CANCELLED')
          this.peakCompressedChunkBytes = Math.max(this.peakCompressedChunkBytes, value.byteLength)
          compressedBytes += value.byteLength
          if (this.index === 0) this.chunk('IDAT', value)
          else this.chunk('fdAT', value, this.sequence++)
        }
      }
      // Concurrent drain is essential: awaiting all writes first can deadlock on backpressure.
      await Promise.all([input(), output()])
      this.lastFrameCompressedBytes = compressedBytes
      this.peakCompressedFrameBytes = Math.max(this.peakCompressedFrameBytes, compressedBytes)
      this.index++
    } catch (cause) {
      const cancelled = this.closed
      this.closed = true
      await Promise.allSettled([writer?.abort(cause), reader?.cancel(cause)])
      this.writer?.dispose(); this.writer = undefined
      if (cancelled) throw new ConversionError('CANCELLED', { cause })
      throw cause instanceof ConversionError ? cause : new ConversionError('TARGET_ENCODE_FAILED', { cause })
    } finally {
      this.encodeMs += performance.now() - start
      writer?.releaseLock(); reader?.releaseLock()
      this.activeWriter = undefined; this.activeReader = undefined; this.busy = false
    }
  }

  async finish(): Promise<EncoderResult> {
    this.assertActive()
    if (this.busy || this.index !== this.metadata.frameCount) throw new ConversionError('TARGET_ENCODE_FAILED')
    this.chunk('IEND', new Uint8Array(0))
    this.outputBytes = this.writer!.byteLength; this.outputCapacity = this.writer!.capacity
    const result = this.writer!.take()
    this.writer = undefined; this.closed = true
    return { ...result, metrics: this.metrics }
  }

  dispose() {
    this.closed = true
    void this.activeWriter?.abort().catch(() => {})
    void this.activeReader?.cancel().catch(() => {})
    if (this.firstStream) {
      void this.firstStream.readable.cancel().catch(() => {})
      void this.firstStream.writable.abort().catch(() => {})
      this.firstStream = undefined
    }
    this.writer?.dispose(); this.writer = undefined
  }
}
