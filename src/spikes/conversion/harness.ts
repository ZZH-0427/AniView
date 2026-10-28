/** Isolated engineering entry. Ordinary Viewer/Creator navigation never imports this. */
import { convertAnimation, type ConversionProgress, type ConversionResult } from '../../conversion/convert'
import { EncoderWorkerClient } from '../../conversion/encoder-client'
import { openAnimationFrameSource } from '../../conversion/frame-source'
import { ConversionError, validateCanonicalMetadata } from '../../conversion/model'
import type { AnimationFrameSource, CanonicalAnimationMetadata, ConversionFormat, SourceMetrics } from '../../conversion/model'
import type { VirtualFile } from '../../input/virtual-file'
import { runtimeDiagnostics, trackRuntimeResource } from '../../media/runtime-diagnostics'
import { fingerprint } from './fixtures'
import type { FixtureOptions, FixtureRequest, FixtureResponse, FixtureScene, FrameFingerprint } from './fixtures'

export interface CaseOptions {
  readonly source: ConversionFormat
  readonly target: ConversionFormat
  readonly width: number
  readonly height: number
  readonly count: number
  readonly scene?: FixtureScene
  readonly playCount?: number
  readonly durations?: readonly number[]
  readonly cancelAfterFrames?: number
}
interface Fidelity {
  readonly scope: 'full-frame-hash-plus-64-samples' | '64-pixel-samples-only'
  readonly rgbaExact: boolean | null
  readonly visualExact: boolean | null
  readonly sampledRgbaExact: boolean
  readonly alphaMismatches: number
  readonly meanAbsoluteRgbError: number
  readonly p95AbsoluteRgbError: number
  readonly maxAbsoluteRgbError: number
  readonly comparedRgbChannels: number
}
export interface CaseReport {
  readonly status: 'PASS' | 'FIDELITY_LIMITATION' | 'FAIL' | 'CANCELLED'
  readonly options: CaseOptions
  readonly error?: string
  readonly sourceBytes?: number
  readonly sourceFixtureMs?: number
  readonly sourceFixtureRequested?: CanonicalAnimationMetadata
  readonly sourceMetadata?: CanonicalAnimationMetadata
  readonly decodedMetadata?: CanonicalAnimationMetadata
  readonly decodedSourceMetrics?: SourceMetrics
  readonly metadataMatches?: boolean
  readonly playCountMatches?: boolean
  readonly sourceDurations?: readonly number[]
  readonly decodedDurations?: readonly number[]
  readonly sourceFrameHashes?: readonly (number | null)[]
  readonly decodedFrameHashes?: readonly (number | null)[]
  readonly timingErrorsMs?: readonly (number | null)[]
  readonly targetQuantizedTimingMatches?: boolean
  readonly fidelity?: Fidelity
  readonly conversion?: Omit<ConversionResult, 'data'>
  readonly heartbeat?: { readonly count: number; readonly maxGapMs: number }
  readonly resources: ReturnType<typeof runtimeDiagnostics.getSnapshot>
}
export interface ConversionHarness {
  /** Optional tiny original conformance fixture; its bytes never enter the report. */
  runCase(options: CaseOptions, encodedInput?: readonly number[]): Promise<CaseReport>
  runMatrix(options: Omit<CaseOptions, 'source' | 'target'>): Promise<readonly CaseReport[]>
  cancel(): void
  outputBase64(): string
  readonly capabilities: { deflate: boolean | null }
  readonly results: CaseReport[]
}
declare global { interface Window { __conversionHarness: ConversionHarness } }

class FixtureWorker {
  private readonly worker = new Worker(new URL('./fixture.worker.ts', import.meta.url), { type: 'module' })
  private readonly release = trackRuntimeResource('worker')
  private id = 0
  private closed = false
  private pending: { id: number; resolve(value: FixtureResponse): void; reject(error: ConversionError): void } | undefined
  constructor() {
    this.worker.onmessage = (event: MessageEvent<FixtureResponse>) => {
      const pending = this.pending
      if (!pending || event.data.id !== pending.id) return
      this.pending = undefined
      if (event.data.type === 'error') pending.reject(new ConversionError('SOURCE_DECODE_FAILED'))
      else pending.resolve(event.data)
    }
    this.worker.onerror = event => { event.preventDefault(); this.dispose(new ConversionError('WORKER_FAILED')) }
  }
  request(command: Omit<Extract<FixtureRequest, { type: 'generate' }>, 'id'>
    | Omit<Extract<FixtureRequest, { type: 'inspect' }>, 'id'>, transfer: Transferable[] = []) {
    if (this.closed || this.pending) return Promise.reject(new ConversionError('CANCELLED'))
    const id = ++this.id
    return new Promise<FixtureResponse>((resolve, reject) => {
      this.pending = { id, resolve, reject }
      this.worker.postMessage({ ...command, id } satisfies FixtureRequest, transfer)
    })
  }
  dispose(reason = new ConversionError('CANCELLED')) {
    if (this.closed) return
    this.closed = true; this.worker.terminate(); this.release()
    this.pending?.reject(reason); this.pending = undefined
  }
}

