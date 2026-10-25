import { describe, expect, it } from 'vitest'
import { assertCanvasLimits, assertSourceLimits, GIF_CREATION_LIMITS, resolveEncodeLimits, SPIKE_ENCODER_LIMITS } from './gif-validation'

describe('GIF creation resource policy', () => {
  it('accepts both frame-count boundaries without dropping duplicates', () => {
    expect(() => assertSourceLimits([8, 8], GIF_CREATION_LIMITS)).not.toThrow()
    expect(() => assertSourceLimits(Array.from({ length: 200 }, () => 8), GIF_CREATION_LIMITS)).not.toThrow()
  })
  it.each([0, 1, 201])('rejects %i sources with a specific frame-count detail', count => {
    expect(() => assertSourceLimits(Array.from({ length: count }, () => 8), GIF_CREATION_LIMITS))
      .toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT', detail: { kind: 'source-count', actual: count, limit: count < 2 ? 2 : 200 } }))
  })
  it('accepts the exact total-source-byte limit and rejects one byte more', () => {
    expect(() => assertSourceLimits([8 * 1024 * 1024, 8 * 1024 * 1024], GIF_CREATION_LIMITS)).not.toThrow()
    expect(() => assertSourceLimits([8 * 1024 * 1024, 8 * 1024 * 1024 + 1], GIF_CREATION_LIMITS)).toThrow(expect.objectContaining({
      code: 'RESOURCE_LIMIT', detail: { kind: 'source-bytes', actual: 16 * 1024 * 1024 + 1, limit: 16 * 1024 * 1024 },
    }))
  })
  it.each([0, -1, NaN, Infinity, 1.5, 64 * 1024 * 1024 + 1])('rejects malformed or excessive source size %s', size => {
    expect(() => assertSourceLimits([8, size], GIF_CREATION_LIMITS)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT' }))
  })
  it('accepts the exact output side/pixel boundary when workload also fits', () => {
    expect(() => assertCanvasLimits(2048, 2048, 2, GIF_CREATION_LIMITS)).not.toThrow()
    expect(() => assertCanvasLimits(2048, 2048, 3, GIF_CREATION_LIMITS)).not.toThrow()
  })
  it('rejects output side overflow with actual canvas dimensions', () => {
    expect(() => assertCanvasLimits(2049, 1024, 2, GIF_CREATION_LIMITS)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT',
      detail: { kind: 'output-side', width: 2049, height: 1024, frameCount: 2, actual: 2049, limit: 2048 } }))
  })
  it('independently enforces the output-pixel boundary', () => {
    const limits = { ...GIF_CREATION_LIMITS, maxOutputSide: 4096 }
    expect(() => assertCanvasLimits(2048, 2048, 2, limits)).not.toThrow()
    expect(() => assertCanvasLimits(2048, 2049, 2, limits)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT',
      detail: { kind: 'output-pixels', width: 2048, height: 2049, frameCount: 2, actual: 2048 * 2049, limit: 4_194_304 } }))
  })
  it('accepts exact frame-pixel work and rejects one additional frame', () => {
    expect(() => assertCanvasLimits(320, 240, 200, GIF_CREATION_LIMITS)).not.toThrow()
    expect(() => assertCanvasLimits(320, 240, 201, GIF_CREATION_LIMITS)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT',
      detail: { kind: 'workload', width: 320, height: 240, frameCount: 201, actual: 15_436_800, limit: 15_360_000 } }))
  })
  it('rejects four 2048² frames despite valid side/pixel limits', () => {
    expect(() => assertCanvasLimits(2048, 2048, 4, GIF_CREATION_LIMITS)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT',
      detail: { kind: 'workload', width: 2048, height: 2048, frameCount: 4, actual: 16_777_216, limit: 15_360_000 } }))
  })
  it('keeps engineering profiles within existing parser/native safety ceilings', () => {
    expect(resolveEncodeLimits(GIF_CREATION_LIMITS)).toEqual(GIF_CREATION_LIMITS)
    expect(resolveEncodeLimits()).toEqual(SPIKE_ENCODER_LIMITS)
    expect(() => resolveEncodeLimits({ ...GIF_CREATION_LIMITS, maxOutputPixels: Infinity })).toThrow()
    expect(() => resolveEncodeLimits({ ...GIF_CREATION_LIMITS, minFrames: 201 })).toThrow()
    expect(() => resolveEncodeLimits({ ...GIF_CREATION_LIMITS, maxOutputSide: 20_000 })).toThrow()
  })
})
