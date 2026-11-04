import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('local creator post-close snapshot', () => {
  it('copies only explicit numeric/ownership fields, not result objects or identity', async () => {
    const { creationCleanup, initialCreationCleanup, recordCreationCleanup } = await import('./creation-cleanup')
    const subscriber = vi.fn(), unsubscribe = creationCleanup.subscribe(subscriber), value = { ...initialCreationCleanup(), filename: 'private.png' }
    recordCreationCleanup(value); expect(creationCleanup.getSnapshot()).not.toHaveProperty('filename'); expect(creationCleanup.getSnapshot()).not.toBe(value)
    expect(subscriber).toHaveBeenCalledOnce(); unsubscribe(); recordCreationCleanup(initialCreationCleanup()); expect(subscriber).toHaveBeenCalledTimes(1)
  })
  it('retains no snapshot in ordinary production mode', async () => {
    vi.stubEnv('DEV', false); vi.stubGlobal('location', { search: '' })
    const { creationCleanup, initialCreationCleanup, recordCreationCleanup } = await import('./creation-cleanup')
    recordCreationCleanup(initialCreationCleanup()); expect(creationCleanup.getSnapshot()).toBeNull()
  })
})
