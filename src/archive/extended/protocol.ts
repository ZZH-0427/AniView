import type { MediaErrorCode } from '../../media/errors'

export type ExtendedArchiveKind = 4 | 5 | 7

/** Nullable native properties are unknown, never an invented zero. */
export interface ExtendedEntry {
  readonly id: number
  readonly path: string
  readonly normalizedPath: string
  readonly isDirectory: boolean
  readonly isFile: boolean
  readonly size: number | null
  readonly packedSize: number | null
  readonly encrypted: boolean | null
  readonly solid: boolean | null
  readonly method: string
  readonly attributes: number | null
  readonly dictionaryBytes: number | null
  readonly block: number | null
  readonly special: boolean
}

export interface ExtendedNativeMetrics {
  readonly wasmBytes: number
  readonly wasmMaximum: number
  readonly ranges: number
  readonly bytesRead: number
  readonly maxRead: number
  readonly outputBytes: number
  readonly mountedArchives: number
  readonly instances: number
}
export interface ExtendedOpenResult {
  readonly entries: readonly ExtendedEntry[]
  readonly metrics: ExtendedNativeMetrics
}
export interface ExtendedExtractResult {
  readonly data: ArrayBuffer
  readonly metrics: ExtendedNativeMetrics
}

export type ExtendedCommand =
  | { readonly type: 'open'; readonly source: Blob; readonly password?: string }
  | { readonly type: 'extract'; readonly entryId: number; readonly password?: string }
  | { readonly type: 'list' }
  | { readonly type: 'metrics' }
export type ExtendedRequest = ExtendedCommand & { readonly generation: number; readonly id: number }
export type ExtendedPhase = 'loading' | 'opening' | 'listing' | 'extracting'
export type ExtendedResponse = { readonly generation: number; readonly id: number } & (
  | { readonly type: 'progress'; readonly phase: ExtendedPhase }
  | { readonly type: 'ready'; readonly result: ExtendedOpenResult }
  | { readonly type: 'extracted'; readonly result: ExtendedExtractResult }
  | { readonly type: 'listed'; readonly entries: readonly ExtendedEntry[] }
  | { readonly type: 'metrics'; readonly metrics: ExtendedNativeMetrics }
  | { readonly type: 'error'; readonly code: MediaErrorCode }
)

export const EMPTY_NATIVE_METRICS: ExtendedNativeMetrics = Object.freeze({
  wasmBytes: 0, wasmMaximum: 67108864, ranges: 0, bytesRead: 0, maxRead: 0,
  outputBytes: 0, mountedArchives: 0, instances: 0,
})
