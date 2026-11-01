import type { VirtualFile } from '../input/virtual-file'
import type { StaticImageFormat } from '../formats/static/static-dimensions'
import type { EncodeMetrics, EncodeProgress } from './gif/model'
import type { Message } from '../i18n/messages'

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
  readonly filename: string
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
  readonly addingProgress?: { readonly current: number; readonly total: number } | undefined
  readonly result?: CreationResult | undefined
  readonly error?: string | undefined
  /** Locale-neutral presentation data; legacy English text remains available to callers. */
  readonly errorMessage?: Message | undefined
  readonly noticeMessage?: Message | undefined
  readonly noticeReasons?: readonly Message[] | undefined
  readonly rejectedCount?: number | undefined
  readonly notice: string
  readonly totalSourceBytes: number
  readonly diagnostics: { readonly generations: number; readonly cancellations: number; readonly lastOutputBytes: number; readonly sourceCheckMs?: number }
}

export const DEFAULT_CREATION_SETTINGS: CreationSettings = { frameDurationMs: 500, loopForever: true, playCount: 1 }
export const isCreationBusy = (status: CreationStatus) => ['adding', 'preparing', 'encoding', 'finalizing', 'cancelling'].includes(status)

export class CreationSettingsError extends Error {
  constructor(readonly field: 'duration' | 'plays' | 'loop', message: string) { super(message); this.name = 'CreationSettingsError' }
}

export function normalizeCreationSettings(settings: CreationSettings): CreationSettings {
  if (!Number.isFinite(settings.frameDurationMs) || settings.frameDurationMs < 20 || settings.frameDurationMs > 10000) {
    throw new CreationSettingsError('duration', 'Choose a frame duration from 20 to 10000 ms.')
  }
  if (!Number.isInteger(settings.playCount) || settings.playCount < 1 || settings.playCount > 100) {
    throw new CreationSettingsError('plays', 'Choose a play count from 1 to 100.')
  }
  if (typeof settings.loopForever !== 'boolean') throw new CreationSettingsError('loop', 'Choose a valid loop setting.')
  return { ...settings, frameDurationMs: Math.round(settings.frameDurationMs / 10) * 10 }
}
