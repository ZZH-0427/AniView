/** Research contract only; not imported by the AniView application. */
export type ArchiveKind = 4 | 5 | 7
export interface EntryMetadata {
  id: number
  path: string
  normalizedPath: string
  isDirectory: boolean
  isFile: boolean
  size: number | null
  packedSize: number | null
  encrypted: 0 | 1 | null
  solid: 0 | 1 | null
  method: string
  attributes: number | null
  dictionaryBytes: number | null
  block: number | null
  special: boolean
}
export interface BackendLimits {
  maxInputBytes: number
  maxOutputBytes: number
  maxEntries: number
  maxPathChars: number
  maxTotalPathChars: number
  maxDictionaryBytes: number
  maxReadBytes: number
  maxOperationMs: number
}
export interface NativeMetrics {
  wasmBytes: number
  wasmMaximum: number
  ranges: number
  bytesRead: number
  maxRead: number
  outputBytes: number
  mountedArchives: number
  instances: number
}
export interface ExtendedArchiveBackend {
  open(source: Blob, options?: { password?: string }, progress?: (phase: string) => void): Promise<{
    kind: ArchiveKind; count: number; entries: EntryMetadata[]; metrics: NativeMetrics
  }>
  listEntries(): Promise<EntryMetadata[]>
  extractEntry(id: number, options?: { password?: string }, progress?: (phase: string) => void): Promise<{ data: ArrayBuffer; metrics: NativeMetrics }>
  cancel(): Promise<void>
  close(): Promise<void>
  getMetrics(): { workersCreated: number; workersTerminated: number; activeWorkers: number; staleMessages: number }
  getTrace(): Array<{ event: string; elapsedMs: number; generation: number; [key: string]: string | number }>
}
export type RequestType = 'OPEN' | 'LIST' | 'EXTRACT' | 'METRICS'
// CANCEL/CLOSE are local coordinator operations: a synchronous native call cannot
// receive a queued Worker message. They terminate the Worker and settle requests.
export type WorkerEnvelope = { generation: number; requestId: number; type: RequestType }
export type WorkerOutcome = 'RESULT' | 'PROGRESS' | 'ERROR'
