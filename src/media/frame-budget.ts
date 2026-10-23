import { MediaError } from './errors'

export const DEFAULT_FRAME_CACHE_BYTES = 16 * 1024 * 1024
/** Automatic growth only makes room for current + next; never exceeds 32 MiB. */
export const MAX_AUTOMATIC_FRAME_CACHE_BYTES = 32 * 1024 * 1024
export const MAX_AUTOMATIC_FRAME_BYTES = MAX_AUTOMATIC_FRAME_CACHE_BYTES / 2

export function decodedFrameBytes(width: number, height: number) {
  const bytes = width * height * 4
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || !Number.isSafeInteger(bytes)) throw new MediaError('CORRUPTED_FILE')
  return bytes
}

/** Explicit caller budgets stay strict; default policy works for every decoder. */
export function frameCacheBudget(frameBytes: number, configuredMaxBytes?: number) {
  if (!Number.isSafeInteger(frameBytes) || frameBytes <= 0) throw new MediaError('CORRUPTED_FILE')
  const required = frameBytes * 2
  const maxBytes = configuredMaxBytes ?? Math.max(DEFAULT_FRAME_CACHE_BYTES, required)
  if (!Number.isSafeInteger(required) || required > maxBytes
    || (configuredMaxBytes === undefined && maxBytes > MAX_AUTOMATIC_FRAME_CACHE_BYTES)) {
    throw new MediaError('RESOURCE_LIMIT_EXCEEDED')
  }
  return maxBytes
}
