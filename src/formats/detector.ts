import type { VirtualFile } from '../input/virtual-file'

/** Binary evidence is authoritative; extensions and MIME types are only hints. */
export type DetectedFormat =
  | { readonly kind: 'webp'; readonly animated: boolean }
  | { readonly kind: 'apng' | 'gif'; readonly animated: true }
  | { readonly kind: 'png' | 'jpeg'; readonly animated: false }
  | { readonly kind: 'zip' | 'unknown' }

export interface FormatDetector {
  detect(file: VirtualFile, signal?: AbortSignal): Promise<DetectedFormat>
}
