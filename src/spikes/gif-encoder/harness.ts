/** Engineering-only entry; never imported by the application or normal build. */
import { StaticGifEncoder } from './encoder-client'
import { EncodeError, type EncodedGif, type EncodeOptions, type EncodeProgress } from './model'
import { browserFile } from '../../input/browser-file'
import type { VirtualFile } from '../../input/virtual-file'
import { GIFAnimationDecoder } from '../../formats/gif/gif-animation-decoder'
import { readGIF } from '../../formats/gif/gif-reader'
import { runtimeDiagnostics } from '../../media/runtime-diagnostics'

type SampleKind = 'solid' | 'flat' | 'gradient' | 'high-color'
interface Artifact { name: string; type: string; base64: string }
interface CheckResult { name: string; detail?: unknown }
interface TimingRow { name: string; sourceType: string; heartbeatCount: number; maxHeartbeatGapMs: number; metrics: EncodedGif['metrics'] }
interface ColorMetric { meanAbsoluteRgbError: number; p95AbsoluteRgbError: number; maxAbsoluteRgbError: number; opaquePixels: number; alphaMismatches: number }
interface QualityRow { kind: SampleKind; colors: number; metrics: ColorMetric; encode: EncodedGif['metrics'] }
interface SpikeReport { browser: string; checks: CheckResult[]; performance: TimingRow[]; quality: QualityRow[]; resources: unknown; elapsedMs: number; artifacts: Artifact[] }

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message) }
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const progressElement = document.querySelector<HTMLOutputElement>('#progress')!
const resultElement = document.querySelector<HTMLElement>('#result')!
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel')!
const artifactsElement = document.querySelector<HTMLElement>('#artifacts')!
const activeEncoder = new StaticGifEncoder()
let currentController: AbortController | undefined
let lastProgress: EncodeProgress | undefined
let state: { phase: string; done: boolean; report?: SpikeReport; error?: string } = { phase: 'ready', done: false }

function virtual(blob: Blob, name = 'source.png'): VirtualFile { return browserFile(new File([blob], name, { type: blob.type })) }

/** Original procedural samples: no downloaded artwork or third-party photographs. */
function paint(context: OffscreenCanvasRenderingContext2D, width: number, height: number, kind: SampleKind, frame: number) {
  context.clearRect(0, 0, width, height)
  if (kind === 'solid') { context.fillStyle = ['#e02632', '#20ba58', '#2e50df'][frame % 3]!; context.fillRect(0, 0, width, height); return }
  if (kind === 'flat') {
    context.fillStyle = '#4985c8'; context.fillRect(0, 0, width, height)
    context.fillStyle = '#c6dba4'; context.fillRect(0, height * .75, width, height * .25)
    context.fillStyle = '#243047'; context.beginPath(); context.ellipse(width * .5, height * .48, width * .23, height * .4, 0, 0, Math.PI * 2); context.fill()
    const skin = context.createLinearGradient(0, height * .2, width * .7, height * .8); skin.addColorStop(0, '#ffe3c5'); skin.addColorStop(1, '#edb292')
    context.fillStyle = skin; context.beginPath(); context.ellipse(width * .5, height * .46, width * .18, height * .28, 0, 0, Math.PI * 2); context.fill()
    context.fillStyle = '#243047'; context.beginPath(); context.moveTo(width * .29, height * .36); context.lineTo(width * .48, height * .09); context.lineTo(width * .7, height * .36); context.lineTo(width * .56, height * .3); context.lineTo(width * .48, height * .42); context.lineTo(width * .44, height * .27); context.closePath(); context.fill()
    context.lineWidth = Math.max(1, width / 100); context.strokeStyle = '#222339'
    for (const x of [.43, .58]) { context.beginPath(); context.ellipse(width * x, height * .47, width * .025, height * (.025 + (frame % 3) * .008), 0, 0, Math.PI * 2); context.stroke() }
    context.beginPath(); context.arc(width * .5, height * .59, width * .045, 0, Math.PI); context.stroke()
    context.fillStyle = '#ee8979'; context.beginPath(); context.moveTo(width * .28, height); context.lineTo(width * .36, height * .73); context.lineTo(width * .64, height * .73); context.lineTo(width * .72, height); context.fill()
    context.fillStyle = '#f7e1af'; context.fillRect(width * (.05 + frame % 3 * .02), height * .1, width * .12, height * .08)
    return
  }
  if (kind === 'gradient') {
    const gradient = context.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#16285c'); gradient.addColorStop(.35, '#9e71bc'); gradient.addColorStop(.7, '#f3cda0'); gradient.addColorStop(1, '#e6f0c4')
    context.fillStyle = gradient; context.fillRect(0, 0, width, height)
    const glow = context.createRadialGradient(width * .3, height * .4, 0, width * .3, height * .4, width * .6)
    glow.addColorStop(0, '#f7b77ba8'); glow.addColorStop(1, '#607b2300'); context.fillStyle = glow; context.fillRect(0, 0, width, height)
    return
  }
  // A high-color procedural landscape exercises photographic-style texture and
  // gradients. It is explicitly a proxy, not a real camera photograph.
  const image = context.createImageData(width, height)
  let random = 0x45abc391 + frame
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5
    const noise = (random >>> 0) / 0xffffffff - .5, xx = x / width, yy = y / height
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5
    const greenNoise = (random >>> 0) / 0xffffffff - .5
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5
    const blueNoise = (random >>> 0) / 0xffffffff - .5
    const ridge = .53 + Math.sin(xx * 11 + frame * .05) * .075 + Math.sin(xx * 29) * .025
    const ground = yy > ridge, shade = .5 + Math.sin(xx * 50 + yy * 31) * .1
    const offset = (y * width + x) * 4
    image.data[offset] = ground ? 58 + shade * 70 + noise * 70 + xx * 40 : 70 + yy * 150 + noise * 12
    image.data[offset + 1] = ground ? 83 + shade * 77 + greenNoise * 65 : 120 + yy * 100 + greenNoise * 12
    image.data[offset + 2] = ground ? 36 + shade * 60 + blueNoise * 65 + (1 - xx) * 35 : 187 + yy * 45 + blueNoise * 12
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
}