const progressElement = document.querySelector<HTMLOutputElement>('#progress')!
const resultElement = document.querySelector<HTMLElement>('#result')!
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel')!
const capabilities = { deflate: null as boolean | null }, results: CaseReport[] = []
let controller: AbortController | undefined, generation = 0, matrixGeneration = 0
let lastOutput: { data: ArrayBuffer; byteLength: number } | undefined
const formats: readonly ConversionFormat[] = ['gif', 'webp', 'apng']
const assert: (condition: unknown) => asserts condition = condition => { if (!condition) throw new ConversionError('SOURCE_DECODE_FAILED') }
const virtual = (data: ArrayBuffer, byteLength: number): VirtualFile => ({ name: 'synthetic-animation', size: byteLength, source: 'file', read: async (start = 0, end = byteLength) => data.slice(start, end) })
const check = (signal: AbortSignal) => { if (signal.aborted) throw new ConversionError('CANCELLED') }

async function generateSource(options: FixtureOptions, source: ConversionFormat, signal: AbortSignal) {
  const worker = new FixtureWorker(), encoder = new EncoderWorkerClient()
  const abort = () => { worker.dispose(); encoder.dispose() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    check(signal)
    await encoder.open(source, { width: options.width, height: options.height, frameCount: options.count, playCount: options.playCount })
    capabilities.deflate = encoder.capabilities.deflate
    for (let index = 0; index < options.count; index++) {
      check(signal); progressElement.textContent = `Generating original fixture ${index + 1} / ${options.count}`
      const value = await worker.request({ type: 'generate', options, index })
      assert(value.type === 'frame'); check(signal)
      await encoder.addFrame(value.frame)
      assert(value.frame.rgba.byteLength === 0)
    }
    check(signal)
    return await encoder.finish()
  } finally { signal.removeEventListener('abort', abort); abort() }
}

function compare(expected: readonly FrameFingerprint[], actual: readonly FrameFingerprint[], target: ConversionFormat): Fidelity {
  const full = expected.every(frame => frame.rgbaHash !== null) && actual.every(frame => frame.rgbaHash !== null)
  let rgbaExact = expected.length === actual.length, visualExact = rgbaExact, sampledRgbaExact = rgbaExact
  let alphaMismatches = 0, errorSum = 0, max = 0, channels = 0
  const histogram = new Uint32Array(256)
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
    const a = expected[i]!, b = actual[i]!
    rgbaExact &&= a.rgbaHash === b.rgbaHash; visualExact &&= a.visualHash === b.visualHash
    for (let p = 0; p < Math.min(a.samples.length, b.samples.length); p += 4) {
      const expectedAlpha = target === 'gif' ? a.samples[p + 3]! > 127 ? 255 : 0 : a.samples[p + 3]!
      if (b.samples[p + 3] !== expectedAlpha) alphaMismatches++
      for (let c = 0; c < 4; c++) if (a.samples[p + c] !== b.samples[p + c]) sampledRgbaExact = false
      if (!expectedAlpha || !b.samples[p + 3]) continue
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(a.samples[p + c]! - b.samples[p + c]!)
        errorSum += error; histogram[error] = histogram[error]! + 1; max = Math.max(max, error); channels++
      }
    }
  }
  let cumulative = 0, p95 = 0
  for (let error = 0; error < histogram.length; error++) { cumulative += histogram[error]!; if (cumulative >= Math.ceil(channels * .95)) { p95 = error; break } }
  return { scope: full ? 'full-frame-hash-plus-64-samples' : '64-pixel-samples-only', rgbaExact: full ? rgbaExact : null,
    visualExact: full ? visualExact : null, sampledRgbaExact, alphaMismatches,
    meanAbsoluteRgbError: channels ? errorSum / channels : 0, p95AbsoluteRgbError: p95, maxAbsoluteRgbError: max, comparedRgbChannels: channels }
}

