import { ExtendedBackend } from '../../src/archive/extended/backend'

declare global {
  interface Window {
    extendedPolicyCheck: (name: string, expected?: string, deadlineMs?: number) => Promise<unknown>
  }
}

/** Test-only entry. Every operation below goes through the actual product backend/Worker. */
window.extendedPolicyCheck = async (name, expected, deadlineMs) => {
  const source = await (await fetch(`${import.meta.env.BASE_URL}policy-fixtures/${encodeURIComponent(name)}`)).blob()
  const backend = new ExtendedBackend(deadlineMs === undefined ? {} : { deadlineMs })
  let heartbeat = 0, gap = 0, last = performance.now()
  const timer = setInterval(() => { const now = performance.now(); heartbeat++; gap = Math.max(gap, now - last); last = now }, 16)
  const started = performance.now()
  let details: object
  try {
    const opened = await backend.open(source)
    const selected = opened.entries[0]
    if (!selected) throw new Error('No fixture entry')
    const result = await backend.extractEntry(selected.id)
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', result.data)))
      .map(value => value.toString(16).padStart(2, '0')).join('')
    if (expected && expected !== hash) throw new Error('Fixture hash mismatch')
    details = { status: 'success', entryCount: opened.entries.length,
      totalPathChars: opened.entries.reduce((total, entry) => total + entry.path.length, 0),
      firstPathChars: selected.path.length, dictionaryBytes: selected.dictionaryBytes,
      outputBytes: result.data.byteLength, sha256: hash, native: result.metrics }
  } catch (cause) {
    details = { status: 'error', code: cause instanceof Error && 'code' in cause ? cause.code : 'UNEXPECTED_TEST_ERROR' }
  } finally { clearInterval(timer); backend.close() }
  return { ...details, inputBytes: source.size, elapsedMs: performance.now() - started,
    heartbeatCount: heartbeat, maxHeartbeatGapMs: gap, cleanup: backend.metrics }
}
