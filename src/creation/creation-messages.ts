import { EncodeError } from './gif/model'
import { CreationSettingsError } from './creation-types'
import { MediaError } from '../media/errors'
import { mediaMessage } from '../i18n/media-errors'
import type { Message, MessageKey } from '../i18n/messages'

/** Extract only codes/numbers, never retain Error.cause or parse its English sentence. */
export function creationMessage(cause: unknown): Message {
  if (cause instanceof CreationSettingsError) return { key: cause.field === 'duration' ? 'errors.creationDuration'
    : cause.field === 'plays' ? 'errors.creationPlayCount' : 'errors.creationLoop' }
  if (cause instanceof EncodeError) {
    const detail = cause.detail
    if (detail?.kind === 'output-side' || detail?.kind === 'output-pixels') return {
      key: 'errors.creationCanvas', params: { width: detail.width, height: detail.height } }
    if (detail?.kind === 'workload') return { key: 'errors.creationWorkload' }
    if (detail?.kind === 'source-count') return { key: 'errors.creationCount' }
    if (detail?.kind === 'source-bytes') return { key: 'errors.creationBytes' }
    const keys = { UNSUPPORTED_INPUT: 'errors.creationUnsupported', ANIMATED_INPUT: 'errors.creationUnsupported',
      CORRUPT_SOURCE: 'errors.creationCorrupt', DECODE_FAILED: 'errors.creationDecode', RESOURCE_LIMIT: 'errors.creationResource',
      QUANTIZATION_FAILED: 'errors.creationPalette', ENCODING_FAILED: 'errors.creationEncode', CANCELLED: 'errors.creationCancelled',
      WORKER_FAILED: 'errors.creationWorker', FILE_READ_FAILED: 'errors.creationRead' } as const satisfies Record<typeof cause.code, MessageKey>
    return { key: keys[cause.code] }
  }
  if (cause instanceof MediaError) return cause.code === 'CORRUPTED_FILE' ? { key: 'errors.creationCorruptMedia' } : mediaMessage(cause)
  return { key: 'errors.creation' }
}
