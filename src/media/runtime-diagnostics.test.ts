import { describe, expect, it, vi } from 'vitest'
import { RuntimeDiagnostics } from './runtime-diagnostics'

describe('runtime ownership diagnostics', () => {
  it('counts actual acquired/released resources, including idempotent cleanup', () => {
    const diagnostics = new RuntimeDiagnostics(true)
    const closeWorker = diagnostics.trackResource('worker')
    const closeBitmap = diagnostics.trackResource('bitmap')
    const closeArchive = diagnostics.trackResource('archive')
    expect(diagnostics.getSnapshot()).toMatchObject({ activeWorkers: 1, activeBitmaps: 1, activeArchiveSessions: 1 })
    closeWorker(); closeWorker(); closeBitmap(); closeBitmap(); closeArchive(); closeArchive()
    expect(diagnostics.getSnapshot()).toMatchObject({ workersCreated: 1, workersTerminated: 1,
      activeWorkers: 0, bitmapsCreated: 1, bitmapsClosed: 1, activeBitmaps: 0,
      archiveSessionsOpened: 1, archiveSessionsClosed: 1, activeArchiveSessions: 0 })
  })
  it('keeps immutable snapshots, peak concurrency and cumulative discarded/error evidence', () => {
    const diagnostics = new RuntimeDiagnostics(true)
    const original = diagnostics.getSnapshot()
    const closeA = diagnostics.trackResource('worker'), closeB = diagnostics.trackResource('worker')
    diagnostics.count('staleResultsDiscarded'); diagnostics.count('decoderErrors')
    closeA(); closeB()
    expect(original.workersCreated).toBe(0)
    expect(diagnostics.getSnapshot()).toMatchObject({ peakWorkers: 2, activeWorkers: 0,
      staleResultsDiscarded: 1, decoderErrors: 1 })
  })
  it('notifies subscribers only while subscribed', () => {
    const diagnostics = new RuntimeDiagnostics(true), listener = vi.fn()
    const unsubscribe = diagnostics.subscribe(listener)
    diagnostics.count('archiveErrors'); unsubscribe(); diagnostics.count('cleanupErrors')
    expect(listener).toHaveBeenCalledTimes(1)
  })
  it('does not collect resources, events or subscriptions in ordinary production mode', () => {
    const diagnostics = new RuntimeDiagnostics(false), listener = vi.fn()
    const original = diagnostics.getSnapshot()
    diagnostics.subscribe(listener)
    diagnostics.trackResource('worker')(); diagnostics.count('staticDecodeErrors')
    expect(diagnostics.getSnapshot()).toBe(original)
    expect(listener).not.toHaveBeenCalled()
  })
})