async function sources(count: number, width: number, height: number, kind: SampleKind = 'flat', type = 'image/png') {
  const files: VirtualFile[] = [], canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d')!
  for (let frame = 0; frame < count; frame++) {
    paint(context, width, height, kind, frame)
    files.push(virtual(await canvas.convertToBlob({ type, quality: .92 }), `source-${frame}.${type.split('/')[1]}`))
    if (frame % 10 === 0) await delay(0)
  }
  canvas.width = 1; canvas.height = 1
  return files
}

async function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.onerror = reject; reader.readAsDataURL(blob) })
}

function gifBlob(result: EncodedGif) { return new Blob([new Uint8Array(result.data, 0, result.byteLength)], { type: 'image/gif' }) }
function gifData(result: EncodedGif) { return result.data.slice(0, result.byteLength) }

async function decoded(result: EncodedGif, consume: (rgba: Uint8ClampedArray, index: number, width: number, height: number) => void | Promise<void>) {
  const sequence = await new GIFAnimationDecoder().decode(virtual(gifBlob(result), 'roundtrip.gif'))
  let count = 0
  try {
    for await (const frame of sequence.frames()) {
      try { assert(frame.image instanceof ImageData, 'Expected GIF ImageData'); await consume(frame.image.data, count++, frame.width, frame.height) }
      finally { frame.dispose() }
    }
  } finally { await sequence.dispose() }
  assert(count === result.metrics.frameCount, 'Roundtrip frame count')
  return sequence
}

async function encode(files: readonly VirtualFile[], options: Partial<EncodeOptions> = {}, signal?: AbortSignal) {
  const progress: EncodeProgress[] = []
  const lastByPhase = new Map<string, number>()
  let completedWork = 0
  let heartbeatCount = 0, maxHeartbeatGapMs = 0, lastBeat = performance.now()
  const heartbeat = setInterval(() => { const now = performance.now(); maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - lastBeat); lastBeat = now; heartbeatCount++; document.querySelector('#heartbeat')!.textContent = `Heartbeat: ${heartbeatCount}` }, 16)
  try {
    const result = await activeEncoder.encode(files, options, {
      ...(signal ? { signal } : {}),
      onProgress(value) {
        assert(value.currentFrame >= 0 && value.currentFrame <= value.totalFrames, 'Progress range')
        assert(value.currentFrame >= (lastByPhase.get(value.phase) ?? 0), 'Progress monotonic within phase')
        assert(value.completedWork !== undefined && value.totalWork === value.totalFrames * 2
          && value.completedWork >= completedWork && value.completedWork <= value.totalWork, 'Progress monotonic across complete job')
        completedWork = value.completedWork
        lastByPhase.set(value.phase, value.currentFrame); progress.push(value); lastProgress = value
        progressElement.textContent = `${value.phase}: ${value.currentFrame} / ${value.totalFrames}`
      },
    })
    assert(String.fromCharCode(...new Uint8Array(result.data, 0, 6)) === 'GIF89a', 'GIF89a header')
    assert(result.byteLength <= result.data.byteLength && result.metrics.outputBytes === result.byteLength, 'Output exact range')
    assert(result.metrics.peakRgbaFrames === 1 && result.metrics.peakBitmaps === 1, 'Single decoded frame and bitmap')
    assert(progress.length > 0, 'Missing progress')
    return { result, progress, heartbeatCount, maxHeartbeatGapMs }
  } finally { clearInterval(heartbeat) }
}

