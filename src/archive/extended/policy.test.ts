import { describe, expect, it } from 'vitest'
import { assertActualOutput, assertExtendedEntries, assertExtendedExtraction, assertExtendedInput,
  assertSourceRead, detectExtendedSignature, extendedDeadline, extendedPath, EXTENDED_LIMITS,
  methodDictionary, nativeBoolean, nativeNumber } from './policy'
import type { ExtendedEntry } from './protocol'

const entry = (values: Partial<ExtendedEntry> = {}): ExtendedEntry => ({ id: 0, path: 'frame.gif', normalizedPath: 'frame.gif',
  isDirectory: false, isFile: true, size: null, packedSize: null, encrypted: null, solid: null, method: '',
  attributes: null, dictionaryBytes: null, block: null, special: false, ...values })

describe('frozen extended archive product boundaries', () => {
  it.each([EXTENDED_LIMITS.maxInputBytes - 1, EXTENDED_LIMITS.maxInputBytes])('accepts input bytes %i', size => {
    expect(() => assertExtendedInput(size)).not.toThrow()
  })
  it('rejects input one byte over 15 MiB', () => {
    expect(() => assertExtendedInput(15 * 1024 ** 2 + 1)).toThrow(expect.objectContaining({ code: 'ARCHIVE_LIMIT_EXCEEDED' }))
  })
  it.each([EXTENDED_LIMITS.maxOutputBytes - 1, EXTENDED_LIMITS.maxOutputBytes])('accepts declared and actual output %i', size => {
    expect(() => assertExtendedExtraction(entry({ size }))).not.toThrow()
    expect(() => assertActualOutput(size)).not.toThrow()
  })
  it('rejects declared and actual output one byte over 4 MiB', () => {
    expect(() => assertExtendedExtraction(entry({ size: 4 * 1024 ** 2 + 1 }))).toThrow()
    expect(() => assertActualOutput(4 * 1024 ** 2 + 1)).toThrow()
  })
  it.each([4 * 1024 ** 2 - 1, 4 * 1024 ** 2, null])('allows known dictionary boundary or honestly unknown %s', dictionaryBytes => {
    expect(() => assertExtendedExtraction(entry({ dictionaryBytes }))).not.toThrow()
  })
  it('rejects known dictionary one byte over limit and parses only recognized metadata', () => {
    expect(() => assertExtendedExtraction(entry({ dictionaryBytes: 4 * 1024 ** 2 + 1 }))).toThrow()
    expect(methodDictionary('LZMA2:22', null)).toBe(4 * 1024 ** 2)
    expect(methodDictionary('LZMA:4m', null)).toBe(4 * 1024 ** 2)
    expect(methodDictionary('v6:m5:128K', null)).toBe(128 * 1024)
    expect(methodDictionary('opaque-coder', null)).toBeNull()
  })
  it.each(['LZMA2:999999', 'LZMA:99999999999999999999999m', 'v6:m5:99999999999999999999999k'])('rejects overflowing recognized dictionary %s rather than claiming unknown', method => {
    expect(() => methodDictionary(method, null)).toThrow(expect.objectContaining({ code: 'ARCHIVE_LIMIT_EXCEEDED' }))
  })
  it('accepts 999/1000 entries and rejects 1001', () => {
    const entries = Array.from({ length: 1001 }, (_, id) => entry({ id }))
    expect(() => assertExtendedEntries(entries.slice(0, 999))).not.toThrow()
    expect(() => assertExtendedEntries(entries.slice(0, 1000))).not.toThrow()
    expect(() => assertExtendedEntries(entries)).toThrow()
  })
  it('accepts path 1023/1024 code units and rejects 1025', () => {
    for (const size of [1023, 1024]) expect(extendedPath('a'.repeat(size))).toHaveLength(size)
    expect(() => extendedPath('a'.repeat(1025))).toThrow()
  })
  it('accepts cumulative path text exactly 128 Ki chars and rejects one over', () => {
    const path = 'a'.repeat(1024)
    const entries = Array.from({ length: 128 }, (_, id) => entry({ id, path, normalizedPath: path }))
    const below = entries.map((e, id) => id ? e : { ...e, path: path.slice(1), normalizedPath: path.slice(1) })
    expect(() => assertExtendedEntries(below)).not.toThrow()
    expect(() => assertExtendedEntries(entries)).not.toThrow()
    expect(() => assertExtendedEntries([...entries, entry({ id: 128, path: 'x', normalizedPath: 'x' })])).toThrow()
  })
  it('enforces exact 1 MiB read chunk and 128 MiB cumulative source reads', () => {
    const chunk = 1024 ** 2, total = 128 * chunk
    expect(() => assertSourceRead(total - chunk, chunk)).not.toThrow()
    expect(() => assertSourceRead(total - chunk - 1, chunk)).not.toThrow()
    expect(() => assertSourceRead(total - chunk + 1, chunk)).toThrow()
    expect(() => assertSourceRead(0, chunk + 1)).toThrow()
  })
  it('allows deadline shortening and rejects raises beyond 15 s', () => {
    expect(extendedDeadline()).toBe(15000)
    expect(extendedDeadline(1)).toBe(1)
    expect(() => extendedDeadline(15001)).toThrow()
  })
})

describe('untrusted metadata and whitelist', () => {
  it.each(['../x', '/x', 'C:/x', 'nested/C:/x', '\\\\host\\x', 'x\u0000.png', 'x\n.png', 'x\u0080.png', 'x//y', './x'])('rejects unsafe path %j', path => {
    expect(() => extendedPath(path)).toThrow()
  })
  it('preserves valid Unicode paths and duplicate names by separate IDs', () => {
    const path = '中文/日本語/😀 space=a:b.gif'
    expect(extendedPath(path)).toBe(path)
    expect(() => assertExtendedEntries([entry({ path, normalizedPath: path }), entry({ id: 1, path, normalizedPath: path })])).not.toThrow()
    expect(() => assertExtendedEntries([entry(), entry()])).toThrow()
  })
  it.each([-2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 0.5])('rejects unsafe numeric %s', value => {
    expect(() => nativeNumber(value)).toThrow()
  })
  it('retains nullable native metadata and rejects invalid boolean', () => {
    expect(nativeNumber(-1)).toBeNull()
    expect(nativeBoolean(-1)).toBeNull()
    expect(nativeBoolean(0)).toBe(false)
    expect(nativeBoolean(1)).toBe(true)
    expect(() => nativeBoolean(2)).toThrow()
  })
  it('refuses directories and link/special file extraction', () => {
    expect(() => assertExtendedExtraction(entry({ isFile: false, isDirectory: true }))).toThrow()
    expect(() => assertExtendedExtraction(entry({ isFile: false, special: true }))).toThrow()
  })
  it.each([
    [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], 7],
    [[0x52, 0x61, 0x72, 0x21, 0x1a, 7, 0], 4],
    [[0x52, 0x61, 0x72, 0x21, 0x1a, 7, 1, 0], 5],
  ] as const)('recognizes signature %j', (signature, expected) => {
    expect(detectExtendedSignature(new Uint8Array(signature))).toBe(expected)
  })
  it.each([[0x50, 0x4b, 3, 4], [], [1, 2, 3], [0x4d, 0x5a]].map(signature => ({ signature })))('rejects ZIP, random, truncated and SFX $signature', ({ signature }) => {
    expect(() => detectExtendedSignature(new Uint8Array(signature))).toThrow(expect.objectContaining({ code: 'ARCHIVE_UNSUPPORTED_FORMAT' }))
  })
})
