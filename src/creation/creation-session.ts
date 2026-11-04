import { BinaryFormatDetector } from '../formats/binary-detector'
import type { FormatDetector } from '../formats/detector'
import type { VirtualFile } from '../input/virtual-file'
import { countRuntimeEvent } from '../media/runtime-diagnostics'
import { StaticAnimationEncoder } from './static-animation-encoder'
import type { StaticAnimationOptions, StaticAnimationConfiguration, StaticAnimationOutput } from './static-animation-encoder'
import { EncodeError } from './gif/model'
import { ConversionError, CONVERSION_LIMITS } from '../conversion/model'
import { initialCreationCleanup, recordCreationCleanup } from '../media/creation-cleanup'
import type { CreationCleanup } from '../media/creation-cleanup'
import { inspectCreationOutput } from './output-validation'
import { GIF_CREATION_LIMITS } from './gif/gif-validation'
import { DEFAULT_CREATION_SETTINGS, isCreationBusy, normalizeCreationSettings, creationFormats } from './creation-types'
import { createCreationDownloadNamer } from './download-name'
import { detectCreationSource } from './source-detection'
import type { CreationResult, CreationSettings, CreationSnapshot, CreationSource } from './creation-types'
import { creationMessage } from './creation-messages'
import { translate, translateMessage } from '../i18n/messages'
import type { Message } from '../i18n/messages'

interface CreationEncoder {
  encode(files: readonly VirtualFile[], options: StaticAnimationOptions, config?: StaticAnimationConfiguration): Promise<StaticAnimationOutput>
  cancel(): Promise<void>
}
interface Dependencies {
  readonly encoder?: CreationEncoder
  readonly detector?: FormatDetector
  readonly createUrl?: (blob: Blob) => string
  readonly revokeUrl?: (url: string) => void
  readonly inspect?: typeof inspectCreationOutput
}
export const creationErrorMessage = (cause: unknown): string => translateMessage('en', creationMessage(cause))

