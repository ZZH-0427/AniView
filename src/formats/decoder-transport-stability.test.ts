import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebPDecoder } from './webp/webp-decoder'
import { APNGDecoder } from './apng/apng-decoder'
import { GIFDecoder } from './gif/gif-decoder'
import { runtimeDiagnostics } from '../media/runtime-diagnostics'

class BrokenWorker {
  static current: BrokenWorker
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: Pick<ErrorEvent, 'preventDefault'>) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { BrokenWorker.current = this }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe.each([['WebP', WebPDecoder], ['APNG', APNGDecoder], ['GIF', GIFDecoder]] as const)('%s transport fault recovery', (_name, Decoder) => {
  it.each(['error', 'messageerror', 'postMessage', 'timeout'] as const)('terminates on %s, rejects pending work and permits a new decoder', async failure => {
    vi.stubGlobal('Worker', BrokenWorker)
    vi.useFakeTimers()
    const before = runtimeDiagnostics.getSnapshot(), decoder = new Decoder(), worker = BrokenWorker.current
    if (failure === 'postMessage') worker.postMessage.mockImplementation(() => { throw new Error('Injected transport fault') })
    const pending = decoder.next()
    const rejected = expect(pending).rejects.toMatchObject({ code: 'WORKER_FAILED' })
    if (failure === 'error') worker.onerror?.({ preventDefault: vi.fn() })
    if (failure === 'messageerror') worker.onmessageerror?.()
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(15_001)
    await rejected
    decoder.dispose(); decoder.dispose()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(runtimeDiagnostics.getSnapshot().activeWorkers).toBe(before.activeWorkers)
    expect(runtimeDiagnostics.getSnapshot().decoderErrors).toBe(before.decoderErrors + 1)
    const replacement = new Decoder(), next = replacement.next()
    BrokenWorker.current.onmessage?.(new MessageEvent('message', { data: { id: 1, type: 'end' } }))
    await expect(next).resolves.toMatchObject({ type: 'end' })
    replacement.dispose()
    expect(runtimeDiagnostics.getSnapshot().activeWorkers).toBe(before.activeWorkers)
  })
})
