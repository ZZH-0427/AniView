import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArchiveSession } from './archive-session'
import { createArchiveEntryMetadata } from './archive-policy'
import type { ArchiveEntryMetadata } from './archive-policy'
import type { ArchiveRequest, ArchiveResponse } from './archive-worker-protocol'

const entries = Array.from({ length: 10 }, (_, id) => createArchiveEntryMetadata({ name: `${id}.gif`, directory: false,
  compressedSize: 4, uncompressedSize: 4, encrypted: false, compressionMethod: 0 }, id))
const metrics = { entryCount: 10, mediaCount: 10, totalDeclaredBytes: 40, extractions: 0, metadataMs: 3, extractMs: 1 }
let readyEntries: readonly ArchiveEntryMetadata[] = entries
class TestWorker {
  static instances: TestWorker[] = []
  readonly commands: ArchiveRequest[] = []
  onmessage: ((event: MessageEvent<ArchiveResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  autoExtract = true
  constructor() { TestWorker.instances.push(this) }
  send(response: ArchiveResponse) { this.onmessage?.({ data: response } as MessageEvent<ArchiveResponse>) }
  postMessage(command: ArchiveRequest) {
    this.commands.push(command)
    queueMicrotask(() => {
      if (command.type === 'open') this.send({ id: command.id, type: 'ready', entries: readyEntries, metrics })
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
beforeEach(() => { readyEntries = entries; TestWorker.instances = []; vi.stubGlobal('Worker', TestWorker) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

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
})
