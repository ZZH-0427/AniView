import type { MediaErrorCode } from '../../media/errors'

export interface APNGMetadata {
  readonly width: number
  readonly height: number
  readonly frameCount: number
  readonly loopCount: number
}
export type APNGRequest =
  | { readonly id: number; readonly type: 'open'; readonly data: ArrayBuffer }
  | { readonly id: number; readonly type: 'next' | 'reset' | 'close' }
export type APNGResponse =
  | { readonly id: number; readonly type: 'ready'; readonly metadata: APNGMetadata; readonly readyMs: number }
  | { readonly id: number; readonly type: 'frame'; readonly frameIndex: number; readonly width: number; readonly height: number;
      readonly durationMs: number; readonly rgba: ArrayBuffer; readonly decodeMs: number;
      readonly liveBitmaps: number; readonly backupBytes: number }
  | { readonly id: number; readonly type: 'end' | 'reset' | 'closed' }
  | { readonly id: number; readonly type: 'error'; readonly code: MediaErrorCode }