async function inspectOutput(data: ArrayBuffer, byteLength: number, target: ConversionFormat, signal: AbortSignal) {
  // This verification pass is outside conversion timing and starts only after both conversion Workers close.
  const worker = new FixtureWorker()
  let source: AnimationFrameSource | undefined
  const abort = () => { worker.dispose(); void source?.close() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    source = await openAnimationFrameSource(virtual(data, byteLength), target, signal)
    const frames: FrameFingerprint[] = []
    while (true) {
      const frame = await source.next(); check(signal)
      if (!frame) break
      const response = await worker.request({ type: 'inspect', frame, metadata: source.metadata }, [frame.rgba])
      assert(frame.rgba.byteLength === 0 && response.type === 'fingerprint')
      frames.push(response.fingerprint); source.acknowledgeFrame()
    }
    return { metadata: source.metadata, frames, metrics: source.metrics }
  } finally { signal.removeEventListener('abort', abort); await source?.close(); worker.dispose() }
}

function cancel() {
  matrixGeneration++; generation++; controller?.abort(); controller = undefined
  cancelButton.disabled = true; progressElement.textContent = 'Cancel requested; temporary Workers are being released'
}

async function runCase(options: CaseOptions, encodedInput?: readonly number[]): Promise<CaseReport> {
  controller?.abort()
  const ownGeneration = ++generation, ownController = new AbortController()
  controller = ownController; cancelButton.disabled = false; lastOutput = undefined
  const signal = ownController.signal
  const requested: CanonicalAnimationMetadata = { width: options.width, height: options.height, frameCount: options.count, playCount: options.playCount ?? 2 }
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let report: CaseReport
  try {
    assert(formats.includes(options.source) && formats.includes(options.target))
    validateCanonicalMetadata(requested)
    const durations = options.durations ?? [20, 27, 100, 250, 500, 1000]
    assert(durations.length > 0 && durations.every(value => Number.isFinite(value) && value >= 0 && value <= 655350))
    const fixtureStart = performance.now()
    // Test-only provision for tiny original disposal/blend fixtures. The browser
    // report stores scalar checksums, never these encoded bytes or a filename.
    if (encodedInput) assert(encodedInput.length > 0 && encodedInput.length <= 65_536
      && encodedInput.every(value => Number.isInteger(value) && value >= 0 && value <= 255))
    const input = encodedInput ? { data: Uint8Array.from(encodedInput).buffer, byteLength: encodedInput.length }
      : await generateSource({ width: options.width, height: options.height, count: options.count,
        scene: options.scene ?? 'solid', playCount: requested.playCount, durations }, options.source, signal)
    check(signal)
    const fixtureMs = performance.now() - fixtureStart, expected: FrameFingerprint[] = []
    let count = 0, maxGapMs = 0, lastBeat = performance.now()
    heartbeat = setInterval(() => {
      const now = performance.now(); maxGapMs = Math.max(maxGapMs, now - lastBeat); lastBeat = now; count++
      document.querySelector('#heartbeat')!.textContent = `Conversion heartbeat: ${count}; max gap ${maxGapMs.toFixed(1)} ms`
    }, 16)
    const onProgress = (value: ConversionProgress) => {
      progressElement.textContent = `${value.phase}: ${value.currentFrame} / ${value.totalFrames}`
      if (value.phase === 'encoding' && options.cancelAfterFrames !== undefined && value.currentFrame >= options.cancelAfterFrames) ownController.abort()
    }
    const converted = await convertAnimation(virtual(input.data, input.byteLength), options.source, options.target,
      { signal, onProgress, inspectFrame: frame => expected.push(fingerprint(frame, requested.width, requested.height)) })
    clearInterval(heartbeat); heartbeat = undefined
    check(signal)
    const beat = { count, maxGapMs }
    const actual = await inspectOutput(converted.data, converted.byteLength, options.target, signal)
    check(signal)
    const metadataMatches = actual.metadata.width === converted.metadata.width && actual.metadata.height === converted.metadata.height
      && actual.metadata.frameCount === converted.metadata.frameCount
    const playCountMatches = actual.metadata.playCount === converted.metadata.playCount
    const sourceDurations = expected.map(frame => frame.durationMs), decodedDurations = actual.frames.map(frame => frame.durationMs)
    const errors = sourceDurations.map((duration, index) => decodedDurations[index] === undefined ? null : decodedDurations[index]! - duration)
    const quantizedTiming = sourceDurations.length === decodedDurations.length && sourceDurations.every((duration, index) => {
      const encoded = options.target === 'gif' ? Math.round(duration / 10) * 10 : duration
      const expectedDuration = options.target === 'gif' && encoded < 20 ? 100 : encoded
      return Math.abs(decodedDurations[index]! - expectedDuration) <= (options.target === 'webp' ? 1 : 1e-5)
    })
    const fidelity = compare(expected, actual.frames, options.target)
    const structurallyValid = metadataMatches && playCountMatches && quantizedTiming
    const losslessValid = options.target === 'gif' ? fidelity.alphaMismatches === 0
      : fidelity.rgbaExact === null ? fidelity.sampledRgbaExact : fidelity.rgbaExact
    const conversion: Omit<ConversionResult, 'data'> = { byteLength: converted.byteLength, metrics: converted.metrics,
      metadata: converted.metadata, sourceMetrics: converted.sourceMetrics, totalMs: converted.totalMs,
      peakRgbaFrames: converted.peakRgbaFrames, peakFrameBytes: converted.peakFrameBytes,
      transferredFrames: converted.transferredFrames, deflateSupported: converted.deflateSupported }
    // Encoded output only, for explicit desktop oracle retrieval. No decoded history exists.
    if (ownGeneration === generation) lastOutput = { data: converted.data, byteLength: converted.byteLength }
    report = { status: !structurallyValid ? 'FAIL' : losslessValid ? 'PASS' : 'FIDELITY_LIMITATION', options,
      sourceBytes: input.byteLength, sourceFixtureMs: fixtureMs, sourceFixtureRequested: requested, sourceMetadata: converted.metadata,
      decodedMetadata: actual.metadata, decodedSourceMetrics: actual.metrics, metadataMatches, playCountMatches, sourceDurations, decodedDurations,
      timingErrorsMs: errors, sourceFrameHashes: expected.map(frame => frame.rgbaHash), decodedFrameHashes: actual.frames.map(frame => frame.rgbaHash),
      targetQuantizedTimingMatches: quantizedTiming, fidelity, conversion, heartbeat: beat,
      resources: runtimeDiagnostics.getSnapshot() }
  } catch (cause) {
    report = { status: signal.aborted ? 'CANCELLED' : 'FAIL', options,
      error: signal.aborted ? 'CANCELLED' : cause instanceof ConversionError ? cause.code : 'WORKER_FAILED', resources: runtimeDiagnostics.getSnapshot() }
  } finally {
    if (heartbeat) clearInterval(heartbeat)
    if (ownGeneration === generation) { controller = undefined; cancelButton.disabled = true }
  }
  if (ownGeneration === generation) {
    results.push(report); resultElement.textContent = JSON.stringify(report, null, 2); progressElement.textContent = report.status
  }
  return report
}

