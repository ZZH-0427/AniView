import { MediaError } from '../../media/errors'
export function normalizeGifFrameDuration(delay: number) {
  if (!Number.isInteger(delay) || delay < 0 || delay > 65535) throw new MediaError('CORRUPTED_FILE')
  return delay < 2 ? 100 : delay * 10
}
/** Netscape counter is repeats AFTER the first play; no extension plays once. */
export function normalizeGifLoop(repeats: number | null) {
  if (repeats === null) return 1
  if (!Number.isInteger(repeats) || repeats < 0 || repeats > 65535) throw new MediaError('CORRUPTED_FILE')
  return repeats === 0 ? 0 : repeats + 1
}
