import { BinaryFormatDetector } from '../../formats/binary-detector'
import { inspectStaticDimensions, type StaticImageFormat } from '../../formats/static/static-dimensions'
import type { VirtualFile } from '../../input/virtual-file'
import { MediaError } from '../../media/errors'
import { assertMediaDimensions, assertMediaEncodedSize } from '../../media/resource-policy'
import { GifencWriter, quantizeGifFrame } from './gifenc-adapter'
import { EncodeError, resolveEncodeOptions, type EncodeOptions, type EncodeProgress, type EncodedGif } from './model'

interface EncodingHooks {
  progress(progress: EncodeProgress): void
  /** Must yield a macrotask so Worker messages can update the cancellation flag. */
  checkpoint(): Promise<void>
}
interface SourceDimensions { readonly width: number; readonly height: number }
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
const MAX_FRAME_PIXEL_WORK = 1024 * 1024 * 1024 / 4

function decodeError(cause: unknown): EncodeError {
  if (cause instanceof EncodeError) return cause
  if (cause instanceof RangeError) return new EncodeError('RESOURCE_LIMIT', { cause })
  if (cause instanceof MediaError && ['RESOURCE_LIMIT_EXCEEDED', 'OUT_OF_MEMORY'].includes(cause.code)) return new EncodeError('RESOURCE_LIMIT', { cause })
  return new EncodeError('DECODE_FAILED', { cause })
}

async function identify(data: ArrayBuffer): Promise<StaticImageFormat> {
  try {
    assertMediaEncodedSize(data.byteLength)
    const file: VirtualFile = {
      name: '', size: data.byteLength, source: 'file',
      read: async (start = 0, end = data.byteLength) => data.slice(start, end),
    }
    const format = await new BinaryFormatDetector().detect(file)
    if ('animated' in format && format.animated) throw new EncodeError('ANIMATED_INPUT')
    if (format.kind !== 'jpeg' && format.kind !== 'png' && format.kind !== 'webp') throw new EncodeError('UNSUPPORTED_INPUT')
    inspectStaticDimensions(data, format.kind)
    return format.kind
  } catch (cause) { throw decodeError(cause) }
}

