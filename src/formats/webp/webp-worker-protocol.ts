import type { MediaErrorCode } from '../../media/errors'

export interface WebPMetadata {
  readonly width: number
  readonly height: number
  readonly frameCount: number
  /** Raw libwebp loop count; 0 means infinite. Not yet a production animation adapter. */
  readonly loopCount: number
}

export type WorkerRequest =
  | { readonly id: number; readonly type: 'open'; readonly data: ArrayBuffer }
  | { readonly id: number; readonly type: 'next' | 'reset' | 'close' }

export type WorkerResponse =
  | { readonly id: number; readonly type: 'ready'; readonly metadata: WebPMetadata; readonly wasmReadyMs: number; readonly heapBytes: number }
  | { readonly id: number; readonly type: 'frame'; readonly frameIndex: number; readonly durationMs: number; readonly width: number; readonly height: number; readonly rgba: ArrayBuffer; readonly decodeMs: number; readonly heapBytes: number }
  | { readonly id: number; readonly type: 'end' | 'reset' | 'closed' }
  | { readonly id: number; readonly type: 'error'; readonly code: MediaErrorCode }

export type FrameResponse = Extract<WorkerResponse, { type: 'frame' }>

export function frameDuration(timestamp: number, previous: number): number {
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(previous) || timestamp < previous || previous < 0) {
    throw new Error('Invalid libwebp frame timestamp')
  }
  return timestamp - previous
}
