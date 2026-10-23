import { describe, expect, it } from 'vitest'
import { MediaError } from './errors'

describe('media errors', () => {
  it('distinguishes a configured resource limit from allocation failure', () => {
    const limit = new MediaError('RESOURCE_LIMIT_EXCEEDED')
    expect(limit.message).toContain('supported processing limits')
    expect(limit.message).not.toBe(new MediaError('OUT_OF_MEMORY').message)
  })
  it('keeps raw diagnostic details out of the visible message', () => {
    const cause = new Error('private filename and internal decoder details')
    const error = new MediaError('DECODE_FAILED', { cause })
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('DECODE_FAILED')
    expect(error.message).toBe('This image could not be decoded.')
    expect(error.message).not.toContain(cause.message)
    expect(error.cause).toBe(cause)
  })

  it('distinguishes encrypted, corrupted and unsupported archives', () => {
    const errors = [
      new MediaError('ARCHIVE_ENCRYPTED'),
      new MediaError('ARCHIVE_CORRUPTED'),
      new MediaError('ARCHIVE_UNSUPPORTED'),
    ]
    expect(new Set(errors.map((error) => error.code)).size).toBe(3)
    expect(new Set(errors.map((error) => error.message)).size).toBe(3)
  })
})
