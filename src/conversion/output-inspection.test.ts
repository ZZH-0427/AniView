import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectConversionOutput } from './output-inspection'
import type { AnimationFrameSource } from './model'

const metadata = { width: 2, height: 1, frameCount: 2, playCount: 3 }
const file = { name: 'output.png', size: 1, source: 'file' as const, read: async () => new ArrayBuffer(1) }
function fixture(fail = false) {
  const buffers: ArrayBuffer[] = [], terminate = vi.fn(), ack = vi.fn(), close = vi.fn(async () => {})
  class WorkerFake {
    onmessage: ((event: MessageEvent<{ id: number }>) => void) | undefined
    onerror: ((event: { preventDefault(): void }) => void) | undefined
    onmessageerror: (() => void) | undefined
    terminate = terminate
    postMessage(message: { id: number; rgba: ArrayBuffer }, transfer: Transferable[]) {
      const copy = structuredClone(message, { transfer })
      queueMicrotask(() => { if (fail) this.onmessageerror?.(); else this.onmessage?.({ data: { id: copy.id } } as MessageEvent<{ id: number }>) })
    }
  }
  vi.stubGlobal('Worker', WorkerFake)
  let index = 0
  const source: AnimationFrameSource = { metadata, metrics: { decodeMs: 0, decoderHeapBytes: 0, decoderBackupBytes: 0 },
    next: async () => {
      if (index === 2) return null
      const rgba = new ArrayBuffer(8); buffers.push(rgba)
      return { index: index++, durationMs: index === 1 ? 27 : 100, rgba }
    }, acknowledgeFrame: ack, reset: async () => {}, close }
  return { source, buffers, terminate, ack, close }
}
afterEach(() => vi.unstubAllGlobals())
describe('result decode-back ownership', () => {
  it('reads actual metadata/duration while transferring and acknowledging one frame at a time', async () => {
    const f = fixture()
    expect(await inspectConversionOutput(file, 'apng', new AbortController().signal, async () => f.source)).toEqual({ ...metadata, durationMs: 127 })
    expect(f.buffers.every(buffer => buffer.byteLength === 0)).toBe(true)
    expect(f.ack).toHaveBeenCalledTimes(2); expect(f.close).toHaveBeenCalledOnce(); expect(f.terminate).toHaveBeenCalledOnce()
  })
  it('terminates and closes when the inspection Worker fails', async () => {
    const f = fixture(true)
    await expect(inspectConversionOutput(file, 'apng', new AbortController().signal, async () => f.source)).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    expect(f.ack).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalledOnce(); expect(f.terminate).toHaveBeenCalledOnce()
  })
  it('honors cancellation before opening any result decoder', async () => {
    const f = fixture(), abort = new AbortController(), open = vi.fn(async () => f.source); abort.abort()
    await expect(inspectConversionOutput(file, 'apng', abort.signal, open)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(open).not.toHaveBeenCalled(); expect(f.terminate).toHaveBeenCalledOnce()
  })
})
