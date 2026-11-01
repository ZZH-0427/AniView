import { MediaError } from '../media/errors'
import type { MediaErrorCode } from '../media/errors'
import type { Message, MessageKey } from './messages'

const keys = {
  STATIC_IMAGE_RUNTIME_UNAVAILABLE: 'errors.media.staticRuntime', VIEWER_RUNTIME_UNAVAILABLE: 'errors.media.viewerRuntime',
  UNSUPPORTED_FORMAT: 'errors.media.unsupported', CORRUPTED_FILE: 'errors.media.corrupt', DECODE_FAILED: 'errors.media.decode',
  ARCHIVE_CORRUPTED: 'errors.media.archiveCorrupt', ARCHIVE_ENCRYPTED: 'errors.media.encrypted',
  ARCHIVE_UNSUPPORTED: 'errors.media.archiveUnsupported', ARCHIVE_INVALID: 'errors.media.archiveInvalid',
  ARCHIVE_LIMIT_EXCEEDED: 'errors.media.archiveLimit', ARCHIVE_ENTRY_TOO_LARGE: 'errors.media.entryLarge',
  ARCHIVE_CLOSED: 'errors.media.archiveClosed', ARCHIVE_WRONG_PASSWORD: 'errors.media.password',
  OUT_OF_MEMORY: 'errors.media.memory', RESOURCE_LIMIT_EXCEEDED: 'errors.media.limit', WORKER_FAILED: 'errors.media.worker',
  WASM_UNAVAILABLE: 'errors.media.wasm', FILE_READ_FAILED: 'errors.media.read', APNG_RUNTIME_UNAVAILABLE: 'errors.media.apngRuntime',
  GIF_RUNTIME_UNAVAILABLE: 'errors.media.gifRuntime', STATIC_PNG_NOT_ANIMATED: 'errors.media.staticUnavailable', STATIC_IMAGE_NOT_AVAILABLE: 'errors.media.staticUnavailable',
} satisfies Record<MediaErrorCode, MessageKey>
export const mediaMessage = (cause: unknown, fallback: MessageKey = 'errors.viewer'): Message => ({
  key: cause instanceof MediaError ? keys[cause.code] ?? fallback : fallback,
})