async function expectError(files: readonly VirtualFile[], code: string) {
  try { await encode(files); throw new Error('Expected rejection') }
  catch (error) { assert(error instanceof EncodeError && error.code === code, `Expected ${code}, got ${String(error)}`) }
}

async function runCore(checks: CheckResult[], artifacts: Artifact[]) {
  const solids = await sources(2, 16, 12, 'solid')
  const first = (await encode(solids, { frameDurationMs: 100 })).result
  const parsed = readGIF(gifData(first)); assert(parsed.width === 16 && parsed.height === 12 && parsed.frames.length === 2, 'Solid geometry')
  await decoded(first, (pixels, index) => { assert(pixels[3] === 255 && (index === 0 ? pixels[0]! > 180 && pixels[1]! < 80 : pixels[1]! > 140 && pixels[0]! < 80), 'Input order or solid RGB') })
  artifacts.push({ name: 'viewer-roundtrip.gif', type: 'image/gif', base64: await toBase64(gifBlob(first)) })
  checks.push({ name: 'two solids + existing AniView GIF Worker roundtrip + exact order' })
  const mixedColors = (await encode(await sources(10, 80, 48, 'flat'), { frameDurationMs: 100 })).result
  await decoded(mixedColors, () => {})
  checks.push({ name: '10 mixed-color frames, exact count' })
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const output = (await encode(await sources(2, 20, 12, 'solid', type))).result
    await decoded(output, () => {})
    checks.push({ name: `${type} standalone static-source sequence` })
  }

  for (const requested of [20, 100, 250, 500, 1000, 27]) {
    const output = (await encode(solids, { frameDurationMs: requested })).result
    const parsedTiming = readGIF(gifData(output)), expected = Math.round(requested / 10) * 10
    assert(parsedTiming.frames.every(frame => frame.delay * 10 === expected), 'GIF centisecond timing')
    const sequence = await decoded(output, () => {})
    assert(sequence.frameCount === 2, 'Timing decoded count')
    checks.push({ name: `timing ${requested} ms`, detail: { requested, storedMs: expected } })
  }
  for (const [loop, expected] of [[{ kind: 'forever' }, 0], [{ kind: 'once' }, 1], [{ kind: 'repeat', repeats: 2 }, 3]] as const) {
    const output = (await encode(solids, { loop })).result, parsedLoop = readGIF(gifData(output))
    assert(parsedLoop.loopCount === expected, 'Normalized loop metadata')
    const sequence = await decoded(output, () => {}); assert(sequence.loopCount === expected, 'AniView GIF loop metadata')
    checks.push({ name: `loop ${loop.kind}`, detail: { gifencRepeat: loop.kind === 'forever' ? 0 : loop.kind === 'once' ? -1 : loop.repeats, normalizedTotalPlays: expected } })
  }

  const background = await sources(1, 12, 10, 'solid', 'image/jpeg')
  const transparent = new OffscreenCanvas(4, 2), context = transparent.getContext('2d')!
  const image = context.createImageData(4, 2)
  const alphas = [0, 127, 128, 255, 255, 128, 127, 0]
  alphas.forEach((alpha, index) => image.data.set([255, 20, 90, alpha], index * 4)); context.putImageData(image, 0, 0)
  const png = virtual(await transparent.convertToBlob({ type: 'image/png' }), 'actually-png.jpg')
  const webp = virtual(await transparent.convertToBlob({ type: 'image/webp', quality: 1 }), 'transparent.webp')
  const geometry = (await encode([...background, png, webp], { alphaThreshold: 127 })).result
  await decoded(geometry, (pixels, index, width, height) => {
    assert(width === 12 && height === 10, 'Mixed canvas dimensions')
    if (index === 0) { assert(pixels.every((value, offset) => offset % 4 !== 3 || value === 255), 'Opaque JPEG') }
    else {
      assert(pixels[3] === 0, 'Padding must clear preceding opaque frame')
      const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3]
      assert(alphaAt(4, 4) === 0 && alphaAt(5, 4) === 0 && alphaAt(6, 4) === 255 && alphaAt(7, 4) === 255, 'Semi-alpha threshold / integer centering')
      assert(alphaAt(3, 4) === 0 && alphaAt(8, 4) === 0 && alphaAt(4, 3) === 0 && alphaAt(4, 6) === 0, 'No scaling / crop / trailing pixels')
    }
  })
  checks.push({ name: 'JPEG + wrong-extension PNG + transparent static WebP; max dimensions, center, no scaling/crop, alpha threshold, full canvas clear' })
  artifacts.push({ name: 'transparent-padding-mixed.gif', type: 'image/gif', base64: await toBase64(gifBlob(geometry)) })
  const softCanvas = new OffscreenCanvas(128, 128), softContext = softCanvas.getContext('2d')!
  const softFill = softContext.createRadialGradient(64, 64, 20, 64, 64, 56)
  softFill.addColorStop(0, '#ee4855ff'); softFill.addColorStop(1, '#ee485500')
  softContext.fillStyle = softFill; softContext.fillRect(0, 0, 128, 128)
  const softFile = virtual(await softCanvas.convertToBlob({ type: 'image/png' }), 'soft-alpha.png')
  const softOutput = (await encode([softFile])).result, softComparison = await colorMetric(softFile, softOutput)
  assert(softComparison.metric.alphaMismatches === 0, 'Soft alpha threshold')
  artifacts.push({ name: 'soft-alpha-threshold.gif', type: 'image/gif', base64: await toBase64(gifBlob(softOutput)) })
  artifacts.push({ name: 'soft-alpha-source-vs-gif.png', type: 'image/png', base64: await toBase64(softComparison.comparison) })
  checks.push({ name: 'soft alpha edge: exact 127 threshold; GIF intentionally loses semitransparency', detail: softComparison.metric })
  const orientationResponse = await fetch(new URL('../../../tests/fixtures/static/orientation-6.jpg', import.meta.url))
  assert(orientationResponse.ok, 'EXIF fixture response')
  const oriented = (await encode([virtual(await orientationResponse.blob(), 'exif.jpg')])).result
  assert(oriented.metrics.width === 20 && oriented.metrics.height === 40, 'EXIF from-image orientation')
  checks.push({ name: 'Worker ImageBitmap EXIF orientation 6: stored 40x20 → oriented 20x40' })
  for (const [path, name] of [['../../../tests/fixtures/validation/viewer/long.webp', 'Animated WebP'], ['../../../tests/fixtures/validation/viewer/mixed-media.zip', 'ZIP']] as const) {
    const response = await fetch(new URL(path, import.meta.url)); assert(response.ok, 'Fixture response')
    await expectError([virtual(await response.blob(), name)], name === 'ZIP' ? 'UNSUPPORTED_INPUT' : 'ANIMATED_INPUT')
    checks.push({ name: `reject ${name}` })
  }
  for (const [bytes, code] of [[new Uint8Array([71,73,70,56,57,97,0,0]), 'ANIMATED_INPUT'], [new Uint8Array([255,216,255,0,0,0]), 'DECODE_FAILED']] as const) {
    await expectError([virtual(new Blob([bytes]), 'wrong-name.png')], code)
    checks.push({ name: `reject ${code === 'ANIMATED_INPUT' ? 'GIF' : 'corrupted JPEG'}` })
  }
  const pngBytes = new Uint8Array(await png.read()), apngBytes = new Uint8Array(pngBytes.length + 20)
  apngBytes.set(pngBytes.subarray(0, 33)); new DataView(apngBytes.buffer).setUint32(33, 8); apngBytes.set([97,99,84,76], 37); new DataView(apngBytes.buffer).setUint32(41, 2); apngBytes.set(pngBytes.subarray(33), 53)
  await expectError([virtual(new Blob([apngBytes]), 'animated.png')], 'ANIMATED_INPUT')
  checks.push({ name: 'reject APNG animation metadata before static decode' })

  const cancelFiles = await sources(10, 320, 240, 'flat'), controller = new AbortController()
  const cancelled = activeEncoder.encode(cancelFiles, {}, { signal: controller.signal, onProgress(value) { if (value.phase === 'quantizing') controller.abort() } })
  try { await cancelled; throw new Error('Cancelled job resolved') } catch (error) { assert(error instanceof EncodeError && error.code === 'CANCELLED', 'Cancellation error') }
  await activeEncoder.cancel()
  const afterCancel = (await encode(solids)).result; await decoded(afterCancel, () => {})
  checks.push({ name: 'quantization-phase cancellation → cleanup → replacement succeeds' })
}