/** Owns only ordered source handles and one result. No Viewer session or decoded-image cache. */
export class CreationSession {
  private state: CreationSnapshot = { sources: [], settings: DEFAULT_CREATION_SETTINGS, status: 'idle', notice: '', totalSourceBytes: 0,
    diagnostics: { ...initialCreationCleanup(), generations: 0, completed: 0, cancellations: 0, jobId: 0, lastOutputBytes: 0 } }
  private readonly listeners = new Set<() => void>()
  private readonly encoder: CreationEncoder
  private readonly detector: FormatDetector
  private readonly createUrl: (blob: Blob) => string
  private readonly revokeUrl: (url: string) => void
  private readonly inspect: typeof inspectCreationOutput
  private generation = 0
  private nextSource = 0
  private disposed = false
  private abort: AbortController | undefined
  private adding: Promise<void> = Promise.resolve()
  private cancellation: Promise<void> = Promise.resolve()
  private disposal: Promise<void> | undefined
  private readonly releases = new Set<Promise<void>>()
  private task: Promise<void> | undefined
  private resourceJob = 0
  private namer: (() => string) | undefined
  readonly nextDownloadName = () => this.namer?.() ?? ''
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  constructor(dependencies: Dependencies = {}) {
    this.encoder = dependencies.encoder ?? new StaticAnimationEncoder()
    this.detector = dependencies.detector ?? new BinaryFormatDetector()
    this.createUrl = dependencies.createUrl ?? (blob => URL.createObjectURL(blob))
    this.revokeUrl = dependencies.revokeUrl ?? (url => URL.revokeObjectURL(url))
    this.inspect = dependencies.inspect ?? inspectCreationOutput
  }
  private publish(patch: Partial<CreationSnapshot>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch,
      ...('error' in patch && !patch.error ? { errorMessage: undefined } : {}),
      ...('notice' in patch && !patch.notice ? { noticeMessage: undefined, noticeReasons: undefined, rejectedCount: undefined } : {}) }
    for (const listener of this.listeners) listener()
  }
  private async release(files: readonly VirtualFile[]) {
    for (const file of new Set(files)) {
      if (this.state.sources.some(source => source.file === file)) continue
      try {
        const pending = file.release?.().catch(() => this.cleanupError())
        if (pending) { this.releases.add(pending); void pending.finally(() => this.releases.delete(pending)) }
      }
      catch { this.cleanupError() }
    }
    await Promise.all(this.releases)
  }
  private resources(patch: Partial<CreationCleanup>) {
    this.state = { ...this.state, diagnostics: { ...this.state.diagnostics, ...patch } }
    if (!this.disposed) for (const listener of this.listeners) listener()
  }
  private cleanupError() { countRuntimeEvent('cleanupErrors'); this.resources({ cleanupErrors: this.state.diagnostics.cleanupErrors + 1 }) }
  private revoke(result?: CreationResult) {
    if (!result) return
    try { this.revokeUrl(result.url) } catch { this.cleanupError() }
    this.resources({ activeObjectUrls: Math.max(0, this.state.diagnostics.activeObjectUrls - 1) })
  }
  async add(files: readonly VirtualFile[]): Promise<void> {
    if (!files.length || this.disposed || isCreationBusy(this.state.status)) return
    const id = ++this.generation
    const checkingStarted = performance.now()
    this.publish({ status: 'adding', addingProgress: { current: 0, total: files.length }, error: undefined, notice: '' })
    this.adding = (async () => {
      const sources: CreationSource[] = [...this.state.sources]
      let total = this.state.totalSourceBytes
      const rejected: VirtualFile[] = [], reasons = new Set<string>()
      const localizedReasons = new Map<string, Message>()
      const reject = (file: VirtualFile, message: Message) => {
        rejected.push(file); reasons.add(translateMessage('en', message)); localizedReasons.set(JSON.stringify(message), message)
      }
      for (const [index, file] of files.entries()) {
        if (this.disposed || id !== this.generation) break
        this.publish({ addingProgress: { current: index + 1, total: files.length } })
        if (sources.length >= GIF_CREATION_LIMITS.maxFrames) { reject(file, { key: 'creator.maxImages' }); continue }
        if (!Number.isSafeInteger(file.size) || file.size <= 0) { reject(file, { key: 'creator.unreadable' }); continue }
        if (total + file.size > GIF_CREATION_LIMITS.maxSourceBytes) { reject(file, { key: 'creator.sourceBytes' }); continue }
        try {
          const detected = await detectCreationSource(file, this.detector)
          if (this.disposed || id !== this.generation) break
          if ((detected.kind !== 'jpeg' && detected.kind !== 'png' && detected.kind !== 'webp') || detected.animated) {
            reject(file, { key: 'errors.creationUnsupported' }); continue
          }
          sources.push({ id: `creation-${++this.nextSource}`, file, format: detected.kind })
          total += file.size
        } catch (cause) { reject(file, creationMessage(cause)) }
      }
      if (this.disposed || id !== this.generation) { await this.release(files); return }
      this.publish({ sources, totalSourceBytes: total, status: 'idle', addingProgress: undefined,
        diagnostics: { ...this.state.diagnostics, sourceCheckMs: performance.now() - checkingStarted },
        notice: rejected.length ? `${rejected.length} image${rejected.length === 1 ? '' : 's'} not added. ${[...reasons].join(' ')}` : '',
        ...(rejected.length ? { rejectedCount: rejected.length, noticeReasons: [...localizedReasons.values()] } : {}) })
      await this.release(rejected)
    })()
    await this.adding
  }
  move(id: string, direction: 'up' | 'down') {
    if (this.disposed || isCreationBusy(this.state.status)) return
    const sources = [...this.state.sources], from = sources.findIndex(source => source.id === id)
    const to = from + (direction === 'up' ? -1 : 1)
    if (from < 0 || to < 0 || to >= sources.length) return
    ;[sources[from], sources[to]] = [sources[to]!, sources[from]!]
    this.publish({ sources, status: 'idle', error: undefined, notice: '' })
  }
  remove(id: string) {
    if (this.disposed || isCreationBusy(this.state.status)) return
    const removed = this.state.sources.find(source => source.id === id)
    if (!removed) return
    this.publish({ sources: this.state.sources.filter(source => source.id !== id), totalSourceBytes: this.state.totalSourceBytes - removed.file.size,
      status: 'idle', error: undefined, notice: '' })
    void this.release([removed.file])
  }
  updateSettings(change: Partial<CreationSettings>) {
    if (this.disposed || isCreationBusy(this.state.status)) return
    try { this.publish({ settings: normalizeCreationSettings({ ...this.state.settings, ...change }), status: 'idle', error: undefined }) }
    catch (cause) { const message = creationMessage(cause); this.publish({ error: translateMessage('en', message), errorMessage: message }) }
  }
  generate(): Promise<void> {
    if (this.disposed || isCreationBusy(this.state.status)) return Promise.resolve()
    if (this.state.sources.length < 2) { this.publish({ status: 'error', error: translate('en', 'errors.creationMinimum'), errorMessage: { key: 'errors.creationMinimum' } }); return Promise.resolve() }
    const id = ++this.generation, settings = { ...this.state.settings }, files = this.state.sources.map(source => source.file)
    this.resourceJob = id
    const abort = new AbortController(); this.abort = abort
    this.publish({ status: 'preparing', progress: undefined, error: undefined, notice: '', diagnostics: {
      ...this.state.diagnostics, jobId: id, generations: this.state.diagnostics.generations + 1,
    } })
    this.task = (async () => { try {
      const playCount = settings.loopForever ? 0 : settings.playCount
      const output = await this.encoder.encode(files, {
        durationMs: settings.frameDurationMs, target: settings.target, playCount,
      }, { signal: abort.signal, onResources: value => { if (this.resourceJob === id) this.resources(value) }, onProgress: progress => {
        if (this.disposed || id !== this.generation || abort.signal.aborted) return
        this.publish({ progress, status: progress.phase })
      } })
      if (this.disposed || id !== this.generation || abort.signal.aborted) return
      if (!(output.data instanceof ArrayBuffer) || !Number.isSafeInteger(output.byteLength) || output.byteLength <= 0
        || output.byteLength > output.data.byteLength || output.byteLength > CONVERSION_LIMITS.maxOutputBytes) throw new ConversionError('RESOURCE_LIMIT')
      const identity = creationFormats[settings.target]
      const blob = new Blob([new Uint8Array(output.data, 0, output.byteLength)], { type: identity.mime })
      this.publish({ status: 'verifying', progress: { phase: 'verifying', completedFrames: files.length, totalFrames: files.length } })
      let metadata: Awaited<ReturnType<typeof inspectCreationOutput>>
      try { metadata = await this.inspect(blob, settings.target, abort.signal, value => { if (this.resourceJob === id) this.resources(value) }) }
      finally { this.resources({ activeValidationDecoderWorkers: 0, activeInspectionWorkers: 0 }) }
      if (this.disposed || id !== this.generation || abort.signal.aborted) return
      if (metadata.width !== output.input.width || metadata.height !== output.input.height || metadata.playCount !== playCount
        || metadata.frameCount < 1 || (settings.target === 'webp' ? metadata.frameCount > files.length : metadata.frameCount !== files.length)
        || !Number.isFinite(metadata.durationMs) || Math.abs(metadata.durationMs - files.length * settings.frameDurationMs) > 1) throw new ConversionError('TARGET_ENCODE_FAILED')
      const namer = createCreationDownloadNamer(identity.extension)
      const result: CreationResult = { format: settings.target, mime: identity.mime, extension: identity.extension,
        blob, url: this.createUrl(blob), filename: namer(), settings, inputFrameCount: files.length,
        metadata: { ...metadata, bytes: blob.size }, metrics: output.metrics,
        creationMetrics: { source: output.sourceMetrics, totalMs: output.totalMs, peakRgbaFrames: output.peakRgbaFrames, transferredFrames: output.transferredFrames } }
      const previous = this.state.result
      this.namer = namer
      this.publish({ result, status: 'success', diagnostics: { ...this.state.diagnostics, completed: this.state.diagnostics.completed + 1,
        activeObjectUrls: this.state.diagnostics.activeObjectUrls + 1, lastOutputBytes: output.byteLength } })
      this.revoke(previous)
    } catch (cause) {
      if (this.disposed || id !== this.generation) return
      if (abort.signal.aborted || ((cause instanceof EncodeError || cause instanceof ConversionError) && cause.code === 'CANCELLED')) this.publish({ status: 'cancelled', error: undefined })
      else this.publish({ status: 'error', error: creationErrorMessage(cause), errorMessage: creationMessage(cause) })
    } finally { if (this.abort === abort) this.abort = undefined } })()
    return this.task
  }
  async cancel() {
    if (this.disposed || !this.abort) return
    const id = ++this.generation
    this.abort.abort(); this.abort = undefined
    this.publish({ status: 'cancelling', diagnostics: { ...this.state.diagnostics, cancellations: this.state.diagnostics.cancellations + 1 } })
    this.cancellation = this.encoder.cancel()
    await this.cancellation
    await this.task
    if (!this.disposed && this.generation === id) this.publish({ status: 'cancelled', error: undefined,
      notice: translate('en', 'progress.generationRetained'), noticeMessage: { key: 'progress.generationRetained' } })
  }
  async clear() {
    await this.cancel()
    ++this.generation
    await this.adding
    if (this.disposed) return
    const old = this.state
    this.publish({ sources: [], result: undefined, totalSourceBytes: 0, status: 'idle', error: undefined, progress: undefined, addingProgress: undefined, notice: '' })
    this.revoke(old.result)
    await this.release(old.sources.map(source => source.file))
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal
    this.disposed = true; ++this.generation; this.abort?.abort(); this.abort = undefined
    this.disposal = (async () => {
      await this.encoder.cancel()
      await this.cancellation
      await this.task
      await this.adding
      const old = this.state
      this.state = { ...old, sources: [], result: undefined, totalSourceBytes: 0, status: 'idle' }
      this.revoke(old.result)
      await this.release(old.sources.map(source => source.file))
      recordCreationCleanup(this.state.diagnostics)
      this.listeners.clear()
    })()
    return this.disposal
  }
}
