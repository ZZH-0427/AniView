import type { VirtualFile } from '../input/virtual-file'
import type { StaticImageFormat } from '../formats/static/static-dimensions'
import type { EncodeMetrics, EncodeProgress } from './gif/model'

export interface CreationSettings {
  readonly frameDurationMs: number
  readonly loopForever: boolean
  /** Total complete plays; the encoder's extra-repeat field stays internal. */
  readonly playCount: number
}
export interface CreationSource { readonly id: string; readonly file: VirtualFile; readonly format: StaticImageFormat }
export interface CreationResult {
  readonly blob: Blob
  readonly url: string
  readonly metadata: CreationSettings & { readonly width: number; readonly height: number; readonly frameCount: number; readonly bytes: number }
  readonly metrics: EncodeMetrics
}
export type CreationStatus = 'idle' | 'adding' | 'preparing' | 'encoding' | 'finalizing'
  | 'cancelling' | 'success' | 'cancelled' | 'error'
export interface CreationSnapshot {
  readonly sources: readonly CreationSource[]
  readonly settings: CreationSettings
  readonly status: CreationStatus
  readonly progress?: EncodeProgress | undefined
  readonly result?: CreationResult | undefined
  readonly error?: string | undefined
  readonly notice: string
  readonly totalSourceBytes: number
  readonly diagnostics: { readonly generations: number; readonly cancellations: number; readonly lastOutputBytes: number }
}

export const DEFAULT_CREATION_SETTINGS: CreationSettings = { frameDurationMs: 500, loopForever: true, playCount: 1 }
export const isCreationBusy = (status: CreationStatus) => ['adding', 'preparing', 'encoding', 'finalizing', 'cancelling'].includes(status)

export function normalizeCreationSettings(settings: CreationSettings): CreationSettings {
  if (!Number.isFinite(settings.frameDurationMs) || settings.frameDurationMs < 20 || settings.frameDurationMs > 10000) {
    throw new Error('Choose a frame duration from 20 to 10000 ms.')
  }
  if (!Number.isInteger(settings.playCount) || settings.playCount < 1 || settings.playCount > 100) {
    throw new Error('Choose a play count from 1 to 100.')
  }
  if (typeof settings.loopForever !== 'boolean') throw new Error('Choose a valid loop setting.')
  return { ...settings, frameDurationMs: Math.round(settings.frameDurationMs / 10) * 10 }
}
