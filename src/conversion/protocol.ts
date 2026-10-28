import type { CanonicalAnimationFrame, CanonicalAnimationMetadata, ConversionErrorCode, ConversionFormat, EncoderMetrics, EncoderResult } from './model'

export type EncoderRequest =
  | { readonly id: number; readonly type: 'open'; readonly target: ConversionFormat; readonly metadata: CanonicalAnimationMetadata }
  | { readonly id: number; readonly type: 'frame'; readonly frame: CanonicalAnimationFrame }
  | { readonly id: number; readonly type: 'finish' | 'close' }
export type EncoderResponse =
  | { readonly id: number; readonly type: 'ready'; readonly capabilities: { readonly deflate: boolean } }
  | { readonly id: number; readonly type: 'accepted'; readonly metrics: EncoderMetrics }
  | { readonly id: number; readonly type: 'result'; readonly result: EncoderResult }
  | { readonly id: number; readonly type: 'closed' }
  | { readonly id: number; readonly type: 'error'; readonly code: ConversionErrorCode }
