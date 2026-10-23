type ResourceKind = 'worker' | 'bitmap' | 'archive'
export type RuntimeEvent = 'entryExtractionsStarted' | 'entryExtractionsCompleted'
  | 'entryExtractionsDiscarded' | 'staleResultsDiscarded' | 'decoderErrors'
  | 'staticDecodeErrors' | 'archiveErrors' | 'cleanupErrors'

const initialSnapshot = () => ({
  workersCreated: 0, workersTerminated: 0, activeWorkers: 0, peakWorkers: 0,
  bitmapsCreated: 0, bitmapsClosed: 0, activeBitmaps: 0, peakBitmaps: 0,
  archiveSessionsOpened: 0, archiveSessionsClosed: 0, activeArchiveSessions: 0,
  entryExtractionsStarted: 0, entryExtractionsCompleted: 0, entryExtractionsDiscarded: 0,
  staleResultsDiscarded: 0, decoderErrors: 0, staticDecodeErrors: 0, archiveErrors: 0, cleanupErrors: 0,
})
export type RuntimeSnapshot = Readonly<ReturnType<typeof initialSnapshot>>
const noop = () => {}

/** Numeric, local ownership evidence only. No filenames, bytes, paths or exceptions. */
export class RuntimeDiagnostics {
  private snapshot: RuntimeSnapshot = initialSnapshot()
  private readonly listeners = new Set<() => void>()
  constructor(readonly enabled: boolean) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    if (!this.enabled) return noop
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private publish(next: RuntimeSnapshot) {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
  trackResource(kind: ResourceKind): () => void {
    if (!this.enabled) return noop
    const keys = kind === 'worker'
      ? ['workersCreated', 'workersTerminated', 'activeWorkers', 'peakWorkers'] as const
      : kind === 'bitmap'
        ? ['bitmapsCreated', 'bitmapsClosed', 'activeBitmaps', 'peakBitmaps'] as const
        : ['archiveSessionsOpened', 'archiveSessionsClosed', 'activeArchiveSessions'] as const
    const [created, closed, active, peak] = keys
    const current = this.snapshot
    this.publish({ ...current, [created]: current[created] + 1, [active]: current[active] + 1,
      ...(peak ? { [peak]: Math.max(current[peak], current[active] + 1) } : {}) })
    let released = false
    return () => {
      if (released) return
      released = true
      const current = this.snapshot
      this.publish({ ...current, [closed]: current[closed] + 1, [active]: current[active] - 1 })
    }
  }
  count(name: RuntimeEvent) {
    if (this.enabled) this.publish({ ...this.snapshot, [name]: this.snapshot[name] + 1 })
  }
}

export const runtimeDiagnostics = new RuntimeDiagnostics(import.meta.env.DEV ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1'))
export const trackRuntimeResource = (kind: ResourceKind) => runtimeDiagnostics.trackResource(kind)
export const countRuntimeEvent = (name: RuntimeEvent) => runtimeDiagnostics.count(name)
