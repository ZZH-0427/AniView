import { MediaError } from '../../media/errors'
import type { MediaErrorCode } from '../../media/errors'
import type { SevenZipRuntime } from './native-types'

const nativeCodes: readonly MediaErrorCode[] = ['ARCHIVE_BACKEND_ERROR', 'ARCHIVE_CORRUPTED', 'ARCHIVE_ENCRYPTED',
  'ARCHIVE_WRONG_PASSWORD', 'ARCHIVE_LIMIT_EXCEEDED', 'ARCHIVE_UNSUPPORTED_METHOD',
  'ARCHIVE_BACKEND_ERROR', 'ARCHIVE_PASSWORD_OR_CORRUPTED', 'ARCHIVE_UNSUPPORTED']

export function nativeOutcome(code: number): void {
  if (code !== 0) throw new MediaError(nativeCodes[code] ?? 'ARCHIVE_BACKEND_ERROR')
}

/** A BSTR can contain NUL. Native rejection must precede C-string conversion. */
export function readNativeText(runtime: SevenZipRuntime, index: number, property: number): string {
  const pointer = runtime._av_string(index, property)
  nativeOutcome(runtime._av_last())
  return runtime.UTF8ToString(pointer)
}
