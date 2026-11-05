// All numbers are experimental test policy, not approved product limits.
export const limits = Object.freeze({ maxInputBytes: 32 * 1024 ** 2, maxOutputBytes: 8 * 1024 ** 2,
  maxEntries: 1000, maxPathChars: 1024, maxTotalPathChars: 128 * 1024,
  maxDictionaryBytes: 8 * 1024 ** 2, maxReadBytes: 128 * 1024 ** 2, maxOperationMs: 15000 })
export class BackendError extends Error {
  constructor(code) { super(code); this.code = code }
}
export function fail(code) { throw new BackendError(code) }
export function policy(values = {}) {
  const result = { ...limits }
  for (const [key, value] of Object.entries(values)) {
    if (!(key in result) || !Number.isSafeInteger(value) || value < 1 || value > result[key]) fail('ARCHIVE_RESOURCE_LIMIT')
    result[key] = value
  }
  return result
}
export function detect(bytes) {
  const starts = a => a.every((v, i) => bytes[i] === v)
  if (starts([0x37,0x7a,0xbc,0xaf,0x27,0x1c])) return 7
  if (starts([0x52,0x61,0x72,0x21,0x1a,0x07,0x00])) return 4
  if (starts([0x52,0x61,0x72,0x21,0x1a,0x07,0x01,0x00])) return 5
  fail('ARCHIVE_UNSUPPORTED_FORMAT')
}
export function normalizedPath(path, p) {
  if (typeof path !== 'string' || !path || path.length > p.maxPathChars || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(path)) fail('ARCHIVE_UNSAFE_PATH')
  const value = path.replaceAll('\\', '/')
  if (/^\/|^[a-z]:/iu.test(value) || value.split('/').some(x => x === '..' || x === '.')) fail('ARCHIVE_UNSAFE_PATH')
  return value
}
export function numeric(value) {
  if (value === -1) return null
  if (!Number.isSafeInteger(value) || value < 0) fail('ARCHIVE_BACKEND_ERROR')
  return value
}
export function dictionary(method, declared) {
  if (declared !== null) return declared
  // These are engine-reported method fields, not a complete coder-graph memory
  // estimate. Unknown graphs remain null; the compiled heap cap is the fallback.
  const lz = /(?:^|\s)LZMA2?:(\d+)([bkm])?(?=\s|$)/iu.exec(method)
  const rar = /(?:^|:)m\d+:(\d+)([bkm])(?=\s|$)/iu.exec(method)
  const m = lz ?? rar
  if (!m) return null
  const n = Number(m[1]), suffix = m[2]?.toLowerCase()
  const value = suffix ? n * ({ b: 1, k: 1024, m: 1024 ** 2 }[suffix]) : 2 ** n
  return Number.isSafeInteger(value) ? value : null
}
