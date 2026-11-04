import type { StaticAnimationOutput } from './static-animation-encoder'
import type { StaticPreparationMetrics } from './static-frame-core'
export const preparationMetrics = (width = 2, height = 1, frameCount = 2): StaticPreparationMetrics => ({
  width, height, frameCount, sourceBytes: 20, decodeMs: 1, sourceReadMs: 1, identifyMs: 1, composeMs: 1,
  checkpointMs: 1, checkpointCount: 4, peakBitmaps: 1, peakRgbaFrames: 1, peakFrameBytes: width * height * 4,
})
export const creationOutput = (width = 2, height = 1, frameCount = 2, bytes = 6): StaticAnimationOutput => ({
  data: new ArrayBuffer(bytes), byteLength: bytes, input: { width, height, frameCount, playCount: 0 },
  sourceMetrics: preparationMetrics(width, height, frameCount), totalMs: 4, peakRgbaFrames: 1, transferredFrames: frameCount,
  metrics: { encodeMs: 1, outputBytes: bytes, outputCapacity: bytes },
})
