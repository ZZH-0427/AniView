import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArchiveSession } from './archive-session'
import { createArchiveEntryMetadata } from './archive-policy'
import type { ArchiveEntryMetadata } from './archive-policy'
import type { ArchiveRequest, ArchiveResponse } from './archive-worker-protocol'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'

const entries = Array.from({ length: 10 }, (_, id) => createArchiveEntryMetadata({ name: `${id}.gif`, directory: false,
  compressedSize: 4, uncompressedSize: 4, encrypted: false, compressionMethod: 0 }, id))
const metrics = { entryCount: 10, mediaCount: 10, totalDeclaredBytes: 40, extractions: 0, metadataMs: 3, extractMs: 1 }
let readyEntries: readonly ArchiveEntryMetadata[] = entries
class TestWorker {
  static instances: TestWorker[] = []
  static autoOpen = true
  readonly commands: ArchiveRequest[] = []
  onmessage: ((event: MessageEvent<ArchiveResponse | null>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  autoExtract = true
  constructor() { TestWorker.instances.push(this) }
  send(response: ArchiveResponse) { this.onmessage?.({ data: response } as MessageEvent<ArchiveResponse>) }
  postMessage(command: ArchiveRequest) {
    this.commands.push(command)
    queueMicrotask(() => {
      if (command.type === 'open' && TestWorker.autoOpen) this.send({ id: command.id, type: 'ready', entries: readyEntries, metrics })
      if (command.type === 'close') this.send({ id: command.id, type: 'closed' })
      if (command.type === 'cancel') this.send({ id: command.target, type: 'error', code: 'ARCHIVE_CLOSED', aborted: true })
      if (command.type === 'extract' && this.autoExtract) this.finish(command.id, command.entryId)
    })
  }
  finish(id: number, entryId: number) {
    const extractions = this.commands.filter(command => command.type === 'extract').length
    this.send({ id, type: 'extracted', blob: new Blob([new Uint8Array([entryId, 1, 2, 3])]), metrics: { ...metrics, extractions } })
  }
}
const file = () => new File(['zip'], 'test.zip')
const worker = () => TestWorker.instances.at(-1)!
beforeEach(() => { readyEntries = entries; TestWorker.instances = []; TestWorker.autoOpen = true; vi.stubGlobal('Worker', TestWorker) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('archive session cache and VirtualFile ownership', () => {
  it('opens metadata with zero full extractions and exposes ordered VirtualFiles', async () => {
    const session = await ArchiveSession.open(file())
    expect(session.files.map(file => file.name)).toEqual(entries.map(entry => entry.path))
    expect(session.files[4]).toMatchObject({ source: 'archive', entryPath: '4.gif', archiveId: session.id, size: 4, entryId: 4 })
    expect(worker().commands.map(command => command.type)).toEqual(['open'])
    expect(session.metrics).toMatchObject({ extractions: 0, currentExtractedBytes: 0 })
    await session.files[4]!.read()
    expect(worker().commands.filter(command => command.type === 'extract')).toEqual([expect.objectContaining({ entryId: 4 })])
    expect(session.metrics).toMatchObject({ extractions: 1, currentExtractedBytes: 4, peakExtractedBytes: 4 })
    await session.close()
  })

  it('shares only the current Blob and returns fresh buffers after decoder transfer', async () => {
    const session = await ArchiveSession.open(file())
    const entry = session.files[4]!
    const first = await entry.read()
    structuredClone(first, { transfer: [first] })
    expect(first.byteLength).toBe(0)
    const second = await entry.read()
    expect([...new Uint8Array(second)]).toEqual([4, 1, 2, 3])
    expect([...new Uint8Array(await entry.read(1, 3))]).toEqual([1, 2])
    expect(session.metrics.extractions).toBe(1)
    await entry.release()
    expect(session.metrics.currentExtractedBytes).toBe(0)
    await entry.read()
    expect(session.metrics.extractions).toBe(2)
    await session.close()
  })

  it('re-extracts A after A → B → A while retaining at most one Blob', async () => {
    const session = await ArchiveSession.open(file())
    for (const id of [0, 1, 0]) {
      await session.files[id]!.read()
      expect(session.metrics).toMatchObject({ currentEntryId: id, currentExtractedBytes: 4, peakExtractedBytes: 4 })
    }
    expect(session.metrics.extractions).toBe(3)
    await session.close()
  })

  it('coalesces concurrent detector and decoder reads for the current entry', async () => {
    const session = await ArchiveSession.open(file())
    const [first, second] = await Promise.all([session.files[3]!.read(0, 2), session.files[3]!.read()])
    expect(first.byteLength).toBe(2)
    expect(second.byteLength).toBe(4)
    expect(session.metrics.extractions).toBe(1)
    await session.close()
  })

  it('keeps directories/hidden metadata out of files and blocks encrypted reads before extraction', async () => {
    readyEntries = entries.map((entry, id) => ({ ...entry, directory: id === 0, mediaCandidate: id > 1,
      encrypted: id === 2, access: id === 2 ? 'ENCRYPTED' : 'AVAILABLE' }))
    const session = await ArchiveSession.open(file())
    expect(session.files[0]?.entryId).toBe(2)
    await expect(session.files[0]!.read()).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    expect(worker().commands.some(command => command.type === 'extract')).toBe(false)
    await session.close()
  })
})

describe('archive cancellation and lifecycle', () => {
  it('releases a pending extraction, ignores its late Blob and allows the next entry', async () => {
    const session = await ArchiveSession.open(file())
    worker().autoExtract = false
    const read = session.files[0]!.read()
    const failure = expect(read).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(worker().commands.some(command => command.type === 'extract')).toBe(true))
    const command = worker().commands.find(command => command.type === 'extract')!
    await session.files[0]!.release()
    await failure
    if (command.type !== 'extract') throw new Error('Expected extraction request')
    worker().finish(command.id, 0)
    expect(session.metrics.currentExtractedBytes).toBe(0)
    worker().autoExtract = true
    await session.files[1]!.read()
    expect(session.metrics.currentEntryId).toBe(1)
    await session.close()
  })

  it('serializes rapid entry replacements and rejects obsolete reads', async () => {
    const session = await ArchiveSession.open(file())
    const first = session.files[0]!.read()
    const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const second = session.files[1]!.read()
    const secondRejected = expect(second).rejects.toMatchObject({ name: 'AbortError' })
    const final = session.files[2]!.read()
    await Promise.all([firstRejected, secondRejected, final])
    expect(session.metrics).toMatchObject({ currentEntryId: 2, currentExtractedBytes: 4, extractions: 1 })
    await session.close()
  })

  it('close cancels pending data, releases cache and terminates exactly once', async () => {
    const session = await ArchiveSession.open(file())
    const entry = session.files[0]!
    worker().autoExtract = false
    const read = entry.read()
    const failure = expect(read).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(worker().commands.some(command => command.type === 'extract')).toBe(true))
    const firstClose = session.close()
    expect(session.close()).toBe(firstClose)
    await firstClose; await failure
    expect(worker().terminate).toHaveBeenCalledOnce()
    expect(session.metrics.currentExtractedBytes).toBe(0)
    expect(session.files).toEqual([])
    await expect(entry.read()).rejects.toMatchObject({ code: 'ARCHIVE_CLOSED' })
    await entry.release()
  })

  it('supports external abort and rejects already aborted opens before allocating a Worker', async () => {
    const abort = new AbortController(); abort.abort()
    await expect(ArchiveSession.open(file(), { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(TestWorker.instances).toHaveLength(0)
    const session = await ArchiveSession.open(file())
    worker().autoExtract = false
    const controller = new AbortController()
    const read = session.extractEntry(0, { signal: controller.signal })
    const failure = expect(read).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(worker().commands.some(command => command.type === 'extract')).toBe(true))
    controller.abort()
    await failure
    await session.close()
  })

  it('fails safely on a Worker error and releases retained content', async () => {
    const session = await ArchiveSession.open(file())
    await session.files[0]!.read()
    worker().onerror?.({ preventDefault() {} } as ErrorEvent)
    expect(session.metrics.currentExtractedBytes).toBe(0)
    await expect(session.extractEntry(0)).rejects.toMatchObject({ code: 'ARCHIVE_CLOSED' })
    await session.close()
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it('terminates a nonresponsive Worker within the close deadline', async () => {
    const session = await ArchiveSession.open(file())
    vi.useFakeTimers()
    worker().postMessage = command => { worker().commands.push(command) }
    const closing = session.close()
    await vi.advanceTimersByTimeAsync(2000)
    await closing
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it('closes a just-created Worker if an opening signal is aborted', async () => {
    const controller = new AbortController()
    const opening = ArchiveSession.open(file(), { signal: controller.signal })
    controller.abort()
    await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker().terminate).toHaveBeenCalledOnce()
    expect(worker().commands.some(command => command.type === 'close')).toBe(true)
  })

  it.each(['onerror', 'onmessageerror'] as const)('rejects in-flight extraction on %s and permits a fresh archive', async event => {
    const session = await ArchiveSession.open(file())
    const entry = session.files[0]!
    const failedWorker = worker()
    failedWorker.autoExtract = false
    const read = entry.read()
    const failure = expect(read).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    await vi.waitFor(() => expect(failedWorker.commands.some(command => command.type === 'extract')).toBe(true))
    if (event === 'onerror') failedWorker.onerror?.({ preventDefault() {} } as ErrorEvent)
    else failedWorker.onmessageerror?.()
    await failure
    expect(session.metrics.currentExtractedBytes).toBe(0)
    expect(session.entries).toEqual([])
    expect(session.files).toEqual([])
    await session.close()
    expect(failedWorker.terminate).toHaveBeenCalledOnce()
    const fresh = await ArchiveSession.open(file())
    expect(new Uint8Array(await fresh.files[1]!.read())[0]).toBe(1)
    expect(fresh.id).not.toBe(session.id)
    await fresh.close()
  })

  it('rejects a failed request postMessage immediately without retaining a Worker', async () => {
    const post = vi.spyOn(TestWorker.prototype, 'postMessage').mockImplementationOnce(() => { throw new DOMException('Clone failed', 'DataCloneError') })
    await expect(ArchiveSession.open(file())).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    expect(worker().terminate).toHaveBeenCalledOnce()
    post.mockRestore()
    const fresh = await ArchiveSession.open(file())
    await fresh.files[0]!.read()
    await fresh.close()
  })

  it('contains a failed cancellation postMessage and immediately rejects the pending read', async () => {
    const session = await ArchiveSession.open(file())
    const failedWorker = worker()
    failedWorker.autoExtract = false
    const controller = new AbortController()
    const read = session.extractEntry(0, { signal: controller.signal })
    const failure = expect(read).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    await vi.waitFor(() => expect(failedWorker.commands.some(command => command.type === 'extract')).toBe(true))
    vi.spyOn(failedWorker, 'postMessage').mockImplementation(() => { throw new DOMException('Transport stopped', 'DataCloneError') })
    expect(() => controller.abort()).not.toThrow()
    await failure
    expect(failedWorker.terminate).toHaveBeenCalledOnce()
    await session.close()
  })

  it('times out an unexpectedly silent Worker and recovers by reopening without a page reload', async () => {
    const session = await ArchiveSession.open(file())
    worker().autoExtract = false
    vi.useFakeTimers()
    const read = session.files[0]!.read()
    const failure = expect(read).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    await vi.advanceTimersByTimeAsync(30_000)
    await failure
    expect(worker().terminate).toHaveBeenCalledOnce()
    await session.close()
    const fresh = await ArchiveSession.open(file())
    expect((await fresh.files[0]!.read()).byteLength).toBe(4)
    await fresh.close()
  })

  it('does not revive an opening session when ready is immediately followed by Worker failure', async () => {
    TestWorker.autoOpen = false
    const opening = ArchiveSession.open(file())
    const failure = expect(opening).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    const command = worker().commands.find(command => command.type === 'open')!
    if (command.type !== 'open') throw new Error('Expected open')
    worker().send({ id: command.id, type: 'ready', entries, metrics })
    worker().onmessageerror?.()
    await failure
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it('discards delayed metadata after abort and does not expose a closed archive', async () => {
    TestWorker.autoOpen = false
    const controller = new AbortController()
    const opening = ArchiveSession.open(file(), { signal: controller.signal })
    const failure = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    const failedWorker = worker()
    const command = failedWorker.commands.find(command => command.type === 'open')!
    controller.abort()
    await failure
    if (command.type !== 'open') throw new Error('Expected open')
    failedWorker.send({ id: command.id, type: 'ready', entries, metrics })
    expect(failedWorker.terminate).toHaveBeenCalledOnce()
    TestWorker.autoOpen = true
    const fresh = await ArchiveSession.open(file())
    await fresh.files[0]!.read()
    await fresh.close()
  })

  it('releases an accepted but not yet committed Blob if close wins the continuation race', async () => {
    const session = await ArchiveSession.open(file())
    const entry = session.files[0]!
    worker().autoExtract = false
    const read = entry.read()
    const failure = expect(read).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(worker().commands.some(command => command.type === 'extract')).toBe(true))
    const command = worker().commands.find(command => command.type === 'extract')!
    if (command.type !== 'extract') throw new Error('Expected extract')
    worker().finish(command.id, 0)
    await session.close()
    await failure
    expect(session.metrics).toMatchObject({ currentEntryId: null, currentExtractedBytes: 0 })
  })

  it('keeps 100 visited entries bounded to the current Blob and cancels 100 rapid replacements', async () => {
    readyEntries = Array.from({ length: 100 }, (_, id) => createArchiveEntryMetadata({ name: `nested/${id}.gif`,
      directory: false, compressedSize: 4, uncompressedSize: 4, encrypted: false, compressionMethod: 0 }, id))
    const session = await ArchiveSession.open(file())
    for (const entry of session.files) {
      expect(new Uint8Array(await entry.read())[0]).toBe(entry.entryId)
      expect(session.metrics).toMatchObject({ currentEntryId: entry.entryId, currentExtractedBytes: 4, peakExtractedBytes: 4 })
    }
    const results = await Promise.allSettled(session.files.map(entry => entry.read()))
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(99)
    expect(results.at(-1)?.status).toBe('fulfilled')
    expect(session.metrics).toMatchObject({ currentEntryId: 99, currentExtractedBytes: 4, peakExtractedBytes: 4 })
    await session.close()
    expect(worker().terminate).toHaveBeenCalledOnce()
  })

  it('does not coalesce a reopened entry with its already cancelled extraction', async () => {
    const session = await ArchiveSession.open(file())
    const entry = session.files[0]!
    worker().autoExtract = false
    const oldRead = entry.read()
    const failure = expect(oldRead).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(worker().commands.some(command => command.type === 'extract')).toBe(true))
    const releasing = entry.release()
    worker().autoExtract = true
    const newRead = entry.read()
    await Promise.all([releasing, failure])
    expect((await newRead).byteLength).toBe(4)
    expect(session.metrics.currentEntryId).toBe(0)
    await session.close()
  })

  it('treats an invalid Worker message as transport failure rather than an uncaught exception', async () => {
    const session = await ArchiveSession.open(file())
    worker().autoExtract = false
    const read = session.files[0]!.read()
    const failure = expect(read).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    await vi.waitFor(() => expect(worker().commands.some(command => command.type === 'extract')).toBe(true))
    expect(() => worker().onmessage?.(new MessageEvent('message', { data: null }))).not.toThrow()
    await failure
    expect(worker().terminate).toHaveBeenCalledOnce()
    await session.close()
  })

  it('records actual session/Worker ownership and accepted extraction rather than repeated cache reads', async () => {
    const before = runtimeDiagnostics.getSnapshot()
    const session = await ArchiveSession.open(file())
    await session.files[0]!.read()
    await session.files[0]!.read()
    const opened = runtimeDiagnostics.getSnapshot()
    expect(opened.workersCreated - before.workersCreated).toBe(1)
    expect(opened.archiveSessionsOpened - before.archiveSessionsOpened).toBe(1)
    expect(opened.activeWorkers - before.activeWorkers).toBe(1)
    expect(opened.activeArchiveSessions - before.activeArchiveSessions).toBe(1)
    expect(opened.entryExtractionsStarted - before.entryExtractionsStarted).toBe(1)
    expect(opened.entryExtractionsCompleted - before.entryExtractionsCompleted).toBe(1)
    await session.close(); await session.close()
    const after = runtimeDiagnostics.getSnapshot()
    expect(after.workersTerminated - before.workersTerminated).toBe(1)
    expect(after.archiveSessionsClosed - before.archiveSessionsClosed).toBe(1)
    expect(after.activeWorkers).toBe(before.activeWorkers)
    expect(after.activeArchiveSessions).toBe(before.activeArchiveSessions)
  })
})
