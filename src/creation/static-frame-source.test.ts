import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaticImageSequenceSource, StaticSourceReadGate } from './static-frame-source'
import type { StaticSourcePort, StaticSourceRequest, StaticSourceResponse } from './static-source-protocol'
import { preparationMetrics } from './creation.test-support'
import { emptyStaticOwnership } from './static-frame-core'
import type { VirtualFile } from '../input/virtual-file'

class Port implements StaticSourcePort {
  onmessage: StaticSourcePort['onmessage'] = null
  onerror: StaticSourcePort['onerror'] = null
  onmessageerror: StaticSourcePort['onmessageerror'] = null
  requests: StaticSourceRequest[] = []
  terminate = vi.fn()
  postMessage(request: StaticSourceRequest, transfer: Transferable[] = []) {
    this.requests.push(transfer.length ? structuredClone(request, { transfer }) : request)
    if (request.type === 'close') queueMicrotask(() => this.emit({ type: 'closed', job: request.job, id: request.id, resources: emptyStaticOwnership() }))
  }
  emit(value: StaticSourceResponse) { this.onmessage?.({ data: value } as MessageEvent<StaticSourceResponse>) }
  command(type: 'open' | 'next' | 'ack' | 'reset') {
    const request = [...this.requests].reverse().find(r => r.type === type)
    if (!request || !('id' in request)) throw Error('missing command')
    return request
  }
  ready() { const c = this.command('open'); this.emit({ type: 'ready', job: c.job, id: c.id,
    metadata: { width: 2, height: 1, frameCount: 2, playCount: 0 }, metrics: preparationMetrics(), resources: emptyStaticOwnership() }) }
  reply(type: 'acknowledged' | 'reset' | 'end', command: 'ack' | 'reset' | 'next') {
    const c = this.command(command); this.emit({ type, job: c.job, id: c.id, metrics: preparationMetrics(), resources: emptyStaticOwnership() })
  }
  frame(index = 0) {
    const c = this.command('next'); this.emit({ type: 'frame', job: c.job, id: c.id,
      frame: { index, durationMs: 500, rgba: new ArrayBuffer(8) }, metrics: preparationMetrics(), resources: { ...emptyStaticOwnership(), awaitingAck: 1 } })
  }
}
const file = (size = 8): VirtualFile => ({ name: 'local.png', size, source: 'file', read: vi.fn(async () => new ArrayBuffer(size)) })
const opened: StaticImageSequenceSource[] = []
async function setup(signal?: AbortSignal) {
  const port = new Port(), files = [file(), file()]
  const opening = StaticImageSequenceSource.open(files, { durationMs: 500, playCount: 0, createWorker: () => port, ...(signal ? { signal } : {}) })
  port.ready(); const source = await opening; opened.push(source)
  return { source, port, files }
}
afterEach(async () => { await Promise.all(opened.splice(0).map(s => s.close())); vi.useRealTimers() })
describe('static canonical source transport', () => {
  it('does no read ahead, returns metadata and holds a frame until transferred and acknowledged', async () => {
    const { source, port, files } = await setup()
    expect(source.metadata).toEqual({ width: 2, height: 1, frameCount: 2, playCount: 0 })
    expect(files[0]!.read).not.toHaveBeenCalled()
    const next = source.next(); await vi.waitFor(() => expect(port.requests.some(r => r.type === 'next')).toBe(true)); port.frame()
    const frame = await next; expect(frame?.rgba.byteLength).toBe(8)
    await expect(source.next()).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    expect(() => source.acknowledgeFrame()).toThrow()
    structuredClone(frame!.rgba, { transfer: [frame!.rgba] }); source.acknowledgeFrame()
    const following = source.next(); await Promise.resolve()
    expect(port.requests.filter(r => r.type === 'next')).toHaveLength(1)
    port.reply('acknowledged', 'ack'); await vi.waitFor(() => expect(port.requests.filter(r => r.type === 'next')).toHaveLength(2))
    port.frame(1); const second = await following; structuredClone(second!.rgba, { transfer: [second!.rgba] }); source.acknowledgeFrame(); port.reply('acknowledged', 'ack')
    const end = source.next(); await vi.waitFor(() => expect(port.requests.filter(r => r.type === 'next')).toHaveLength(3)); port.reply('end', 'next'); expect(await end).toBeNull()
  })
  it('transfers only the requested encoded source and validates exact byte length', async () => {
    const { source, port, files } = await setup(), c = port.command('open')
    port.emit({ type: 'read', job: c.job, readId: 9, index: 1 })
    await vi.waitFor(() => expect(port.requests.some(r => r.type === 'source')).toBe(true))
    expect(files[0]!.read).not.toHaveBeenCalled(); expect(files[1]!.read).toHaveBeenCalledOnce()
    expect(port.requests.find(r => r.type === 'source')).toMatchObject({ readId: 9, data: expect.any(ArrayBuffer) })
    await source.close(); expect(source.softClosed).toBe(true); expect(port.terminate).toHaveBeenCalledOnce()
  })
  it('supports reset only without a held frame and rejects reordered frames', async () => {
    const { source, port } = await setup()
    const reset = source.reset(); await vi.waitFor(() => expect(port.requests.some(r => r.type === 'reset')).toBe(true)); port.reply('reset', 'reset'); await reset
    const next = source.next(); await vi.waitFor(() => expect(port.requests.some(r => r.type === 'next')).toBe(true)); port.frame(1)
    await expect(next).rejects.toBeDefined()
  })
  it('ignores stale response IDs and joins normal source close without releasing caller files', async () => {
    const { source, port } = await setup(), release = vi.fn()
    const next = source.next(); await vi.waitFor(() => expect(port.requests.some(r => r.type === 'next')).toBe(true))
    const c = port.command('next'); port.emit({ type: 'error', job: c.job, id: c.id + 99, code: 'WORKER_FAILED' }); port.frame()
    expect((await next)?.index).toBe(0)
    await source.close(); await source.close(); expect(port.terminate).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled()
    expect(source.resources).toEqual(emptyStaticOwnership())
  })
  it('cancels a pending source operation and suppresses late encoded reads', async () => {
    const abort = new AbortController(), { source, port } = await setup(abort.signal)
    const next = source.next(); const rejected = expect(next).rejects.toMatchObject({ code: 'CANCELLED' })
    await vi.waitFor(() => expect(port.requests.some(r => r.type === 'next')).toBe(true)); abort.abort(); await rejected; await source.close()
    expect(port.terminate).toHaveBeenCalledOnce()
  })
  it('bounds a stuck source close with a termination fallback', async () => {
    const { source, port } = await setup(); vi.useFakeTimers(); vi.spyOn(port, 'postMessage').mockImplementation(() => {})
    const close = source.close(); await vi.advanceTimersByTimeAsync(101); await close
    expect(source.softClosed).toBe(false); expect(port.terminate).toHaveBeenCalledOnce(); expect(source.resources.ownedRgba).toBe(0)
  })
  it.each([1, 201])('rejects source count %i before Worker construction', async count => {
    const createWorker = vi.fn(() => new Port())
    await expect(StaticImageSequenceSource.open(Array.from({ length: count }, () => file()), { durationMs: 500, playCount: 0, createWorker })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(createWorker).not.toHaveBeenCalled()
  })
  it('accepts exact 16MiB aggregate, rejects overflow, and does not use conversion source limits', async () => {
    const port = new Port(), files = [file(8 * 1024 * 1024), file(8 * 1024 * 1024)]
    const opening = StaticImageSequenceSource.open(files, { durationMs: 500, playCount: 0, createWorker: () => port }); port.ready(); const source = await opening; opened.push(source)
    await expect(StaticImageSequenceSource.open([...files, file(1)], { durationMs: 500, playCount: 0 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(files[0]!.read).not.toHaveBeenCalled()
  })
  it('serializes an uncancellable old read before another job starts reading', async () => {
    const gate = new StaticSourceReadGate(); let finish!: (bytes: ArrayBuffer) => void, current = true
    const first: VirtualFile = { ...file(), read: () => new Promise(resolve => { finish = resolve }) }, second = file()
    const old = gate.read(first, () => current); await Promise.resolve(); current = false
    const late = expect(old).rejects.toMatchObject({ code: 'CANCELLED' }), newer = gate.read(second, () => true)
    await Promise.resolve(); expect(second.read).not.toHaveBeenCalled(); finish(new ArrayBuffer(8)); await late; await newer
    expect(second.read).toHaveBeenCalledOnce()
  })
})
