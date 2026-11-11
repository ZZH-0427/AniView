import { MediaError } from '../../media/errors'
import type { ExtendedArchiveKind, ExtendedEntry, ExtendedNativeMetrics } from './protocol'

/** Exact product boundaries; callers may shorten deadlines but cannot raise budgets. */
export const EXTENDED_LIMITS = Object.freeze({
  maxInputBytes: 15 * 1024 ** 2,
  maxOutputBytes: 4 * 1024 ** 2,
  maxDictionaryBytes: 4 * 1024 ** 2,
  maxEntries: 1000,
  maxPathChars: 1024,
  maxTotalPathChars: 128 * 1024,
  maxReadBytes: 128 * 1024 ** 2,
  maxReadChunk: 1024 ** 2,
  maxOperationMs: 15000,
  initialWasmBytes: 16 * 1024 ** 2,
  maxWasmBytes: 64 * 1024 ** 2,
})

function limit(): never { throw new MediaError('ARCHIVE_LIMIT_EXCEEDED') }
export function safeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new MediaError('ARCHIVE_BACKEND_ERROR')
  return value
}
export function nativeNumber(value: number): number | null { return value === -1 ? null : safeCount(value) }
export function nativeBoolean(value: number): boolean | null {
  if (value === -1) return null
  if (value !== 0 && value !== 1) throw new MediaError('ARCHIVE_BACKEND_ERROR')
  return value === 1
}
export function assertExtendedInput(size: number): void {
  if (safeCount(size) > EXTENDED_LIMITS.maxInputBytes) limit()
}
export function extendedDeadline(value: number = EXTENDED_LIMITS.maxOperationMs): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > EXTENDED_LIMITS.maxOperationMs) limit()
  return value
}
export function detectExtendedSignature(bytes: Uint8Array): ExtendedArchiveKind {
  const starts = (values: readonly number[]) => values.every((value, index) => bytes[index] === value)
  if (starts([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return 7
  if (starts([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) return 4
  if (starts([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])) return 5
  throw new MediaError('ARCHIVE_UNSUPPORTED_FORMAT')
}
export function extendedPath(path: string): string {
  if (path.length > EXTENDED_LIMITS.maxPathChars) limit()
  const unsafeCharacter = [...path].some(character => {
    const code = character.codePointAt(0)!
    return code < 32 || code >= 127 && code <= 159 || code >= 0x202a && code <= 0x202e || code >= 0x2066 && code <= 0x2069
  })
  if (!path || unsafeCharacter) throw new MediaError('ARCHIVE_UNSUPPORTED')
  const normalized = path.replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (normalized.startsWith('/') || parts.some(part => part === '..' || part === '.' || /^[a-z]:/iu.test(part))) {
    throw new MediaError('ARCHIVE_UNSUPPORTED')
  }
  if (!parts.some(Boolean) || parts.slice(0, -1).some(part => !part)) throw new MediaError('ARCHIVE_UNSUPPORTED')
  return normalized
}

/** Partial recognized-method filter only; compressed headers can allocate earlier. */
export function methodDictionary(method: string, declared: number | null): number | null {
  if (declared !== null) return safeCount(declared)
  const match = /(?:^|\s)LZMA2?:(\d+)([bkm])?(?=\s|$)/iu.exec(method)
    ?? /(?:^|:)m\d+:(\d+)([bkm])(?=\s|$)/iu.exec(method)
  if (!match) return null
  const count = Number(match[1]), suffix = match[2]?.toLowerCase()
  const scale = suffix === 'k' ? 1024 : suffix === 'm' ? 1024 ** 2 : 1
  const value = suffix ? count * scale : 2 ** count
  // A recognized but overflowing declaration is definitely oversized. Do not
  // relabel it as unknown and silently bypass the known-dictionary filter.
  if (!Number.isSafeInteger(value) || value < 0) limit()
  return value
}
export function assertExtendedEntries(entries: readonly ExtendedEntry[]): void {
  if (entries.length > EXTENDED_LIMITS.maxEntries) limit()
  const ids = new Set<number>()
  let paths = 0
  for (const entry of entries) {
    if (ids.has(safeCount(entry.id))) throw new MediaError('ARCHIVE_BACKEND_ERROR')
    ids.add(entry.id)
    if (extendedPath(entry.path) !== entry.normalizedPath) throw new MediaError('ARCHIVE_BACKEND_ERROR')
    if (entry.path.length > EXTENDED_LIMITS.maxTotalPathChars - paths) limit()
    paths += entry.path.length
    for (const value of [entry.size, entry.packedSize, entry.attributes, entry.dictionaryBytes, entry.block]) {
      if (value !== null) safeCount(value)
    }
    if (entry.isFile && (entry.isDirectory || entry.special)) throw new MediaError('ARCHIVE_BACKEND_ERROR')
  }
}
export function assertExtendedExtraction(entry: ExtendedEntry): void {
  if (!entry.isFile || entry.special || entry.isDirectory) throw new MediaError('ARCHIVE_UNSUPPORTED')
  if (entry.size !== null && safeCount(entry.size) > EXTENDED_LIMITS.maxOutputBytes
    || entry.dictionaryBytes !== null && safeCount(entry.dictionaryBytes) > EXTENDED_LIMITS.maxDictionaryBytes) limit()
}
export function assertActualOutput(bytes: number): void {
  if (safeCount(bytes) > EXTENDED_LIMITS.maxOutputBytes) limit()
}
export function assertSourceRead(previous: number, chunk: number): void {
  if (safeCount(chunk) > EXTENDED_LIMITS.maxReadChunk
    || safeCount(previous) > EXTENDED_LIMITS.maxReadBytes - chunk) limit()
}
export function assertNativeMetrics(metrics: ExtendedNativeMetrics): void {
  for (const value of Object.values(metrics)) safeCount(value)
  if (metrics.wasmMaximum !== EXTENDED_LIMITS.maxWasmBytes
    || metrics.wasmBytes > EXTENDED_LIMITS.maxWasmBytes
    || metrics.bytesRead > EXTENDED_LIMITS.maxReadBytes
    || metrics.maxRead > EXTENDED_LIMITS.maxReadChunk
    || metrics.outputBytes > EXTENDED_LIMITS.maxOutputBytes
    || metrics.instances > 1 || metrics.mountedArchives > 1) limit()
}
