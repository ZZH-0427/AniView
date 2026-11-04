import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArchiveSession } from './archive-session'
import { createArchiveEntryMetadata } from './archive-policy'
import type { ArchiveRequest, ArchiveResponse } from './archive-worker-protocol'
import { archiveCleanup } from '../media/archive-cleanup'

// TEST FIXTURE ONLY. Public synthetic values, never personal credentials.
const alpha = 'alpha', beta = 'beta'
const entries = [false, true, true, true, true].map((encrypted, id) => createArchiveEntryMetadata({ name: `${id}.gif`, directory: false,
  encrypted, compressedSize: 8, uncompressedSize: 4, compressionMethod: 0 }, id))
let readyEntries = entries
const metrics = { entryCount: 5, mediaCount: 5, totalDeclaredBytes: 20, extractions: 0, metadataMs: 0, extractMs: 0 }
class PasswordWorker {
  static instances: PasswordWorker[] = []
  onmessage: ((event: MessageEvent<ArchiveResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  commands: ArchiveRequest[] = []
  defer = false; ignoreCancel = false
  terminate = vi.fn()
  constructor() { PasswordWorker.instances.push(this) }
  send(response: ArchiveResponse) { this.onmessage?.({ data: response } as MessageEvent<ArchiveResponse>) }
  postMessage(command: ArchiveRequest) {
    this.commands.push(command)
    queueMicrotask(() => {
      if (command.type === 'open') this.send({ id: command.id, type: 'ready', entries: readyEntries, metrics })
      if (command.type === 'close') this.send({ id: command.id, type: 'closed' })
      if (command.type === 'cancel' && !this.ignoreCancel) this.send({ id: command.target, type: 'error', code: 'ARCHIVE_CLOSED', aborted: true })
      if (command.type === 'extract' && !this.defer) this.finish(command.id)
    })
  }
  finish(id: number) {
    const command = this.commands.find(c => c.type === 'extract' && c.id === id)
    if (!command || command.type !== 'extract') throw Error('Missing test command')
    if (command.entryId && command.password !== (command.entryId === 3 ? beta : alpha)) this.send({ id, type: 'error', code: 'ARCHIVE_WRONG_PASSWORD' })
    else this.success(id)
  }
  success(id: number) { this.send({ id, type: 'extracted', blob: new Blob(['data']), metrics: { ...metrics, extractions: this.extracts().length } }) }
  extracts() { return this.commands.filter(c => c.type === 'extract') }
}
const opened: ArchiveSession[] = [], worker = () => PasswordWorker.instances.at(-1)!
const open = async () => { const s = await ArchiveSession.open(new File(['zip'], 'fixture.zip')); opened.push(s); return s }
beforeEach(() => { readyEntries = entries; PasswordWorker.instances = []; vi.stubGlobal('Worker', PasswordWorker) })
afterEach(async () => { await Promise.all(opened.splice(0).map(s => s.close())); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('archive-owned password orchestration', () => {
  it('opens metadata and resolves owned entry identity without extracting or prompting siblings', async () => {
    const s = await open(); expect(s.metrics.extractions).toBe(0); expect(s.entryForFile(s.files[2]!)?.id).toBe(2)
    expect(s.entryForFile({ ...s.files[2]!, read: async () => new ArrayBuffer(0) })).toBeUndefined()
    await s.files[0]!.read(); expect(worker().extracts()).toEqual([expect.not.objectContaining({ password: expect.anything() })])
    readyEntries = entries.map((entry, index) => index === 1 ? { ...entry, path: 'notes.txt', mediaCandidate: false } : entry)
    const filtered = await open()
    expect(filtered.entryForFile(filtered.files[1]!)?.id).toBe(2) // ZIP ID, not filtered UI ordinal.
  })
  it('requires input without transport, rejects wrong input and retries the same session/file successfully', async () => {
    const s = await open(), f = s.files[1]!
    await expect(s.ensureEntryAvailable(1)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' }); expect(worker().extracts()).toHaveLength(0)
    await expect(s.unlockEntry(1, 'wrong')).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    await s.unlockEntry(1, alpha); expect(PasswordWorker.instances).toHaveLength(1)
    const count = worker().extracts().length; expect((await f.read(0, 2)).byteLength).toBe(2); await f.read()
    expect(worker().extracts()).toHaveLength(count)
  })
  it('reuses only the most recent fully successful password and never stores failed manual input', async () => {
    const s = await open(); await s.unlockEntry(1, alpha); await s.ensureEntryAvailable(2)
    expect(worker().extracts().at(-1)).toMatchObject({ entryId: 2, password: alpha })
    await expect(s.ensureEntryAvailable(3)).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    const count = worker().extracts().length
    await expect(s.ensureEntryAvailable(3)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' }); expect(worker().extracts()).toHaveLength(count)
    await expect(s.unlockEntry(3, 'wrong')).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    await expect(s.ensureEntryAvailable(4)).rejects.toMatchObject({ code: 'ARCHIVE_ENCRYPTED' })
    await s.unlockEntry(3, beta); await expect(s.ensureEntryAvailable(1)).rejects.toMatchObject({ code: 'ARCHIVE_WRONG_PASSWORD' })
    await s.unlockEntry(1, alpha)
  })
  it('re-materializes released plaintext for conversion with session credentials and fresh range buffers', async () => {
    const s = await open(), file = s.files[1]!; await s.unlockEntry(1, alpha); await file.release()
    const [a,b] = await Promise.all([file.read(),file.read(0,2)])
    expect(worker().extracts()).toHaveLength(2); structuredClone(a,{transfer:[a]}); expect(a.byteLength).toBe(0); expect(b.byteLength).toBe(2)
    expect((await file.read()).byteLength).toBe(4)
  })
  it('does not promote a header/partial or stale result, and keeps only one active same-entry attempt', async () => {
    const s = await open(); worker().defer = true; worker().ignoreCancel = true
    const first = s.unlockEntry(1, 'wrong'), rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(worker().extracts()).toHaveLength(1))
    const second = s.unlockEntry(1, alpha); await Promise.resolve(); expect(worker().extracts()).toHaveLength(1)
    worker().success(worker().extracts()[0]!.id); await rejected
    await vi.waitFor(() => expect(worker().extracts()).toHaveLength(2)); worker().finish(worker().extracts()[1]!.id); await second
    worker().defer = false; await s.ensureEntryAvailable(2); expect(worker().extracts().at(-1)).toMatchObject({ password: alpha })
  })
  it('does not cache a size-mismatched or rejected result', async () => {
    const s = await open(); worker().defer = true
    const attempt=s.unlockEntry(1,alpha), rejected=expect(attempt).rejects.toMatchObject({code:'ARCHIVE_CORRUPTED'})
    await vi.waitFor(()=>expect(worker().extracts()).toHaveLength(1));worker().send({id:worker().extracts()[0]!.id,type:'extracted',blob:new Blob(['partial']),metrics});await rejected
    await expect(s.ensureEntryAvailable(2)).rejects.toMatchObject({code:'ARCHIVE_ENCRYPTED'});expect(s.metrics.currentExtractedBytes).toBe(0)
  })
  it('cancels access without closing the archive and allows explicit retry', async () => {
    const s=await open(),abort=new AbortController();worker().defer=true
    const pending=s.unlockEntry(1,alpha,{signal:abort.signal}),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await vi.waitFor(()=>expect(worker().extracts()).toHaveLength(1));abort.abort();await s.releaseEntry(1);await rejected
    worker().defer=false;await s.unlockEntry(1,alpha);expect(worker().terminate).not.toHaveBeenCalled()
  })
  it('clears secret ownership across archives, closes during access and ignores late success', async () => {
    const a=await open();await a.unlockEntry(1,alpha);expect(JSON.stringify(a.metrics)).not.toContain(alpha)
    await a.close();const b=await open();await expect(b.ensureEntryAvailable(1)).rejects.toMatchObject({code:'ARCHIVE_ENCRYPTED'})
    worker().defer=true;const oldWorker=worker(),pending=b.unlockEntry(1,alpha),rejected=expect(pending).rejects.toBeDefined()
    await vi.waitFor(()=>expect(oldWorker.extracts()).toHaveLength(1));await b.close();await rejected;oldWorker.success(oldWorker.extracts()[0]!.id)
    expect(b.files).toEqual([]);expect(b.metrics).toMatchObject({pendingReads:0,pendingPasswordAccess:0,currentExtractedBytes:0})
    expect(archiveCleanup.getSnapshot()).toEqual({activeArchiveWorkers:0,activeArchiveSessions:0,pendingReads:0,pendingPasswordAccess:0,currentExtractedBytes:0,cleanupErrors:0})
  })
  it('never forwards or serializes a password for ordinary entries', async () => {
    const s=await open();await s.unlockEntry(1,alpha);await s.extractEntry(0,{password:beta})
    expect(worker().extracts().at(-1)).not.toHaveProperty('password');expect(JSON.stringify(s.metrics)).not.toMatch(/alpha|beta|passwordLength|passwordHash/)
    expect(Object.keys(s).some(key=>key.toLowerCase().includes('password'))).toBe(false)
  })
})
