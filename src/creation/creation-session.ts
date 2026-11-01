import { BinaryFormatDetector } from '../formats/binary-detector'
import type { FormatDetector } from '../formats/detector'
import type { VirtualFile } from '../input/virtual-file'
import { countRuntimeEvent } from '../media/runtime-diagnostics'
import { StaticGifEncoder, type EncodeConfiguration } from './gif/encoder-client'
import { EncodeError, type EncodedGif, type EncodeOptions } from './gif/model'
import { GIF_CREATION_LIMITS } from './gif/gif-validation'
import { DEFAULT_CREATION_SETTINGS, isCreationBusy, normalizeCreationSettings } from './creation-types'
import { createGifDownloadNamer } from './download-name'
import { detectCreationSource } from './source-detection'
import type { CreationResult, CreationSettings, CreationSnapshot, CreationSource } from './creation-types'
import { creationMessage } from './creation-messages'
import { translate, translateMessage } from '../i18n/messages'
import type { Message } from '../i18n/messages'

interface CreationEncoder {
  encode(files: readonly VirtualFile[], options?: Partial<EncodeOptions>, config?: EncodeConfiguration): Promise<EncodedGif>
  cancel(): Promise<void>
}
interface Dependencies {
  readonly encoder?: CreationEncoder
  readonly detector?: FormatDetector
  readonly createUrl?: (blob: Blob) => string
  readonly revokeUrl?: (url: string) => void
}
export const creationErrorMessage = (cause: unknown): string => translateMessage('en', creationMessage(cause))

/** Owns only ordered source handles and one result. No Viewer session or decoded-image cache. */
export class CreationSession {
  private state: CreationSnapshot = { sources: [], settings: DEFAULT_CREATION_SETTINGS, status: 'idle', notice: '', totalSourceBytes: 0,
    diagnostics: { generations: 0, cancellations: 0, lastOutputBytes: 0 } }
  private readonly listeners = new Set<() => void>()
  private readonly encoder: CreationEncoder
  private readonly detector: FormatDetector
  private readonly createUrl: (blob: Blob) => string
  private readonly revokeUrl: (url: string) => void
  private generation = 0
  private nextSource = 0
  private disposed = false
  private abort: AbortController | undefined
  private adding: Promise<void> = Promise.resolve()
  private cancellation: Promise<void> = Promise.resolve()
  private disposal: Promise<void> | undefined
  private readonly releases = new Set<Promise<void>>()
  readonly nextDownloadName = createGifDownloadNamer()
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  constructor(dependencies: Dependencies = {}) {
    this.encoder = dependencies.encoder ?? new StaticGifEncoder()
    this.detector = dependencies.detector ?? new BinaryFormatDetector()
    this.createUrl = dependencies.createUrl ?? (blob => URL.createObjectURL(blob))
    this.revokeUrl = dependencies.revokeUrl ?? (url => URL.revokeObjectURL(url))
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
        const pending = file.release?.().catch(() => countRuntimeEvent('cleanupErrors'))
        if (pending) { this.releases.add(pending); void pending.finally(() => this.releases.delete(pending)) }
      }
      catch { countRuntimeEvent('cleanupErrors') }
    }
    await Promise.all(this.releases)
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
  async generate() {
    if (this.disposed || isCreationBusy(this.state.status)) return
    if (this.state.sources.length < 2) { this.publish({ status: 'error', error: translate('en', 'errors.creationMinimum'), errorMessage: { key: 'errors.creationMinimum' } }); return }
    const id = ++this.generation, settings = { ...this.state.settings }, files = this.state.sources.map(source => source.file)
    const abort = new AbortController(); this.abort = abort
    this.publish({ status: 'preparing', progress: undefined, error: undefined, notice: '', diagnostics: {
      ...this.state.diagnostics, generations: this.state.diagnostics.generations + 1,
    } })
    try {
      const output = await this.encoder.encode(files, {
        frameDurationMs: settings.frameDurationMs, colors: 256, alphaThreshold: 127,
        loop: settings.loopForever ? { kind: 'forever' } : settings.playCount === 1 ? { kind: 'once' } : { kind: 'repeat', repeats: settings.playCount - 1 },
      }, { signal: abort.signal, limits: GIF_CREATION_LIMITS, onProgress: progress => {
        if (this.disposed || id !== this.generation || abort.signal.aborted) return
        this.publish({ progress, status: progress.phase === 'scanning' ? 'preparing' : progress.phase === 'finalizing' ? 'finalizing' : 'encoding' })
      } })
      if (this.disposed || id !== this.generation || abort.signal.aborted) return
      const blob = new Blob([new Uint8Array(output.data, 0, output.byteLength)], { type: 'image/gif' })
      const result: CreationResult = { blob, url: this.createUrl(blob), filename: this.nextDownloadName(), metadata: { ...settings, width: output.metrics.width, height: output.metrics.height,
        frameCount: output.metrics.frameCount, bytes: output.byteLength }, metrics: output.metrics }
      const previous = this.state.result
      this.publish({ result, status: 'success', diagnostics: { ...this.state.diagnostics, lastOutputBytes: output.byteLength } })
      if (previous) this.revokeUrl(previous.url)
    } catch (cause) {
      if (this.disposed || id !== this.generation) return
      if (abort.signal.aborted || (cause instanceof EncodeError && cause.code === 'CANCELLED')) this.publish({ status: 'cancelled', error: undefined })
      else this.publish({ status: 'error', error: creationErrorMessage(cause), errorMessage: creationMessage(cause) })
    } finally { if (this.abort === abort) this.abort = undefined }
  }
  async cancel() {
    if (this.disposed || !this.abort) return
    const id = ++this.generation
    this.abort.abort(); this.abort = undefined
    this.publish({ status: 'cancelling', diagnostics: { ...this.state.diagnostics, cancellations: this.state.diagnostics.cancellations + 1 } })
    this.cancellation = this.encoder.cancel()
    await this.cancellation
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
    if (old.result) this.revokeUrl(old.result.url)
    await this.release(old.sources.map(source => source.file))
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal
    this.disposed = true; ++this.generation; this.abort?.abort(); this.abort = undefined
    this.disposal = (async () => {
      await this.encoder.cancel()
      await this.cancellation
      await this.adding
      const old = this.state
      this.state = { ...old, sources: [], result: undefined, totalSourceBytes: 0, status: 'idle' }
      if (old.result) this.revokeUrl(old.result.url)
      await this.release(old.sources.map(source => source.file))
      this.listeners.clear()
    })()
    return this.disposal
  }
}
