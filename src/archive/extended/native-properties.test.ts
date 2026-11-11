import { describe, expect, it, vi } from 'vitest'
import { nativeOutcome, readNativeText } from './native-properties'
import type { SevenZipRuntime } from './native-types'

function runtime(last: number): SevenZipRuntime {
  return { FS: { mkdir() {}, mount() {} }, WORKERFS: {}, ccall() { return 0 },
    _av_last() { return last }, _av_string() { return 123 }, UTF8ToString: vi.fn(() => 'valid-name.gif'),
    _av_count() { return 1 }, _av_number() { return -1 }, _av_output() { return 0 }, _av_length() { return 0 }, _av_release() {} }
}

describe('structured native text boundary', () => {
  it('reads a native property only after its status is accepted', () => {
    const value = runtime(0)
    expect(readNativeText(value, 1, 3)).toBe('valid-name.gif')
    expect(value.UTF8ToString).toHaveBeenCalledWith(123)
  })
  it('refuses native embedded-NUL metadata before a C-string can truncate it', () => {
    const value = runtime(8)
    expect(() => readNativeText(value, 1, 3)).toThrow(expect.objectContaining({ code: 'ARCHIVE_UNSUPPORTED' }))
    expect(value.UTF8ToString).not.toHaveBeenCalled()
  })
  it.each([9, -1, NaN])('normalizes unknown native status %s', code => {
    expect(() => nativeOutcome(code)).toThrow(expect.objectContaining({ code: 'ARCHIVE_BACKEND_ERROR' }))
  })
})
