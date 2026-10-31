import { BufferSource, BufferTarget, EncodedPacket, EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat, Output, VideoSampleSink } from 'mediabunny'
import type { CanonicalAnimationFrame, CanonicalAnimationMetadata } from '../conversion/model'
import { compositeWhite, sampleRgb } from './pixels'
import { VideoTimeline } from './timeline'
import { probeAvc } from './capability'
import { codedSize, emptyVideoMetrics, VIDEO_LIMITS, VideoError } from './model'
import type { ProbeResult, VideoResult, VideoTiming, VideoValidation, VideoFinalizePhase } from './model'

export class MP4Encoder {
  readonly metrics = emptyVideoMetrics()
  private readonly timeline = new VideoTimeline()
  private readonly timing: VideoTiming[] = []
  private readonly expected: Uint8Array[] = []
  private readonly packetSource = new EncodedVideoPacketSource('avc')
  private readonly target = new BufferTarget()
  private readonly output: Output<Mp4OutputFormat, BufferTarget>
  private encoder: VideoEncoder | undefined
  private config!: VideoEncoderConfig
  private probe!: ProbeResult
  private error: VideoError | undefined
  private packetChain = Promise.resolve()
  private pendingBytes = 0
  private closed = false
  private lastKeyUs = -Infinity
  private firstEncodeAt:number|undefined
  private readonly size: { width: number; height: number }
  constructor(private readonly metadata: CanonicalAnimationMetadata,
    createOutput = (target: BufferTarget) => new Output({ format: new Mp4OutputFormat({ fastStart: false }), target }),
    private readonly onFinalizePhase?:(phase:VideoFinalizePhase)=>void) {
    this.size = codedSize(metadata)
    this.output = createOutput(this.target)
    this.target.on('write', ({ end }) => {
      this.metrics.targetHighWaterBytes = Math.max(this.metrics.targetHighWaterBytes, end)
      if (end > VIDEO_LIMITS.maxOutputBytes) throw new VideoError('VIDEO_OUTPUT_TOO_LARGE')
    })
    this.output.addVideoTrack(this.packetSource) // No frameRate metadata: preserve VFR.
  }
  private check() { if (this.closed) throw new VideoError('CANCELLED'); if (this.error) throw this.error }
  private phase(phase:VideoFinalizePhase){try{this.onFinalizePhase?.(phase)}catch{/* A diagnostic observer must not change encoding. */}}
  async open() {
    this.probe = await probeAvc(this.size.width, this.size.height)
    if (!this.probe.apiPresent) throw new VideoError('VIDEO_API_UNAVAILABLE')
    if (!this.probe.selected) throw new VideoError('VIDEO_CONFIG_UNSUPPORTED')
    this.config = this.probe.selected
    await this.output.start().catch(() => { throw new VideoError('VIDEO_MUX_FAILED') })
    try {
      this.encoder = new VideoEncoder({ output: (chunk, meta) => this.acceptPacket(chunk, meta), error: () => { this.error = new VideoError('VIDEO_ENCODE_FAILED') } })
      this.encoder.configure(this.config)
    } catch { throw new VideoError('VIDEO_ENCODER_INIT_FAILED') }
    return this.probe
  }
  private acceptPacket(chunk: EncodedVideoChunk, meta: EncodedVideoChunkMetadata = {}) {
    try {
      this.check()
      const timing = this.timing.find(x => x.timestampUs === chunk.timestamp)
      if (!timing) throw new VideoError('VIDEO_ENCODE_FAILED')
      // Reserve room for MP4 tables/headers before accepting encoded payload.
      if (this.metrics.encodedBytes + chunk.byteLength > VIDEO_LIMITS.maxOutputBytes - 1024 * 1024) throw new VideoError('VIDEO_OUTPUT_TOO_LARGE')
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      const precise = new EncodedPacket(packet.data, packet.type, timing.timestampUs / 1e6, timing.durationUs / 1e6)
      if (meta.decoderConfig) this.metrics.decoderConfigReceived = true
      this.metrics.encodedBytes += chunk.byteLength; this.metrics.packets++
      this.pendingBytes += chunk.byteLength; this.metrics.maxMuxPendingBytes = Math.max(this.metrics.maxMuxPendingBytes, this.pendingBytes)
      this.packetChain = this.packetChain.then(async () => {
        this.check(); await this.packetSource.add(precise, meta)
      }).catch((cause: unknown) => { this.error = cause instanceof VideoError ? cause : new VideoError('VIDEO_MUX_FAILED') })
        .finally(() => { this.pendingBytes -= chunk.byteLength })
    } catch (cause) { this.error = cause instanceof VideoError ? cause : new VideoError('VIDEO_ENCODE_FAILED') }
  }
  async addFrame(frame: CanonicalAnimationFrame) {
    this.check()
    if (!this.encoder || frame.index !== this.timing.length || frame.index >= this.metadata.frameCount) throw new VideoError('VIDEO_FRAME_FAILED')
    const timing = this.timeline.next(frame.durationMs)
    const started = performance.now(), composed = compositeWhite(frame.rgba, this.metadata)
    this.metrics.compositeMs += performance.now() - started
    this.metrics.temporaryRgbaFrames = Math.max(this.metrics.temporaryRgbaFrames, composed.temporaryRgbaFrames)
    this.expected.push(sampleRgb(composed.pixels)); this.timing.push(timing)
    let vf: VideoFrame | undefined
    try {
      const before = performance.now()
      vf = new VideoFrame(composed.pixels, { format: 'RGBA', codedWidth: this.size.width, codedHeight: this.size.height,
        timestamp: timing.timestampUs, duration: timing.durationUs, colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true } })
      this.metrics.frameConstructionMs += performance.now() - before
      this.metrics.framesCreated++; this.metrics.activeVideoFrames++; this.metrics.peakVideoFrames = Math.max(this.metrics.peakVideoFrames, this.metrics.activeVideoFrames)
      const keyFrame = timing.timestampUs - this.lastKeyUs >= 2_000_000
      if (keyFrame) this.lastKeyUs = timing.timestampUs
      const encodeStart = performance.now();this.firstEncodeAt??=encodeStart; this.encoder.encode(vf, { keyFrame })
      this.metrics.encodeCallMs += performance.now() - encodeStart
      this.metrics.maxEncodeQueue = Math.max(this.metrics.maxEncodeQueue, this.encoder.encodeQueueSize)
    } catch (cause) { throw cause instanceof VideoError ? cause : new VideoError(vf ? 'VIDEO_ENCODE_FAILED' : 'VIDEO_FRAME_FAILED') }
    finally { if (vf) { vf.close(); this.metrics.framesClosed++; this.metrics.activeVideoFrames-- } }
    // Queue size counts WebCodecs control requests, not native reference surfaces.
    while (this.encoder.encodeQueueSize >= VIDEO_LIMITS.maxQueue) {
      this.check()
      await new Promise<void>((resolve, reject) => {
        const encoder = this.encoder!
        const timer = setTimeout(() => { encoder.removeEventListener('dequeue', done); reject(new VideoError('VIDEO_ENCODE_FAILED')) }, 15_000)
        const done = () => { clearTimeout(timer); resolve() }
        encoder.addEventListener('dequeue', done, { once: true })
      })
    }
    await this.packetChain; this.check()
  }
  async finish(): Promise<VideoResult> {
    this.check()
    if (!this.encoder || this.timing.length !== this.metadata.frameCount) throw new VideoError('VIDEO_ENCODE_FAILED')
    const start = performance.now()
    this.phase('flushing')
    try { await this.encoder.flush() } catch { this.check(); throw new VideoError('VIDEO_ENCODE_FAILED') }
    this.phase('flushed')
    // Wall phase includes waits for following source frames; it is not native CPU time.
    this.metrics.encodePhaseWallMs=performance.now()-this.firstEncodeAt!
    this.encoder.close(); this.encoder = undefined
    await this.packetChain; this.check()
    if (!this.metrics.decoderConfigReceived || this.metrics.packets !== this.timing.length) throw new VideoError('VIDEO_ENCODE_FAILED')
    this.packetSource.close()
    this.phase('mux-finalizing')
    try { await this.output.finalize() } catch (cause) { throw cause instanceof VideoError ? cause : new VideoError('VIDEO_MUX_FAILED') }
    this.check(); this.metrics.finalizeMs = performance.now() - start
    const data = this.target.buffer
    if (!data || data.byteLength > VIDEO_LIMITS.maxOutputBytes) throw new VideoError('VIDEO_OUTPUT_TOO_LARGE')
    this.metrics.outputBytes = data.byteLength
    this.phase('inspecting')
    const inspect = performance.now(), validation = await this.inspect(data)
    this.metrics.inspectionMs = performance.now() - inspect
    return { data, metrics: { ...this.metrics }, config: this.config, probe: this.probe, validation, timing: this.timing }
  }
  private async inspect(data: ArrayBuffer): Promise<VideoValidation> {
    const input = new Input({ source: new BufferSource(data), formats: [MP4] })
    try {
      const track = await input.getPrimaryVideoTrack()
      if (!track || !await track.canDecode()) throw new VideoError('VIDEO_VALIDATION_FAILED')
      const rows: { timestampUs: number; durationUs: number; meanRgbError: number }[] = []
      let maximum = 0, sum = 0, channels = 0, maxTimestamp = 0, maxDuration = 0
      const histogram = new Uint32Array(256)
      for await (const sample of new VideoSampleSink(track).samples()) {
        this.check(); const index = rows.length, expected = this.expected[index], timing = this.timing[index]
        if (!expected || !timing) { sample.close(); throw new VideoError('VIDEO_VALIDATION_FAILED') }
        let frame: VideoFrame | undefined
        try {
          frame = sample.toVideoFrame(); this.metrics.framesCreated++; this.metrics.activeVideoFrames++
          this.metrics.peakVideoFrames = Math.max(this.metrics.peakVideoFrames, this.metrics.activeVideoFrames)
          const rgba = new Uint8Array(this.size.width * this.size.height * 4)
          await frame.copyTo(rgba, { format: 'RGBA' })
          const actual = sampleRgb(rgba); let error = 0
          for (let i = 0; i < actual.length; i++) { const e = Math.abs(actual[i]! - expected[i]!); histogram[e] = histogram[e]! + 1; maximum = Math.max(maximum, e); sum += e; error += e; channels++ }
          const timestampUs = Math.round(sample.timestamp * 1e6), durationUs = Math.round(sample.duration * 1e6)
          maxTimestamp = Math.max(maxTimestamp, Math.abs(timestampUs - timing.timestampUs)); maxDuration = Math.max(maxDuration, Math.abs(durationUs - timing.durationUs))
          rows.push({ timestampUs, durationUs, meanRgbError: error / actual.length })
        } finally { if (frame) { frame.close(); this.metrics.framesClosed++; this.metrics.activeVideoFrames-- } sample.close() }
      }
      const last = this.timing.at(-1)!, duration = Math.round(await input.computeDuration() * 1e6)
      let cumulative = 0, p95 = 0
      for (; p95 < 255; p95++) { cumulative += histogram[p95]!; if (cumulative >= channels * .95) break }
      const result = { codec: (await track.getDecoderConfig())?.codec ?? null, width: await track.getDisplayWidth(), height: await track.getDisplayHeight(), frameCount: rows.length,
        audioTracks: (await input.getAudioTracks()).length, maxTimestampErrorUs: maxTimestamp, maxDurationErrorUs: maxDuration,
        totalDurationErrorUs: Math.abs(duration - last.timestampUs - last.durationUs), meanRgbError: sum / Math.max(1, channels), p95RgbError: p95, maxRgbError: maximum, perFrame: rows }
      // 57,600Hz MP4 timebase: tolerate <3 ticks, never a lost 1ms frame.
      if (rows.length !== this.timing.length || result.audioTracks || maxTimestamp > 50 || maxDuration > 50 || result.totalDurationErrorUs > 50) throw new VideoError('VIDEO_VALIDATION_FAILED')
      return result
    } catch(cause) { throw cause instanceof VideoError ? cause : new VideoError('VIDEO_VALIDATION_FAILED') }
    finally { input.dispose() }
  }
  async dispose() {
    if (this.closed) return
    this.closed = true
    if (this.encoder && this.encoder.state !== 'closed') this.encoder.close()
    this.encoder = undefined
    // During finalizing this cannot interrupt the library; caller terminates its dedicated Worker.
    if (this.output.state !== 'finalized') await this.output.cancel().catch(() => {})
    this.expected.length = 0
  }
}
