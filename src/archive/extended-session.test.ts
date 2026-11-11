import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtendedEntry, ExtendedNativeMetrics } from './extended/protocol'
import { ExtendedArchiveSession } from './extended-session'
import { MediaError } from '../media/errors'
import { extendedArchiveCleanup } from '../media/extended-archive-cleanup'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'

interface MockBackend {
  metrics: { workersCreated: number; workersTerminated: number; activeWorkers: number; wasmInstances: number;
    pendingRequests: number; generation: number; timeouts: number; staleMessages: number; cleanupErrors: number; peakWasmBytes: number }
  commands: { type: string; id?: number; password?: string }[]
  defer: boolean
  nextOutput: number | undefined
  nextFailure: string | undefined
  settle: (() => void) | undefined
  close(): void
}
const testState = vi.hoisted(() => ({ instances: [] as MockBackend[], entries: [] as ExtendedEntry[],
  header: undefined as string | undefined, entrySecrets: new Map<number, string>(), neverOpen: false }))

vi.mock('./extended/backend', async () => {
  const { MediaError } = await import('../media/errors')
  const { trackRuntimeResource } = await import('../media/runtime-diagnostics')
  const native: ExtendedNativeMetrics = { wasmBytes: 16777216, wasmMaximum: 67108864,
    ranges: 0, bytesRead: 0, maxRead: 0, outputBytes: 0, instances: 1, mountedArchives: 1 }
  return { ExtendedBackend: class {
    metrics = { workersCreated: 0, workersTerminated: 0, activeWorkers: 0, wasmInstances: 0,
      pendingRequests: 0, generation: 0, timeouts: 0, staleMessages: 0, cleanupErrors: 0, peakWasmBytes: 0 }
    commands: { type: string; id?: number; password?: string }[] = []
    defer = false
    nextOutput: number | undefined
    nextFailure: string | undefined
    settle: (() => void) | undefined
    private rejectPending: (() => void) | undefined
    private release: (() => void) | undefined
    constructor() { testState.instances.push(this) }
    async open(_source: Blob, password?: string, signal?: AbortSignal) {
      this.close()
      signal?.throwIfAborted()
      this.commands.push({ type: 'open', ...(password === undefined ? {} : { password }) })
      this.metrics.workersCreated++; this.metrics.activeWorkers = 1
      this.release = trackRuntimeResource('worker')
      if (testState.neverOpen) {
        await new Promise<void>((_resolve, reject) => {
          const abort = () => { this.close(); reject(new DOMException('Cancelled', 'AbortError')) }
          signal?.addEventListener('abort', abort, { once: true })
          this.rejectPending = abort
        })
      }
      if (testState.header !== undefined && password !== testState.header) {
        this.close()
        throw new MediaError(password === undefined ? 'ARCHIVE_ENCRYPTED' : 'ARCHIVE_PASSWORD_OR_CORRUPTED')
      }
      this.metrics.wasmInstances = 1; this.metrics.peakWasmBytes = 16777216
      return { entries: testState.entries, metrics: native }
    }
    async extractEntry(id: number, password?: string, signal?: AbortSignal) {
      signal?.throwIfAborted()
      this.commands.push({ type: 'extract', id, ...(password === undefined ? {} : { password }) })
      this.metrics.pendingRequests++
      try {
        return await new Promise<{ data: ArrayBuffer; metrics: ExtendedNativeMetrics }>((resolve, reject) => {
          let finished = false
          const finish = () => {
            if (finished) return
            finished = true
            signal?.removeEventListener('abort', abort)
            this.rejectPending = undefined
            const secret = testState.entrySecrets.get(id)
            if (this.nextFailure) {
              const failure = this.nextFailure; this.nextFailure = undefined
              if (failure === 'ARCHIVE_TIMEOUT') { this.metrics.timeouts++; this.close() }
              reject(new MediaError(failure as 'ARCHIVE_CORRUPTED'))
            } else if (secret !== undefined && password !== secret) {
              reject(new MediaError(password === undefined ? 'ARCHIVE_ENCRYPTED' : 'ARCHIVE_WRONG_PASSWORD'))
            } else {
              const length = this.nextOutput ?? testState.entries[id]?.size ?? 4
              this.nextOutput = undefined
              resolve({ data: new Uint8Array(length).fill(id).buffer, metrics: native })
            }
          }
          const abort = () => {
            if (finished) return
            finished = true
            signal?.removeEventListener('abort', abort)
            this.rejectPending = undefined
            this.close()
            reject(new DOMException('Cancelled', 'AbortError'))
          }
          signal?.addEventListener('abort', abort, { once: true })
          this.rejectPending = abort
          this.settle = finish
          if (!this.defer) queueMicrotask(finish)
        })
      } finally { this.metrics.pendingRequests-- }
    }
    close() {
      if (this.metrics.activeWorkers) {
        this.metrics.workersTerminated++; this.metrics.activeWorkers = 0; this.metrics.wasmInstances = 0
        this.release?.(); this.release = undefined
      }
      const reject = this.rejectPending; this.rejectPending = undefined
      reject?.()
    }
  } }
})