async function colorMetric(file: VirtualFile, result: EncodedGif): Promise<{ metric: ColorMetric; comparison: Blob }> {
  const bitmap = await createImageBitmap(new Blob([await file.read()]), { imageOrientation: 'from-image' })
  const canvas = new OffscreenCanvas(bitmap.width * 2, bitmap.height), context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0); bitmap.close()
  const expected = context.getImageData(0, 0, canvas.width / 2, canvas.height).data
  let metric: ColorMetric = { meanAbsoluteRgbError: 0, p95AbsoluteRgbError: 0, maxAbsoluteRgbError: 0, opaquePixels: 0, alphaMismatches: 0 }
  await decoded(result, (actual, index, width, height) => {
    if (index) return
    const histogram = new Uint32Array(256); let sum = 0, samples = 0, alphaMismatches = 0, max = 0
    for (let offset = 0; offset < expected.length; offset += 4) {
      if ((expected[offset + 3]! > 127) !== (actual[offset + 3]! > 0)) alphaMismatches++
      if (expected[offset + 3]! <= 127) continue
      for (let channel = 0; channel < 3; channel++) { const error = Math.abs(expected[offset + channel]! - actual[offset + channel]!); sum += error; samples++; histogram[error] = histogram[error]! + 1; max = Math.max(max, error) }
    }
    let p95 = 0, accumulated = 0
    for (; p95 < histogram.length; p95++) { accumulated += histogram[p95]!; if (accumulated >= samples * .95) break }
    metric = { meanAbsoluteRgbError: sum / samples, p95AbsoluteRgbError: p95, maxAbsoluteRgbError: max, opaquePixels: samples / 3, alphaMismatches }
    context.putImageData(new ImageData(new Uint8ClampedArray(actual), width, height), width, 0)
  })
  return { metric, comparison: await canvas.convertToBlob({ type: 'image/png' }) }
}

