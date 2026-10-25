import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkerTaskYield } from './worker-task-yield'

class Port {
  onmessage: (() => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()
}
const channels: Channel[] = []
class Channel {
  port1 = new Port()
  port2 = new Port()
  constructor() { channels.push(this) }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); channels.length = 0 })

describe('encoding Worker checkpoint task yield', () => {
  it('waits for a real channel task, not a Promise microtask, and reuses its ports', async () => {
    vi.stubGlobal('MessageChannel', Channel)
    const task = createWorkerTaskYield()
    let completed = false
    const first = task.yield().then(() => { completed = true })
    await Promise.resolve()
    expect(completed).toBe(false)
    expect(channels).toHaveLength(1)
    expect(channels[0]!.port2.postMessage).toHaveBeenCalledExactlyOnceWith(null)
    channels[0]!.port1.onmessage?.()
    await first
    expect(completed).toBe(true)
    const next = task.yield()
    expect(channels).toHaveLength(1)
    channels[0]!.port1.onmessage?.()
    await next
    task.close()
    expect(channels[0]!.port1.close).toHaveBeenCalledOnce()
    expect(channels[0]!.port2.close).toHaveBeenCalledOnce()
  })
  it('releases both ports and rejects outstanding wait on close, with idempotent cleanup', async () => {
    vi.stubGlobal('MessageChannel', Channel)
    const task = createWorkerTaskYield(), waiting = task.yield()
    const rejected = expect(waiting).rejects.toThrow('closed')
    task.close(); task.close()
    await rejected
    expect(channels[0]!.port1.onmessage).toBeNull()
    expect(channels[0]!.port1.close).toHaveBeenCalledOnce()
    expect(channels[0]!.port2.close).toHaveBeenCalledOnce()
    await expect(task.yield()).rejects.toThrow('closed')
  })
  it('rejects concurrent yields instead of retaining an unbounded resolver queue', async () => {
    vi.stubGlobal('MessageChannel', Channel)
    const task = createWorkerTaskYield(), first = task.yield()
    await expect(task.yield()).rejects.toThrow('already pending')
    channels[0]!.port1.onmessage?.()
    await first; task.close()
  })
  it.each([undefined, class { constructor() { throw new Error('Channel denied') } }])('uses timer compatibility path when channel unavailable: %s', async channel => {
    vi.useFakeTimers(); vi.stubGlobal('MessageChannel', channel)
    const task = createWorkerTaskYield(), waiting = task.yield()
    expect(vi.getTimerCount()).toBe(1)
    await vi.runAllTimersAsync(); await waiting
    task.close()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears a pending fallback timer on close', async () => {
    vi.useFakeTimers(); vi.stubGlobal('MessageChannel', undefined)
    const task = createWorkerTaskYield(), waiting = task.yield()
    const rejected = expect(waiting).rejects.toThrow('closed')
    task.close(); await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})
