import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'
import { countRuntimeEvent, trackRuntimeResource } from '../media/runtime-diagnostics'
import { recordExtendedArchiveCleanup } from '../media/extended-archive-cleanup'
import { isArchiveMediaCandidate } from './archive-policy'
import type { ArchiveSourceEntry, ArchiveSourceMetrics, ArchiveSourceSession } from './archive-source-session'
import { ExtendedArchiveEntryVirtualFile } from './extended-entry-virtual-file'
import { ExtendedBackend } from './extended/backend'
import { assertActualOutput, assertExtendedInput } from './extended/policy'
import type { ExtendedEntry, ExtendedNativeMetrics } from './extended/protocol'

interface SessionEntry extends ArchiveSourceEntry { readonly native: ExtendedEntry }
export interface ExtendedArchiveMetrics extends ArchiveSourceMetrics {
  readonly extendedArchiveWorkersCreated: number
  readonly extendedArchiveWorkersTerminated: number
  readonly extendedArchiveWorkersActive: number
  readonly extendedArchiveWasmInstances: number
  readonly extendedArchiveOpen: number
  readonly extendedArchiveExtraction: number
  readonly extendedArchiveGeneration: number
  readonly extendedArchiveTimeouts: number
  readonly extendedArchiveCleanupErrors: number
  readonly wasmMemoryBytes: number
  readonly peakWasmBytes: number
  readonly inputBytes: number
}

let sessionIdentity = 0
const cancelled = () => new DOMException('Cancelled', 'AbortError')
const passwordFailure = (cause: unknown) => cause instanceof MediaError
  && ['ARCHIVE_ENCRYPTED', 'ARCHIVE_WRONG_PASSWORD', 'ARCHIVE_PASSWORD_OR_CORRUPTED'].includes(cause.code)

/** RAR/7z ownership is independent of the accepted ZIP session and password state. */
export class ExtendedArchiveSession implements ArchiveSourceSession {
  readonly id = `extended-archive-${++sessionIdentity}`
  readonly name: string
  readonly format: 'rar' | '7z'
  private readonly backend = new ExtendedBackend()
  private readonly inputBytes: number
  private entryList: readonly SessionEntry[] = []
  private fileList: readonly ExtendedArchiveEntryVirtualFile[] = []
  private closed = false
  private listed = false
  private generation = 0
  private sessionGeneration = 0
  private opening: { controller: AbortController; promise: Promise<void> } | undefined
  private recovery: Promise<void> | undefined
  private closing: Promise<void> | undefined
  private releaseArchive: (() => void) | undefined
  private cached: { entryId: number; blob: Blob } | undefined
  private active: { entryId: number; controller: AbortController; promise: Promise<Blob> } | undefined
  private readonly accessTasks = new Set<Promise<void>>()
  #source: File | undefined
  // A header-opening credential is retained only to reopen this archive; body
  // authentication, not merely a readable directory, promotes the recent value.
  #headerPassword: string | undefined
  #headerBodyCandidateAllowed = false
  #recentSuccessfulPassword: string | undefined
  private counters: ArchiveSourceMetrics = {
    entryCount: 0, mediaCount: 0, totalDeclaredBytes: 0, extractions: 0,
    metadataMs: 0, extractMs: 0, currentEntryId: null, currentExtractedBytes: 0,
    peakExtractedBytes: 0, pendingReads: 0, pendingPasswordAccess: 0,
  }
  private nativeMetrics: ExtendedNativeMetrics | undefined
  private opens = 0

  private constructor(file: File, kind: 4 | 5 | 7) {
    assertExtendedInput(file.size)
    this.#source = file
    this.name = file.name
    this.inputBytes = file.size
    this.format = kind === 7 ? '7z' : 'rar'
  }

  static create(file: File, kind: 4 | 5 | 7 = 7): ExtendedArchiveSession {
    return new ExtendedArchiveSession(file, kind)
  }

