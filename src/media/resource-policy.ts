import { MediaError } from './errors'
import { MAX_AUTOMATIC_FRAME_BYTES } from './frame-budget'

/** Static media shares the established decoder source/pixel ceilings. */
export const MEDIA_RESOURCE_LIMITS = {
  maxEncodedBytes: 64 * 1024 * 1024,
  maxDimension: 16_384,
  maxPixels: MAX_AUTOMATIC_FRAME_BYTES / 4,
} as const

export function assertMediaEncodedSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 0) throw new MediaError('FILE_READ_FAILED')
  if (size > MEDIA_RESOURCE_LIMITS.maxEncodedBytes) throw new MediaError('RESOURCE_LIMIT_EXCEEDED')
}

export function assertMediaDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new MediaError('CORRUPTED_FILE')
  }
  if (width > MEDIA_RESOURCE_LIMITS.maxDimension || height > MEDIA_RESOURCE_LIMITS.maxDimension
    || width * height > MEDIA_RESOURCE_LIMITS.maxPixels) throw new MediaError('RESOURCE_LIMIT_EXCEEDED')
}