const entry = (id: number, options: Partial<ExtendedEntry> = {}): ExtendedEntry => ({ id,
  path: `${id}.gif`, normalizedPath: `${id}.gif`, isDirectory: false, isFile: true,
  size: 4, packedSize: 4, encrypted: false, solid: false, method: 'COPY',
  attributes: null, dictionaryBytes: null, block: null, special: false, ...options })
const sessions: ExtendedArchiveSession[] = []
const backend = () => testState.instances.at(-1)!
const create = (kind: 4 | 5 | 7 = 7) => {
  const session = ExtendedArchiveSession.create(new File(['archive'], 'public-test.7z'), kind)
  sessions.push(session)
  return session
}
const open = async () => { const session = create(); await session.open(); return session }
const extracts = () => backend().commands.filter(command => command.type === 'extract')

beforeEach(() => {
  testState.instances = []
  testState.entries = Array.from({ length: 5 }, (_, id) => entry(id))
  testState.header = undefined
  testState.entrySecrets = new Map()
  testState.neverOpen = false
})
afterEach(async () => { await Promise.all(sessions.splice(0).map(session => session.close())); vi.restoreAllMocks() })

describe('independent bounded RAR/7z session', () => {
  it('has a retryable prepared opening gate and uses stable IDs rather than filtered ordinals', async () => {
    testState.entries = [entry(0, { normalizedPath: 'notes.txt' }), entry(1), entry(2)]
    testState.header = 'public-header-fixture'
    const session = create(5)
    expect(session.format).toBe('rar')
    await expect(session.open()).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    expect(session.entries).toEqual([])
    await expect(session.open({ password: 'wrong-fixture' })).rejects.toMatchObject({ code: 'ARCHIVE_PASSWORD_OR_CORRUPTED' })
    await session.open({ password: testState.header })
    expect(session.entryForFile(session.files[0]!)?.id).toBe(1)
    expect(session.entryForFile({ name: 'copy', size: 4, source: 'archive', read: async () => new ArrayBuffer(0) })).toBeUndefined()
    expect(extracts()).toHaveLength(0)
    expect(session.metrics.extendedArchiveWorkersCreated).toBe(3)
  })

  it('never fabricates unknown sizes and only materializes the selected media', async () => {
    testState.entries = [entry(0, { size: null }), entry(1), entry(2, { isDirectory: true, isFile: false }),
      entry(3, { special: true, isFile: false }), entry(4, { path: 'notes.txt', normalizedPath: 'notes.txt' })]
    const session = await open()
    expect(session.files).toHaveLength(2)
    expect(() => session.files[0]!.size).toThrow(MediaError)
    await session.ensureEntryAvailable(0)
    expect(session.files[0]!.size).toBe(4)
    expect(extracts()).toHaveLength(1)
    await expect(session.extractEntry(2)).rejects.toMatchObject({ code: 'ARCHIVE_UNSUPPORTED' })
    await expect(session.extractEntry(3)).rejects.toMatchObject({ code: 'ARCHIVE_UNSUPPORTED' })
  })

  it('keeps Unicode and duplicate paths independently selected by native index', async () => {
    testState.entries = [entry(0, { path: '中文_日本語_😀 = :.gif', normalizedPath: '中文_日本語_😀 = :.gif' }),
      entry(1, { path: 'same.gif', normalizedPath: 'same.gif' }), entry(2, { path: 'same.gif', normalizedPath: 'same.gif' })]
    const session = await open()
    expect(session.files[0]!.name).toBe('中文_日本語_😀 = :.gif')
    expect(new Uint8Array(await session.files[1]!.read())[0]).toBe(1)
    expect(new Uint8Array(await session.files[2]!.read())[0]).toBe(2)
    expect(session.metrics).toMatchObject({ currentEntryId: 2, currentExtractedBytes: 4, peakExtractedBytes: 4 })
  })

  it('requires a password before extraction and reuses only the latest verified credential', async () => {
    testState.entries = testState.entries.map(value => ({ ...value, encrypted: value.id > 0 }))
    testState.entrySecrets = new Map([[1, 'alpha-fixture'], [2, 'alpha-fixture'], [3, 'beta-fixture'], [4, 'alpha-fixture']])
    const session = await open()
    await expect(session.ensureEntryAvailable(1)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    expect(extracts()).toHaveLength(0)
    await expect(session.unlockEntry(1, 'wrong-fixture')).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    await session.unlockEntry(1, 'alpha-fixture')
    await session.ensureEntryAvailable(2)
    expect(extracts().at(-1)).toMatchObject({ id: 2, password: 'alpha-fixture' })
    await expect(session.ensureEntryAvailable(3)).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    await expect(session.ensureEntryAvailable(4)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    await session.unlockEntry(3, 'beta-fixture')
    await session.extractEntry(0, { password: 'ignored-fixture' })
    expect(extracts().at(-1)).not.toHaveProperty('password')
    expect(JSON.stringify(session.metrics)).not.toMatch(/alpha|beta|passwordLength|passwordHash/)
    expect(Object.keys(session).some(key => key.toLowerCase().includes('password'))).toBe(false)
  })

  it('does not promote header-only credentials as a verified body password', async () => {
    testState.header = 'header-fixture'
    testState.entries = [entry(0, { encrypted: true }), entry(1, { encrypted: true })]
    testState.entrySecrets = new Map([[0, 'body-fixture'], [1, 'body-fixture']])
    const session = create()
    await session.open({ password: 'header-fixture' })
    await expect(session.ensureEntryAvailable(0)).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    await expect(session.ensureEntryAvailable(1)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    await session.unlockEntry(0, 'body-fixture')
    await session.ensureEntryAvailable(1)
    expect(extracts().at(-1)).toMatchObject({ password: 'body-fixture' })
    backend().defer = true
    const pending = session.ensureEntryAvailable(0)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(extracts()).toHaveLength(4))
    await session.releaseEntry(0); await rejected
    expect(backend().commands.filter(command => command.type === 'open').at(-1)).toMatchObject({ password: 'header-fixture' })
    backend().defer = false
    await session.ensureEntryAvailable(1)
    expect(extracts().at(-1)).toMatchObject({ password: 'body-fixture' })
  })

  it('drops previous credentials on a fresh session and rejects unsafe aggregate metadata without a live Worker', async () => {
    testState.entries = [entry(0, { encrypted: true })]
    testState.entrySecrets = new Map([[0, 'alpha-fixture']])
    const first = await open()
    await first.unlockEntry(0, 'alpha-fixture')
    await first.close()
    const second = await open()
    await expect(second.ensureEntryAvailable(0)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    await second.close()
    testState.entries = [entry(0, { size: Number.MAX_SAFE_INTEGER }), entry(1)]
    const malformed = create()
    await expect(malformed.open()).rejects.toMatchObject({ code: 'ARCHIVE_LIMIT_EXCEEDED' })
    expect(malformed.entries).toEqual([])
    expect(backend().metrics.activeWorkers).toBe(0)
  })

  it('authenticates unknown encryption through the backend and does not cache failed or partial outputs', async () => {
    testState.entries = [entry(0, { encrypted: null }), entry(1, { encrypted: true })]
    testState.entrySecrets = new Map([[0, 'alpha-fixture'], [1, 'alpha-fixture']])
    const session = await open()
    await expect(session.ensureEntryAvailable(0)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    backend().nextOutput = 3
    await expect(session.unlockEntry(0, 'alpha-fixture')).rejects.toMatchObject({ code: 'ARCHIVE_CORRUPTED' })
    expect(session.metrics.currentExtractedBytes).toBe(0)
    await expect(session.ensureEntryAvailable(1)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    backend().nextOutput = 4 * 1024 ** 2 + 1
    await expect(session.unlockEntry(0, 'alpha-fixture')).rejects.toBeDefined()
    expect(session.metrics.currentExtractedBytes).toBe(0)
  })

  it('borrows the same VirtualFile for conversion and returns independent range buffers after release', async () => {
    const session = await open(), file = session.files[0]!
    const a = await file.read(), b = await file.read(0, 2)
    structuredClone(a, { transfer: [a] })
    expect(a.byteLength).toBe(0)
    expect(b.byteLength).toBe(2)
    expect(extracts()).toHaveLength(1)
    await file.release()
    expect(session.metrics.currentExtractedBytes).toBe(0)
    expect((await file.read()).byteLength).toBe(4)
    expect(extracts()).toHaveLength(2)
  })

  it('terminates cancelled work, automatically restores the listing, and retries without file selection', async () => {
    const session = await open(), controller = new AbortController()
    const files = session.files
    backend().defer = true
    const first = session.extractEntry(0, { signal: controller.signal })
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(extracts()).toHaveLength(1))
    controller.abort()
    await rejected
    expect(backend().metrics).toMatchObject({ workersCreated: 2, workersTerminated: 1, activeWorkers: 1 })
    expect(session.files).toBe(files)
    backend().defer = false
    await session.ensureEntryAvailable(1)
    expect(session.metrics.currentEntryId).toBe(1)
  })

  it('reopens encrypted headers after cancelled body extraction using only that session credential', async () => {
    testState.header = 'header-fixture'
    testState.entries = [entry(0, { encrypted: true }), entry(1, { encrypted: true })]
    testState.entrySecrets = new Map([[0, 'header-fixture'], [1, 'header-fixture']])
    const session = create()
    await session.open({ password: 'header-fixture' })
    await session.ensureEntryAvailable(0)
    backend().defer = true
    const pending = session.ensureEntryAvailable(1)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(extracts()).toHaveLength(2))
    await session.releaseEntry(1); await rejected
    expect(backend().commands.filter(command => command.type === 'open').at(-1)).toMatchObject({ password: 'header-fixture' })
    backend().defer = false
    await session.ensureEntryAvailable(1)
  })

  it('reports a timeout honestly, restores access, and retries a later selection', async () => {
    const session = await open()
    backend().nextFailure = 'ARCHIVE_TIMEOUT'
    await expect(session.ensureEntryAvailable(0)).rejects.toMatchObject({ code: 'ARCHIVE_TIMEOUT' })
    expect(session.metrics.extendedArchiveTimeouts).toBe(1)
    expect(backend().metrics.workersCreated).toBe(2)
    await session.ensureEntryAvailable(1)
  })

  it('does not publish late results or credentials after Close and clears all owned resources', async () => {
    const before = runtimeDiagnostics.getSnapshot()
    const session = await open()
    backend().defer = true
    const pending = session.ensureEntryAvailable(0)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(extracts()).toHaveLength(1))
    const close = session.close()
    expect(session.close()).toBe(close)
    await close; await rejected
    backend().settle?.()
    expect(session.entries).toEqual([])
    expect(session.files).toEqual([])
    expect(extendedArchiveCleanup.getSnapshot()).toMatchObject({ activeExtendedArchiveWorkers: 0,
      activeWasmInstances: 0, activeArchiveSessions: 0, activeExtraction: 0, pendingAccess: 0,
      currentExtractedBytes: 0, activeObjectUrls: 0, cleanupErrors: 0 })
    expect(runtimeDiagnostics.getSnapshot().activeWorkers).toBe(before.activeWorkers)
    expect(runtimeDiagnostics.getSnapshot().activeArchiveSessions).toBe(before.activeArchiveSessions)
    await expect(session.open()).rejects.toMatchObject({ code: 'ARCHIVE_CLOSED' })
  })

  it('closes while opening without publishing a late listing', async () => {
    testState.neverOpen = true
    const session = create()
    const opening = session.open(), rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(backend().commands).toHaveLength(1))
    await session.close(); await rejected
    expect(session.entries).toEqual([])
    expect(backend().metrics.activeWorkers).toBe(0)
  })

  it('is bounded to one selected Blob across repeated open/switch/close sessions', async () => {
    const before = runtimeDiagnostics.getSnapshot()
    for (let cycle = 0; cycle < 10; cycle++) {
      const session = await open()
      for (const file of session.files) {
        await file.read()
        expect(session.metrics.currentExtractedBytes).toBe(4)
        expect(session.metrics.peakExtractedBytes).toBe(4)
      }
      await session.close()
    }
    expect(runtimeDiagnostics.getSnapshot().activeWorkers).toBe(before.activeWorkers)
    expect(runtimeDiagnostics.getSnapshot().activeArchiveSessions).toBe(before.activeArchiveSessions)
  })

  it('handles rapid replacements while retaining only the newest selection', async () => {
    const session = await open()
    const results = await Promise.allSettled(session.files.map(file => file.read()))
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(4)
    expect(results.at(-1)?.status).toBe('fulfilled')
    expect(session.metrics).toMatchObject({ currentEntryId: 4, currentExtractedBytes: 4 })
  })
})
