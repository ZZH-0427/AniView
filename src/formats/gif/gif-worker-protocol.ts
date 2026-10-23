import type { MediaErrorCode } from '../../media/errors'

export interface GIFMetadata {
  readonly width: number
  readonly height: number
  readonly frameCount: number
  readonly loopCount: number
}
export type GIFRequest =
  | { readonly id: number; readonly type: 'open'; readonly data: ArrayBuffer }
  | { readonly id: number; readonly type: 'next' | 'reset' | 'close' }
export type GIFResponse =
  | { readonly id: number; readonly type: 'ready'; readonly metadata: GIFMetadata; readonly readyMs: number }
  | { readonly id: number; readonly type: 'frame'; readonly frameIndex: number; readonly width: number; readonly height: number;
      readonly durationMs: number; readonly rgba: ArrayBuffer; readonly decodeMs: number;
      readonly liveBitmaps: number; readonly backupBytes: number }
  | { readonly id: number; readonly type: 'end' | 'reset' | 'closed' }
  | { readonly id: number; readonly type: 'error'; readonly code: MediaErrorCode }