  /** A header-password failure leaves this prepared session available for retry. */
  open(options: { password?: string; signal?: AbortSignal } = {}): Promise<void> {
    if (this.closed) return Promise.reject(new MediaError('ARCHIVE_CLOSED'))
    if (options.signal?.aborted) return Promise.reject(cancelled())
    this.opening?.controller.abort()
    this.active?.controller.abort()
    const previous = this.opening?.promise, previousExtraction = this.active?.promise
    const generation = ++this.sessionGeneration
    ++this.generation
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    this.cached = undefined
    this.#headerPassword = this.#recentSuccessfulPassword = undefined
    this.#headerBodyCandidateAllowed = false
    this.listed = false
    this.entryList = []
    this.fileList = []
    this.releaseArchive?.()
    this.releaseArchive = undefined
    let password = options.password
    const promise = (async () => {
      try {
        await previous?.catch(() => undefined)
        await previousExtraction?.catch(() => undefined)
        controller.signal.throwIfAborted()
        if (this.closed || generation !== this.sessionGeneration || !this.#source) throw cancelled()
        const started = performance.now()
        const result = await this.backend.open(this.#source, password, controller.signal)
        controller.signal.throwIfAborted()
        if (this.closed || generation !== this.sessionGeneration) throw cancelled()
        this.publishEntries(result.entries)
        this.nativeMetrics = result.metrics
        this.#headerPassword = password
        this.#headerBodyCandidateAllowed = password !== undefined
        this.#recentSuccessfulPassword = undefined
        this.listed = true
        this.opens++
        this.counters = { ...this.counters, metadataMs: performance.now() - started }
        this.releaseArchive ??= trackRuntimeResource('archive')
      } catch (cause) {
        if (generation === this.sessionGeneration) {
          this.backend.close()
          this.entryList = []
          this.fileList = []
        }
        throw cause
      } finally {
        password = undefined
        options.signal?.removeEventListener('abort', abort)
        if (this.opening?.controller === controller) this.opening = undefined
      }
    })()
    this.opening = { controller, promise }
    return promise
  }

  get entries(): readonly ArchiveSourceEntry[] { return this.entryList }
  get files(): readonly ExtendedArchiveEntryVirtualFile[] { return this.fileList }
  get metrics(): ExtendedArchiveMetrics {
    const backend = this.backend.metrics
    return {
      ...this.counters,
      pendingReads: this.active ? 1 : 0,
      pendingPasswordAccess: this.accessTasks.size,
      extendedArchiveWorkersCreated: backend.workersCreated,
      extendedArchiveWorkersTerminated: backend.workersTerminated,
      extendedArchiveWorkersActive: backend.activeWorkers,
      extendedArchiveWasmInstances: backend.wasmInstances,
      extendedArchiveOpen: this.opens,
      extendedArchiveExtraction: this.active ? 1 : 0,
      extendedArchiveGeneration: this.generation,
      extendedArchiveTimeouts: backend.timeouts,
      extendedArchiveCleanupErrors: backend.cleanupErrors,
      wasmMemoryBytes: backend.wasmInstances ? this.nativeMetrics?.wasmBytes ?? 0 : 0,
      peakWasmBytes: backend.peakWasmBytes,
      inputBytes: this.inputBytes,
    }
  }

  entryForFile(file: VirtualFile): ArchiveSourceEntry | undefined {
    const owned = this.fileList.find(candidate => candidate === file)
    return owned ? this.entryList.find(entry => entry.id === owned.entryId) : undefined
  }

  ensureEntryAvailable(id: number, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.accessEntry(id, options)
  }

  unlockEntry(id: number, password: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.accessEntry(id, { ...options, password })
  }

  private accessEntry(id: number, options: { password?: string; signal?: AbortSignal }): Promise<void> {
    const task = this.extractEntry(id, options).then(() => {})
    this.accessTasks.add(task)
    void task.finally(() => {
      this.accessTasks.delete(task)
      if (this.closed) this.recordCleanup()
    }).catch(() => {})
    return task
  }

  extractEntry(id: number, options: { password?: string; signal?: AbortSignal } = {}): Promise<Blob> {
    if (this.closed || !this.listed) return Promise.reject(new MediaError('ARCHIVE_CLOSED'))
    if (options.signal?.aborted) return Promise.reject(cancelled())
    const entry = this.entryList.find(candidate => candidate.id === id)
    if (!entry?.native.isFile || entry.directory || !entry.mediaCandidate) return Promise.reject(new MediaError('ARCHIVE_UNSUPPORTED'))
    const explicit = entry.encrypted !== false && options.password !== undefined
    if (!explicit && this.cached?.entryId === id) return Promise.resolve(this.cached.blob)
    if (!explicit && this.active?.entryId === id && !this.active.controller.signal.aborted) return this.active.promise
    let password = entry.encrypted === false ? undefined
      : options.password ?? this.#recentSuccessfulPassword ?? (this.#headerBodyCandidateAllowed ? this.#headerPassword : undefined)
    if (entry.encrypted === true && password === undefined) return Promise.reject(new MediaError('ARCHIVE_ENCRYPTED'))

    const previous = this.active
    previous?.controller.abort()
    this.cached = undefined
    const generation = ++this.generation
    const sessionGeneration = this.sessionGeneration
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    this.counters = { ...this.counters, currentEntryId: id, currentExtractedBytes: 0 }
    const promise = (async () => {
      try {
        await previous?.promise.catch(() => undefined)
        await this.recovery
        controller.signal.throwIfAborted()
        if (this.closed || generation !== this.generation) throw cancelled()
        await this.ensureBackend(controller.signal)
        controller.signal.throwIfAborted()
        countRuntimeEvent('entryExtractionsStarted')
        const started = performance.now()
        const result = await this.backend.extractEntry(id, password, controller.signal)
        if (controller.signal.aborted || this.closed || generation !== this.generation) {
          countRuntimeEvent('entryExtractionsDiscarded')
          countRuntimeEvent('staleResultsDiscarded')
          throw cancelled()
        }
        assertActualOutput(result.data.byteLength)
        if (entry.native.size !== null && result.data.byteLength !== entry.native.size) throw new MediaError('ARCHIVE_CORRUPTED')
        const blob = new Blob([result.data])
        this.cached = { entryId: id, blob }
        this.nativeMetrics = result.metrics
        if (entry.encrypted !== false && password !== undefined) this.#recentSuccessfulPassword = password
        this.fileList.find(file => file.entryId === id)?.acceptVerifiedSize(blob.size)
        this.counters = { ...this.counters, extractions: this.counters.extractions + 1,
          extractMs: performance.now() - started, currentEntryId: id, currentExtractedBytes: blob.size,
          peakExtractedBytes: Math.max(this.counters.peakExtractedBytes, blob.size) }
        countRuntimeEvent('entryExtractionsCompleted')
        return blob
      } catch (cause) {
        if (generation === this.generation) {
          this.cached = undefined
          this.counters = { ...this.counters, currentExtractedBytes: 0 }
          if (passwordFailure(cause) || cause instanceof MediaError && cause.code === 'ARCHIVE_CORRUPTED') {
            this.#recentSuccessfulPassword = undefined
            // Header input is solely a reopen credential after a failed body
            // attempt; it must not silently repeat that rejected body password.
            if (password === this.#headerPassword && entry.encrypted !== false) this.#headerBodyCandidateAllowed = false
          }
        }
        if (!this.closed && this.backend.metrics.activeWorkers === 0) {
          await this.restoreAfterInterruption(sessionGeneration)
        }
        throw cause
      } finally {
        password = undefined
        options.signal?.removeEventListener('abort', abort)
        if (this.active?.controller === controller) this.active = undefined
        if (this.closed) this.recordCleanup()
      }
    })()
    this.active = { entryId: id, controller, promise }
    return promise
  }

  async releaseEntry(id: number): Promise<void> {
    if (this.cached?.entryId === id) this.cached = undefined
    const active = this.active?.entryId === id ? this.active : undefined
    if (active) { ++this.generation; active.controller.abort() }
    if (this.counters.currentEntryId === id) this.counters = { ...this.counters, currentEntryId: null, currentExtractedBytes: 0 }
    await active?.promise.catch(() => undefined)
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    ++this.sessionGeneration
    ++this.generation
    this.#headerPassword = this.#recentSuccessfulPassword = undefined
    this.#headerBodyCandidateAllowed = false
    this.#source = undefined
    this.cached = undefined
    this.listed = false
    const active = this.active, opening = this.opening
    active?.controller.abort()
    opening?.controller.abort()
    this.backend.close()
    this.releaseArchive?.()
    this.releaseArchive = undefined
    this.entryList = []
    this.fileList = []
    this.counters = { ...this.counters, currentEntryId: null, currentExtractedBytes: 0 }
    this.closing = (async () => {
      await Promise.allSettled([active?.promise, opening?.promise, this.recovery, ...this.accessTasks])
      this.recordCleanup()
    })()
    return this.closing
  }

  private publishEntries(entries: readonly ExtendedEntry[]): void {
    this.entryList = Object.freeze(entries.map(native => Object.freeze({ id: native.id, path: native.normalizedPath,
      directory: native.isDirectory, encrypted: native.encrypted,
      mediaCandidate: native.isFile && !native.special && isArchiveMediaCandidate(native.normalizedPath, native.isDirectory), native })))
    this.fileList = Object.freeze(this.entryList.filter(entry => entry.mediaCandidate).map(entry => new ExtendedArchiveEntryVirtualFile(this, {
      id: entry.id, path: entry.path, size: entry.native.size,
    })))
    // This is the sum of known declarations, never an allocation promise. Reject
    // an unsafe aggregate rather than silently round hostile huge declarations.
    const totalDeclaredBytes = entries.reduce((total, entry) => {
      if ((entry.size ?? 0) > Number.MAX_SAFE_INTEGER - total) throw new MediaError('ARCHIVE_LIMIT_EXCEEDED')
      return total + (entry.size ?? 0)
    }, 0)
    this.counters = { ...this.counters, entryCount: this.entryList.length, mediaCount: this.fileList.length, totalDeclaredBytes }
  }

  private async ensureBackend(signal?: AbortSignal): Promise<void> {
    if (this.backend.metrics.activeWorkers) return
    if (!this.#source || this.closed) throw new MediaError('ARCHIVE_CLOSED')
    const result = await this.backend.open(this.#source, this.#headerPassword, signal)
    if (this.closed) throw new MediaError('ARCHIVE_CLOSED')
    this.assertSameListing(result.entries)
    this.nativeMetrics = result.metrics
    this.opens++
  }

  private restoreAfterInterruption(sessionGeneration: number): Promise<void> {
    if (this.recovery) return this.recovery
    const recovery = Promise.resolve().then(async () => {
      try {
        if (!this.closed && sessionGeneration === this.sessionGeneration) await this.ensureBackend()
      } catch {
        // The caller still receives the original cancellation/timeout. A later
        // explicit retry can reopen; never replace it with "backend crashed".
      }
    }).finally(() => { if (this.recovery === recovery) this.recovery = undefined })
    this.recovery = recovery
    return recovery
  }

  private assertSameListing(entries: readonly ExtendedEntry[]): void {
    if (entries.length !== this.entryList.length || entries.some((native, index) => {
      const previous = this.entryList[index]?.native
      return !previous || native.id !== previous.id || native.normalizedPath !== previous.normalizedPath
        || native.isDirectory !== previous.isDirectory || native.isFile !== previous.isFile || native.size !== previous.size
    })) {
      this.backend.close()
      throw new MediaError('ARCHIVE_CORRUPTED')
    }
  }

  private recordCleanup(): void {
    const metrics = this.backend.metrics
    recordExtendedArchiveCleanup({ extendedArchiveWorkersCreated: metrics.workersCreated,
      extendedArchiveWorkersTerminated: metrics.workersTerminated,
      activeExtendedArchiveWorkers: metrics.activeWorkers, activeWasmInstances: metrics.wasmInstances,
      activeArchiveSessions: this.releaseArchive ? 1 : 0, activeExtraction: this.active ? 1 : 0,
      pendingAccess: this.accessTasks.size + metrics.pendingRequests,
      currentExtractedBytes: this.cached?.blob.size ?? 0, activeObjectUrls: 0,
      cleanupErrors: metrics.cleanupErrors, peakWasmBytes: metrics.peakWasmBytes, timeouts: metrics.timeouts })
  }
}
