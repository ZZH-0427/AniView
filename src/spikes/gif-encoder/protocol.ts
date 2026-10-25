import type { EncodeErrorCode, EncodeOptions, EncodeProgress, EncodedGif } from './model'

export type EncoderRequest =
  | { readonly type: 'start'; readonly id: number; readonly sizes: readonly number[]; readonly options: EncodeOptions }
  | { readonly type: 'source'; readonly id: number; readonly index: number; readonly data: ArrayBuffer }
  | { readonly type: 'source-error'; readonly id: number }
  | { readonly type: 'cancel'; readonly id: number }

export type EncoderResponse =
  | { readonly type: 'read'; readonly id: number; readonly index: number }
  | { readonly type: 'progress'; readonly id: number; readonly progress: EncodeProgress }
  | { readonly type: 'result'; readonly id: number; readonly result: EncodedGif }
  | { readonly type: 'error'; readonly id: number; readonly code: EncodeErrorCode }

export interface EncoderWorkerPort {
  onmessage: ((event: MessageEvent<EncoderResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(message: EncoderRequest, transfer?: Transferable[]): void
  terminate(): void
}
