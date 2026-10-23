import { afterEach, expect, it, vi } from 'vitest'
import { GIFAnimationDecoder } from './gif-animation-decoder'
import type { GIFResponse } from './gif-worker-protocol'

const transport = vi.hoisted(() => ({ open: vi.fn(), next: vi.fn(), reset: vi.fn(), close: vi.fn(), dispose: vi.fn() }))
vi.mock('./gif-decoder', () => ({ GIFDecoder: class { open = transport.open; next = transport.next; reset = transport.reset; close = transport.close; dispose = transport.dispose } }))
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })
it('exposes generic metadata and a fresh incremental stream with disposable frame ownership', async () => {
  vi.stubGlobal('ImageData', class { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} })
  transport.open.mockResolvedValue({ type: 'ready', metadata: { width: 1, height: 1, frameCount: 1, loopCount: 0 } })
  transport.next.mockResolvedValueOnce({ type: 'frame', frameIndex: 0, width: 1, height: 1, durationMs: 0, rgba: new ArrayBuffer(4) }).mockResolvedValue({ type: 'end' })
  const decoder = new GIFAnimationDecoder()
  expect(decoder.canDecode({ kind: 'png', animated: false })).toBe(false)
  const sequence = await decoder.decode({ name: 'not-an-extension.webp', source: 'file', size: 1, read: async () => new ArrayBuffer(1) })
  expect(sequence.loopCount).toBe(0)
  const stream = sequence.frames()[Symbol.asyncIterator]()
  const item = await stream.next()
  expect(item.value?.durationMs).toBe(0)
  expect(item.value?.byteLength).toBe(4)
  item.value?.dispose(); expect(item.value?.image).toBeNull()
  expect((await stream.next()).done).toBe(true)
  await sequence.frames()[Symbol.asyncIterator]().next()
  expect(transport.reset).toHaveBeenCalledTimes(2)
  await sequence.dispose(); await sequence.dispose()
  expect(transport.close).toHaveBeenCalledOnce()
  expect(transport.dispose).toHaveBeenCalledOnce()
})
it('closes the transport on failed open and aborted input', async () => {
  const abort = new AbortController(); abort.abort()
  await expect(new GIFAnimationDecoder().decode({ name: '', size: 1, source: 'file', read: async () => new ArrayBuffer(1) }, { signal: abort.signal })).rejects.toMatchObject({ code: 'WORKER_FAILED' })
  expect(transport.dispose).toHaveBeenCalledOnce()
})
it('does not yield a resolved frame after disposal or abort invalidates the stream', async () => {
  const imageCreated = vi.fn()
  vi.stubGlobal('ImageData', class { constructor() { imageCreated() } })
  for (const action of ['dispose', 'abort-open', 'abort-stream'] as const) {
    transport.open.mockResolvedValue({ type: 'ready', metadata: { width: 1, height: 1, frameCount: 1, loopCount: 0 } })
    const inputAbort = new AbortController()
    const streamAbort = new AbortController()
    let finish: (response: GIFResponse) => void = () => { throw new Error('No frame request') }
    transport.next.mockImplementationOnce(() => new Promise<GIFResponse>(resolve => { finish = resolve }))
    const sequence = await new GIFAnimationDecoder().decode({ name: 'a.png', size: 1, source: 'file', read: async () => new ArrayBuffer(1) }, { signal: inputAbort.signal })
    const iterator = sequence.frames(streamAbort.signal)[Symbol.asyncIterator]()
    const read = iterator.next()
    await vi.waitFor(() => expect(transport.next).toHaveBeenCalledTimes(1))
    finish({ id: 1, type: 'frame', frameIndex: 0, width: 1, height: 1, durationMs: 10,
      rgba: new ArrayBuffer(4), decodeMs: 0, liveBitmaps: 0, backupBytes: 0 })
    let closing: Promise<void> | undefined
    if (action === 'dispose') closing = sequence.dispose()
    else if (action === 'abort-open') inputAbort.abort()
    else streamAbort.abort()
    await expect(read).resolves.toMatchObject({ done: true })
    await closing
    await sequence.dispose()
    expect(imageCreated).not.toHaveBeenCalled()
    vi.resetAllMocks()
  }
})
it('does not request a frame when disposal occurs just after reset resolves', async () => {
  transport.open.mockResolvedValue({ type: 'ready', metadata: { width: 1, height: 1, frameCount: 1, loopCount: 0 } })
  let finish: () => void = () => { throw new Error('No reset request') }
  transport.reset.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const sequence = await new GIFAnimationDecoder().decode({ name: 'a.png', size: 1, source: 'file', read: async () => new ArrayBuffer(1) })
  const read = sequence.frames()[Symbol.asyncIterator]().next()
  await vi.waitFor(() => expect(transport.reset).toHaveBeenCalledOnce())
  finish()
  const closing = sequence.dispose()
  await expect(read).resolves.toMatchObject({ done: true })
  await closing
  expect(transport.next).not.toHaveBeenCalled()
})