/** Sequential, Worker-only encoding. No decoded source survives its iteration. */
export async function runEncoding(sourceCount: number, readSource: (index: number) => Promise<ArrayBuffer>, rawOptions: EncodeOptions, hooks: EncodingHooks): Promise<EncodedGif> {
  const options = resolveEncodeOptions(rawOptions)
  if (!Number.isSafeInteger(sourceCount) || sourceCount < 1 || sourceCount > 10_000) throw new EncodeError('RESOURCE_LIMIT')
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new EncodeError('WORKER_FAILED')
  const started = performance.now()
  let decodeMs = 0, quantizeMs = 0, writeMs = 0, sourceBytes = 0
  let liveBitmaps = 0, peakBitmaps = 0, peakRgbaFrames = 0
  let canvas: OffscreenCanvas | undefined
  let writer: GifencWriter | undefined
  const dimensions: SourceDimensions[] = []
  const progress = (phase: EncodeProgress['phase'], currentFrame: number) => hooks.progress({
    phase, currentFrame, totalFrames: sourceCount,
    completedWork: phase === 'scanning' ? currentFrame : sourceCount + currentFrame,
    totalWork: sourceCount * 2,
  })

  const open = async (index: number) => {
    let data: ArrayBuffer
    try { data = await readSource(index) }
    catch (cause) { throw cause instanceof EncodeError ? cause : new EncodeError('FILE_READ_FAILED', { cause }) }
    await hooks.checkpoint()
    const format = await identify(data)
    await hooks.checkpoint()
    let bitmap: ImageBitmap | undefined
    try {
      const start = performance.now()
      bitmap = await createImageBitmap(new Blob([data], { type: { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format] }), { imageOrientation: 'from-image' })
      decodeMs += performance.now() - start
      liveBitmaps++
      peakBitmaps = Math.max(peakBitmaps, liveBitmaps)
      await hooks.checkpoint()
      assertMediaDimensions(bitmap.width, bitmap.height)
      return { bitmap, byteLength: data.byteLength }
    } catch (cause) {
      if (bitmap) { bitmap.close(); liveBitmaps-- }
      throw decodeError(cause)
    }
  }
  const closeBitmap = (bitmap: ImageBitmap) => { bitmap.close(); liveBitmaps-- }

  try {
    progress('scanning', 0)
    for (let i = 0; i < sourceCount; i++) {
      await hooks.checkpoint()
      const opened = await open(i)
      try { dimensions.push({ width: opened.bitmap.width, height: opened.bitmap.height }); sourceBytes += opened.byteLength }
      finally { closeBitmap(opened.bitmap) }
      progress('scanning', i + 1)
    }
    const width = Math.max(...dimensions.map(value => value.width)), height = Math.max(...dimensions.map(value => value.height))
    try { assertMediaDimensions(width, height) } catch (cause) { throw decodeError(cause) }
    if (width * height * sourceCount > MAX_FRAME_PIXEL_WORK) throw new EncodeError('RESOURCE_LIMIT')
    canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new EncodeError('WORKER_FAILED')
    writer = new GifencWriter(options)
    for (let i = 0; i < sourceCount; i++) {
      await hooks.checkpoint()
      progress('decoding', i)
      const { bitmap } = await open(i)
      try {
        const expected = dimensions[i]!
        if (bitmap.width !== expected.width || bitmap.height !== expected.height) throw new EncodeError('DECODE_FAILED')
        context.clearRect(0, 0, width, height)
        context.drawImage(bitmap, Math.floor((width - bitmap.width) / 2), Math.floor((height - bitmap.height) / 2))
      } finally { closeBitmap(bitmap) }
      await hooks.checkpoint()
      // Block scope is deliberate: ImageData/RGBA and indexed pixels are no
      // longer referenced when the next source read/decode starts.
      {
        const rgba = context.getImageData(0, 0, width, height).data
        peakRgbaFrames = Math.max(peakRgbaFrames, 1)
        progress('quantizing', i)
        await hooks.checkpoint()
        const quantizeStart = performance.now()
        const frame = quantizeGifFrame(rgba, options.colors, options.alphaThreshold)
        quantizeMs += performance.now() - quantizeStart
        await hooks.checkpoint()
        progress('encoding', i)
        const writeStart = performance.now()
        writer.write(frame, width, height)
        writeMs += performance.now() - writeStart
        if (writer.outputBytes > MAX_OUTPUT_BYTES) throw new EncodeError('RESOURCE_LIMIT')
      }
      progress('encoding', i + 1)
    }
    await hooks.checkpoint()
    progress('finalizing', sourceCount)
    const finishStart = performance.now()
    const result = writer.finish()
    writeMs += performance.now() - finishStart
    if (result.byteLength > MAX_OUTPUT_BYTES) throw new EncodeError('RESOURCE_LIMIT')
    return { data: result.data, byteLength: result.byteLength, metrics: {
      decodeMs, quantizeMs, writeMs, totalMs: performance.now() - started,
      peakBitmaps, peakRgbaFrames, peakFrameBytes: width * height * 4,
      outputBytes: result.byteLength, outputCapacity: result.capacity,
      frameCount: sourceCount, width, height, sourceBytes,
    } }
  } catch (cause) {
    if (cause instanceof EncodeError) throw cause
    if (cause instanceof RangeError) throw new EncodeError('RESOURCE_LIMIT', { cause })
    throw new EncodeError('ENCODING_FAILED', { cause })
  } finally {
    writer?.dispose()
    // Shrinking relinquishes Canvas backing storage; ordinary JS temporary
    // buffers are dereferenced and reclaimed by the Worker GC/termination.
    if (canvas) { canvas.width = 1; canvas.height = 1 }
  }
}
