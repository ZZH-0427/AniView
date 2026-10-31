import type { AnimationFrameSource, CanonicalAnimationFrame, CanonicalAnimationMetadata } from '../conversion/model'
import { ConversionError, validateCanonicalFrame } from '../conversion/model'
import { countRuntimeEvent } from '../media/runtime-diagnostics'
import { codedSize, VideoError } from './model'
import type { VideoMetrics, VideoResult } from './model'
import { VideoWorkerClient } from './worker-client'
export interface VideoTransport {
  open(metadata: CanonicalAnimationMetadata): Promise<unknown>
  addFrame(frame: CanonicalAnimationFrame): Promise<VideoMetrics>
  finish(): Promise<VideoResult>
  dispose(reason?: VideoError): void
}
export type VideoProgress = { phase: 'opening' | 'encoding' | 'finalizing'; frame: number; total: number }
export async function animationToMP4(openSource: (signal: AbortSignal) => Promise<AnimationFrameSource>, signal: AbortSignal,
  progress: (p: VideoProgress) => void = () => {}, createEncoder: () => VideoTransport = () => new VideoWorkerClient()) {
  let source: AnimationFrameSource | undefined, encoder: VideoTransport | undefined
  let closing=Promise.resolve()
  const closeSource=()=>{
    if(source){const current=source;source=undefined;closing=current.close().catch(()=>{countRuntimeEvent('cleanupErrors');throw new VideoError('WORKER_FAILED')})}
    return closing
  }
  const check = () => { if (signal.aborted) throw new VideoError('CANCELLED') }
  const abort = () => { encoder?.dispose(new VideoError('CANCELLED')); void closeSource().catch(()=>{}) }
  signal.addEventListener('abort', abort, { once: true })
  const start = performance.now()
  try {
    check(); progress({ phase: 'opening', frame: 0, total: 0 }); check()
    source = await openSource(signal); check()
    const metadata = source.metadata; codedSize(metadata)
    encoder = createEncoder(); await encoder.open(metadata); check()
    for (let i = 0; i < metadata.frameCount; i++) {
      const frame = await source.next(); check()
      if (!frame) throw new VideoError('VIDEO_FRAME_FAILED')
      try { validateCanonicalFrame(frame, metadata, i) } catch { throw new VideoError('RESOURCE_LIMIT') }
      progress({ phase: 'encoding', frame: i, total: metadata.frameCount }); check()
      await encoder.addFrame(frame); check()
      if (frame.rgba.byteLength) throw new VideoError('WORKER_FAILED')
      source.acknowledgeFrame()
    }
    const sourceMetrics = { ...source.metrics }
    await closeSource(); check()
    progress({ phase: 'finalizing', frame: metadata.frameCount, total: metadata.frameCount }); check()
    const result = await encoder.finish(); check()
    return { ...result, sourceMetadata: metadata, sourceMetrics, peakCanonicalRgbaFrames: 1, totalMs: performance.now() - start }
  } catch (cause) {
    check()
    if (cause instanceof VideoError) throw cause
    if(cause instanceof ConversionError)throw new VideoError(cause.code==='RESOURCE_LIMIT'||cause.code==='SOURCE_UNSUPPORTED'||cause.code==='SOURCE_DECODE_FAILED'?cause.code:'WORKER_FAILED')
    throw new VideoError('WORKER_FAILED')
  } finally { signal.removeEventListener('abort', abort); encoder?.dispose(); await closeSource().catch(()=>{}) }
}
export class AnimationVideoJob {
  private generation = 0
  private active: AbortController | undefined
  cancel() { this.generation++; this.active?.abort(); this.active = undefined }
  async run(source: (signal: AbortSignal) => Promise<AnimationFrameSource>, progress?: (p: VideoProgress) => void, encoder?: () => VideoTransport) {
    this.cancel(); const generation = this.generation, controller = new AbortController(); this.active = controller
    try { const result = await animationToMP4(source, controller.signal, progress, encoder); if (generation !== this.generation) throw new VideoError('CANCELLED'); return result }
    finally { if (generation === this.generation) this.active = undefined }
  }
}
