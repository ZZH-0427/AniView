import { describe, expect, it } from 'vitest'
import { assertMediaDimensions, assertMediaEncodedSize, MEDIA_RESOURCE_LIMITS } from './resource-policy'

describe('shared media resource policy', () => {
  it('keeps static pixels within the existing 16 MiB full-frame ceiling', () => {
    expect(MEDIA_RESOURCE_LIMITS).toEqual({ maxEncodedBytes: 67_108_864, maxDimension: 16_384, maxPixels: 4_194_304 })
    expect(() => assertMediaDimensions(2048, 2048)).not.toThrow()
    expect(() => assertMediaDimensions(16_384, 1)).not.toThrow()
    expect(() => assertMediaEncodedSize(67_108_864)).not.toThrow()
  })
  it.each([-1, 1.5, Infinity, NaN])('rejects invalid encoded size %s before reading', size => {
    expect(() => assertMediaEncodedSize(size)).toThrow(expect.objectContaining({ code: 'FILE_READ_FAILED' }))
  })
  it('rejects oversized encoded input', () => {
    expect(() => assertMediaEncodedSize(67_108_865)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }))
  })
  it.each([[0, 1], [1, -1], [1.5, 1], [Infinity, 1]])('rejects invalid dimensions %s×%s', (width, height) => {
    expect(() => assertMediaDimensions(width, height)).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })
  it.each([[16_385, 1], [1, 16_385], [2049, 2048], [50_000, 50_000]])('rejects excessive dimensions %s×%s', (width, height) => {
    expect(() => assertMediaDimensions(width, height)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }))
  })
})
