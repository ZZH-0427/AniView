import { EncodeError, type EncodeLimits } from './model'

/** Product limits apply together; the session supplies this profile to every job. */
export const GIF_CREATION_LIMITS: EncodeLimits = {
  minFrames: 2, maxFrames: 200, maxSourceBytes: 16 * 1024 * 1024,
  maxOutputSide: 2048, maxOutputPixels: 4_194_304, maxFramePixelWork: 15_360_000,
}

/** Historical conformance harness only; never selected by the CreationSession. */
export const SPIKE_ENCODER_LIMITS: EncodeLimits = {
  minFrames: 1, maxFrames: 10_000, maxSourceBytes: 10_000 * 64 * 1024 * 1024,
  maxOutputSide: 16_384, maxOutputPixels: 4_194_304, maxFramePixelWork: 1024 * 1024 * 1024 / 4,
}

export function resolveEncodeLimits(limits: EncodeLimits = SPIKE_ENCODER_LIMITS): EncodeLimits {
  for (const field of Object.keys(SPIKE_ENCODER_LIMITS) as (keyof EncodeLimits)[]) {
    if (!Number.isSafeInteger(limits[field]) || limits[field] < 1
      || (field !== 'minFrames' && limits[field] > SPIKE_ENCODER_LIMITS[field])) throw new EncodeError('RESOURCE_LIMIT')
  }
  if (limits.minFrames > limits.maxFrames) throw new EncodeError('RESOURCE_LIMIT')
  return { ...limits }
}

export function assertSourceLimits(sizes: readonly number[], limits: EncodeLimits) {
  if (sizes.length < limits.minFrames || sizes.length > limits.maxFrames) {
    throw new EncodeError('RESOURCE_LIMIT', { detail: { kind: 'source-count', actual: sizes.length,
      limit: sizes.length < limits.minFrames ? limits.minFrames : limits.maxFrames } })
  }
  let bytes = 0
  for (const size of sizes) {
    if (!Number.isSafeInteger(size) || size <= 0 || size > 64 * 1024 * 1024) throw new EncodeError('RESOURCE_LIMIT')
    bytes += size
    if (!Number.isSafeInteger(bytes)) throw new EncodeError('RESOURCE_LIMIT')
  }
  if (bytes > limits.maxSourceBytes) throw new EncodeError('RESOURCE_LIMIT', {
    detail: { kind: 'source-bytes', actual: bytes, limit: limits.maxSourceBytes },
  })
}

/** Called after oriented metadata scan and before Canvas, quantization or GIF writes. */
export function assertCanvasLimits(width: number, height: number, frameCount: number, limits: EncodeLimits) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || !Number.isSafeInteger(frameCount) || frameCount <= 0) throw new EncodeError('RESOURCE_LIMIT')
  const shared = { width, height, frameCount }
  const checks = [
    { kind: 'output-side', actual: Math.max(width, height), limit: limits.maxOutputSide },
    { kind: 'output-pixels', actual: width * height, limit: limits.maxOutputPixels },
    { kind: 'workload', actual: width * height * frameCount, limit: limits.maxFramePixelWork },
  ] as const
  for (const check of checks) {
    if (!Number.isSafeInteger(check.actual) || check.actual > check.limit) throw new EncodeError('RESOURCE_LIMIT', { detail: { ...check, ...shared } })
  }
}