async function runQuality(quality: QualityRow[], artifacts: Artifact[]) {
  for (const kind of ['flat', 'gradient', 'high-color'] as const) {
    const files = await sources(3, 384, 256, kind)
    for (const colors of [256, 128, 64] as const) {
      state.phase = `quality ${kind} ${colors}`
      const output = (await encode(files, { colors })).result, comparison = await colorMetric(files[0]!, output)
      assert(comparison.metric.alphaMismatches === 0, 'Quality alpha mismatch')
      quality.push({ kind, colors, metrics: comparison.metric, encode: output.metrics })
      artifacts.push({ name: `${kind}-${colors}.gif`, type: 'image/gif', base64: await toBase64(gifBlob(output)) })
      artifacts.push({ name: `${kind}-${colors}-source-vs-gif.png`, type: 'image/png', base64: await toBase64(comparison.comparison) })
    }
  }
}

async function benchmark(name: string, count: number, width: number, height: number, kind: SampleKind, type: string): Promise<TimingRow> {
  state.phase = name; progressElement.textContent = `Generating ${name}`
  const files = await sources(count, width, height, kind, type)
  const { result, heartbeatCount, maxHeartbeatGapMs } = await encode(files)
  await decoded(result, () => {})
  assert(heartbeatCount > 0, 'Main-thread heartbeat stopped')
  assert(maxHeartbeatGapMs < 250, `Main-thread heartbeat exceeded 250 ms: ${maxHeartbeatGapMs}`)
  return { name, sourceType: type, heartbeatCount, maxHeartbeatGapMs, metrics: result.metrics }
}

