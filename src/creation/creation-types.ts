import type { VirtualFile } from '../input/virtual-file'
import type { StaticImageFormat } from '../formats/static/static-dimensions'
import type { ConversionFormat, EncoderMetrics } from '../conversion/model'
import type { ConversionProductResult } from '../conversion/conversion-session'
import type { StaticPreparationMetrics } from './static-frame-core'
import type { CreationCleanup } from '../media/creation-cleanup'
import type { Message } from '../i18n/messages'

export interface CreationSettings {
  readonly target: ConversionFormat
  readonly frameDurationMs: number
  readonly loopForever: boolean
  /** Total complete plays; the encoder's extra-repeat field stays internal. */
  readonly playCount: number
}
export interface CreationSource { readonly id: string; readonly file: VirtualFile; readonly format: StaticImageFormat }
type AnimationResult = Extract<ConversionProductResult, { readonly format: ConversionFormat }>
export interface CreationResult extends AnimationResult {
  readonly mime: string
  readonly extension: 'gif' | 'webp' | 'png'
  readonly settings: CreationSettings
  readonly inputFrameCount: number
  readonly metadata: AnimationResult['metadata'] & { readonly durationMs: number; readonly bytes: number }
  readonly metrics: EncoderMetrics
  readonly creationMetrics: { readonly source: StaticPreparationMetrics; readonly totalMs: number; readonly peakRgbaFrames: number; readonly transferredFrames: number }
}
export interface CreationProgress { readonly phase: 'preparing' | 'encoding' | 'finalizing' | 'verifying'; readonly completedFrames: number; readonly totalFrames: number }
export const creationFormats = { gif: { label: 'GIF', mime: 'image/gif', extension: 'gif' },
  webp: { label: 'Animated WebP', mime: 'image/webp', extension: 'webp' }, apng: { label: 'APNG', mime: 'image/png', extension: 'png' } } as const
export type CreationStatus = 'idle' | 'adding' | 'preparing' | 'encoding' | 'finalizing'
  | 'verifying' | 'cancelling' | 'success' | 'cancelled' | 'error'
export interface CreationSnapshot {
  readonly sources: readonly CreationSource[]
  readonly settings: CreationSettings
  readonly status: CreationStatus
  readonly progress?: CreationProgress | undefined
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
  readonly diagnostics: CreationCleanup & { readonly generations: number; readonly completed: number; readonly cancellations: number; readonly jobId: number;
    readonly lastOutputBytes: number; readonly sourceCheckMs?: number }
}

export const DEFAULT_CREATION_SETTINGS: CreationSettings = { target: 'gif', frameDurationMs: 500, loopForever: true, playCount: 1 }
export const isCreationBusy = (status: CreationStatus) => ['adding', 'preparing', 'encoding', 'finalizing', 'verifying', 'cancelling'].includes(status)

export class CreationSettingsError extends Error {
  constructor(readonly field: 'duration' | 'plays' | 'loop' | 'target', message: string) { super(message); this.name = 'CreationSettingsError' }
}

export function normalizeCreationSettings(settings: CreationSettings): CreationSettings {
  if (!['gif', 'webp', 'apng'].includes(settings.target)) throw new CreationSettingsError('target', 'Choose a supported animation format.')
  if (!Number.isFinite(settings.frameDurationMs) || settings.frameDurationMs < 20 || settings.frameDurationMs > 10000) {
    throw new CreationSettingsError('duration', 'Choose a frame duration from 20 to 10000 ms.')
  }
  if (!Number.isInteger(settings.playCount) || settings.playCount < 1 || settings.playCount > 100) {
    throw new CreationSettingsError('plays', 'Choose a play count from 1 to 100.')
  }
  if (typeof settings.loopForever !== 'boolean') throw new CreationSettingsError('loop', 'Choose a valid loop setting.')
  return { ...settings, frameDurationMs: Math.round(settings.frameDurationMs / 10) * 10 }
}