async function runMatrix(options: Omit<CaseOptions, 'source' | 'target'>) {
  const own = ++matrixGeneration, rows: CaseReport[] = []
  for (const source of formats) for (const target of formats) {
    if (own !== matrixGeneration) return rows
    const row = await runCase({ ...options, source, target }); rows.push(row)
    if (row.status === 'CANCELLED') return rows
  }
  resultElement.textContent = JSON.stringify({ status: rows.every(row => row.status === 'PASS') ? 'PASS' : 'LIMITATIONS', rows }, null, 2)
  return rows
}

function outputBase64() {
  if (!lastOutput || lastOutput.byteLength > 8 * 1024 * 1024) throw new ConversionError('RESOURCE_LIMIT')
  const bytes = new Uint8Array(lastOutput.data, 0, lastOutput.byteLength)
  let text = ''
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768))
  return btoa(text)
}

async function mobileCases(width: number, height: number, count: number) {
  const own = ++matrixGeneration, rows: CaseReport[] = []
  for (const [source, target] of [['gif', 'webp'], ['gif', 'apng'], ['apng', 'webp'], ['webp', 'apng']] as const) {
    if (own !== matrixGeneration) return
    const row = await runCase({ source, target, width, height, count, scene: 'flat', playCount: 2 }); rows.push(row)
    if (row.status === 'CANCELLED') return
  }
  resultElement.textContent = JSON.stringify({ status: rows.every(row => row.status === 'PASS') ? 'PASS' : 'LIMITATIONS', capabilities, rows }, null, 2)
}
document.querySelector('#run-small')!.addEventListener('click', () => { void mobileCases(64, 48, 6) })
document.querySelector('#run-medium')!.addEventListener('click', () => { void mobileCases(320, 240, 40) })
cancelButton.addEventListener('click', cancel)
window.__conversionHarness = { runCase, runMatrix, cancel, capabilities, results, outputBase64 }
