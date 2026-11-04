import type { CanonicalAnimationFrame, CanonicalAnimationMetadata } from '../conversion/model'
import type { EncodeErrorCode, EncodeErrorDetail } from './gif/model'
import type { StaticOwnership, StaticPreparationMetrics } from './static-frame-core'

export type StaticSourceRequest =
  | { readonly type: 'open'; readonly id: number; readonly job: number; readonly sizes: readonly number[]; readonly durationMs: number; readonly playCount: number }
  | { readonly type: 'next' | 'ack' | 'reset' | 'close'; readonly id: number; readonly job: number }
  | { readonly type: 'source'; readonly job: number; readonly readId: number; readonly data: ArrayBuffer }
  | { readonly type: 'source-error'; readonly job: number; readonly readId: number }
interface Snapshot { readonly metrics: StaticPreparationMetrics; readonly resources: StaticOwnership }
export type StaticSourceResponse =
  | { readonly type: 'read'; readonly job: number; readonly readId: number; readonly index: number }
  | { readonly type: 'progress'; readonly job: number; readonly completed: number; readonly total: number }
  | ({ readonly type: 'ready'; readonly job: number; readonly id: number; readonly metadata: CanonicalAnimationMetadata } & Snapshot)
  | ({ readonly type: 'frame'; readonly job: number; readonly id: number; readonly frame: CanonicalAnimationFrame } & Snapshot)
  | ({ readonly type: 'acknowledged' | 'reset' | 'end'; readonly job: number; readonly id: number } & Snapshot)
  | { readonly type: 'closed'; readonly job: number; readonly id: number; readonly resources: StaticOwnership }
  | { readonly type: 'error'; readonly job: number; readonly id: number; readonly code: EncodeErrorCode; readonly detail?: EncodeErrorDetail }
export interface StaticSourcePort {
  onmessage: ((event: MessageEvent<StaticSourceResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(message: StaticSourceRequest, transfer?: Transferable[]): void
  terminate(): void
}