async function encodedBytesProbe(): Promise<TimingRow> {
  state.phase = 'encoded-source-bytes-16MiB'
  const [base] = await sources(1, 64, 48, 'flat', 'image/webp')
  const bytes = new Uint8Array(await base!.read()), padding = 16 * 1024 * 1024
  const padded = new Uint8Array(bytes.byteLength + padding + 8); padded.set(bytes)
  padded.set([74, 85, 78, 75], bytes.byteLength)
  const view = new DataView(padded.buffer)
  view.setUint32(bytes.byteLength + 4, padding, true); view.setUint32(4, padded.byteLength - 8, true)
  const files = [virtual(new Blob([padded], { type: 'image/webp' }), 'metadata-padded.webp'), base!]
  const { result, heartbeatCount, maxHeartbeatGapMs } = await encode(files)
  assert(result.metrics.sourceBytes === padded.byteLength + base!.size, 'Encoded-byte accounting')
  await decoded(result, () => {})
  assert(heartbeatCount > 0 && maxHeartbeatGapMs < 250, 'Large encoded-source heartbeat')
  return { name: 'encoded-source-bytes-16MiB-metadata-padding', sourceType: 'image/webp + 16MiB JUNK metadata', heartbeatCount, maxHeartbeatGapMs, metrics: result.metrics }
}

async function runDesktop(): Promise<SpikeReport> {
  state = { phase: 'core', done: false }; const start = performance.now(), checks: CheckResult[] = [], performanceRows: TimingRow[] = [], quality: QualityRow[] = [], artifacts: Artifact[] = []
  await runCore(checks, artifacts)
  await runQuality(quality, artifacts)
  for (const count of [10, 50, 100, 200]) performanceRows.push(await benchmark(`many-${count}`, count, 320, 240, 'flat', 'image/png'))
  for (const [width, height] of [[1024,1024], [1920,1080], [2048,2048]] as const) performanceRows.push(await benchmark(`large-${width}x${height}`, 2, width, height, 'gradient', 'image/png'))
  performanceRows.push(await encodedBytesProbe())
  const report: SpikeReport = { browser: navigator.userAgent, checks, performance: performanceRows, quality, resources: runtimeDiagnostics.getSnapshot(), elapsedMs: performance.now() - start, artifacts }
  state = { phase: 'complete', done: true, report }; resultElement.textContent = JSON.stringify({ ...report, artifacts: report.artifacts.map(({ name }) => name) }, null, 2)
  return report
}

async function runMobile(kind: 'large' | 'many') {
  if (currentController) return
  currentController = new AbortController(); cancelButton.disabled = false
  try {
    const count = kind === 'large' ? 10 : 40, width = kind === 'large' ? 1024 : 320, height = kind === 'large' ? 1024 : 240
    progressElement.textContent = 'Generating original source images locally…'
    const files = await sources(count, width, height, 'flat')
    const value = await encode(files, {}, currentController.signal)
    await decoded(value.result, () => {})
    const report = { status: 'PASS', browser: navigator.userAgent, workload: { count, width, height }, ...value.result.metrics, heartbeatCount: value.heartbeatCount, maxHeartbeatGapMs: value.maxHeartbeatGapMs, resources: runtimeDiagnostics.getSnapshot() }
    resultElement.textContent = JSON.stringify(report, null, 2); progressElement.textContent = 'PASS — copy this JSON and report responsiveness / reload / memory pressure.'
    artifactsElement.replaceChildren()
  } catch (error) { resultElement.textContent = JSON.stringify({ status: error instanceof EncodeError && error.code === 'CANCELLED' ? 'CANCELLED' : 'FAILED', error: String(error), progress: lastProgress, resources: runtimeDiagnostics.getSnapshot() }, null, 2) }
  finally { currentController = undefined; cancelButton.disabled = true; await activeEncoder.cancel() }
}

document.querySelector('#mobile-large')!.addEventListener('click', () => { void runMobile('large') })
document.querySelector('#mobile-many')!.addEventListener('click', () => { void runMobile('many') })
cancelButton.addEventListener('click', () => { currentController?.abort() })

declare global {
  interface Window {
    gifSpike: { runDesktop: () => Promise<SpikeReport>; getState: () => typeof state; runMobile: typeof runMobile }
  }
}
window.gifSpike = { runDesktop, getState: () => state, runMobile }
