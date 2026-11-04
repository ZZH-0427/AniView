import { StaticFramePreparer, staticSourceError } from '../static-frame-core'
import { GifencWriter, quantizeGifFrame } from './gifenc-adapter'
import { SPIKE_ENCODER_LIMITS } from './gif-validation'
import { EncodeError, resolveEncodeOptions, type EncodeLimits, type EncodeOptions, type EncodeProgress, type EncodedGif } from './model'

interface EncodingHooks { progress(progress: EncodeProgress): void; checkpoint(): Promise<void> }
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

/** Historical GIF service, retaining its encoder/options/protocol. Only native preparation is shared. */
export async function runEncoding(sourceCount: number, readSource: (index: number) => Promise<ArrayBuffer>, rawOptions: EncodeOptions,
  hooks: EncodingHooks, limits: EncodeLimits = SPIKE_ENCODER_LIMITS): Promise<EncodedGif> {
  const options = resolveEncodeOptions(rawOptions), started = performance.now()
  let source: StaticFramePreparer | undefined, writer: GifencWriter | undefined
  let quantizeMs = 0, writeMs = 0, checkpointMs = 0, checkpointCount = 0
  const checkpoint = async () => {
    const start = performance.now()
    try { await hooks.checkpoint() } finally { checkpointMs += performance.now() - start; checkpointCount++ }
  }
  const progress = (phase: EncodeProgress['phase'], currentFrame: number) => hooks.progress({ phase, currentFrame, totalFrames: sourceCount,
    completedWork: phase === 'scanning' ? currentFrame : sourceCount + currentFrame, totalWork: sourceCount * 2 })
  try {
    source = await StaticFramePreparer.open(sourceCount, readSource, { checkpoint: hooks.checkpoint, scanned: current => progress('scanning', current) }, limits)
    const { width, height } = source.metrics
    writer = new GifencWriter(options)
    for (let i = 0; i < sourceCount; i++) {
      progress('decoding', i)
      const rgba = await source.next()
      if (!rgba) throw new EncodeError('DECODE_FAILED')
      try {
        progress('quantizing', i); await checkpoint()
        const start = performance.now(), frame = quantizeGifFrame(new Uint8ClampedArray(rgba), options.colors, options.alphaThreshold)
        quantizeMs += performance.now() - start
        await checkpoint(); progress('encoding', i)
        const writeStart = performance.now(); writer.write(frame, width, height); writeMs += performance.now() - writeStart
        if (writer.outputBytes > MAX_OUTPUT_BYTES) throw new EncodeError('RESOURCE_LIMIT')
      } finally { source.releaseFrame() }
      progress('encoding', i + 1)
    }
    await checkpoint(); progress('finalizing', sourceCount)
    const finishStart = performance.now(), result = writer.finish(); writeMs += performance.now() - finishStart
    if (result.byteLength > MAX_OUTPUT_BYTES) throw new EncodeError('RESOURCE_LIMIT')
    return { data: result.data, byteLength: result.byteLength, metrics: { ...source.metrics, quantizeMs, writeMs,
      checkpointMs: checkpointMs + source.metrics.checkpointMs, checkpointCount: checkpointCount + source.metrics.checkpointCount,
      totalMs: performance.now() - started, outputBytes: result.byteLength, outputCapacity: result.capacity } }
  } catch (cause) { throw cause instanceof EncodeError ? cause : staticSourceError(cause) }
  finally { source?.close(); writer?.dispose() }
}
