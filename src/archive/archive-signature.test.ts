import { describe, expect, it } from 'vitest'
import { archiveSignature, detectArchiveSignature } from './archive-signature'

describe('archive signature whitelist', () => {
  it.each([
    ['zip', [0x50, 0x4b, 3, 4]], ['zip', [0x50, 0x4b, 5, 6]],
    ['rar4', [0x52, 0x61, 0x72, 0x21, 0x1a, 7, 0]],
    ['rar5', [0x52, 0x61, 0x72, 0x21, 0x1a, 7, 1, 0]],
    ['7z', [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],
  ] as const)('recognizes %s by binary evidence', (kind, bytes) => {
    expect(archiveSignature(new Uint8Array(bytes))).toBe(kind)
  })
  it.each([
    [], [0x52, 0x61, 0x72], [0x4d, 0x53, 0x43, 0x46], // CAB
    [0x4d, 0x5a, 0x52, 0x61, 0x72, 0x21], // SFX is not a byte-zero RAR
    [...new Uint8Array(257), ...new TextEncoder().encode('ustar')],
    [...new Uint8Array(32769), ...new TextEncoder().encode('CD001')],
    [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0],
  ])('never enters a backend for unsupported/truncated data', bytes => {
    expect(archiveSignature(new Uint8Array(bytes))).toBeUndefined()
  })
  it('uses ZIP bytes despite a RAR filename', async () => {
    expect(await detectArchiveSignature(new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'wrong.rar'))).toBe('zip')
  })
  it('rejects known multipart names without pairing or loading the engine', async () => {
    for (const name of ['images.part1.rar', 'images.part02.rar', 'images.7z.001']) {
      await expect(detectArchiveSignature(new File([new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 7, 0])], name)))
        .rejects.toMatchObject({ code: 'ARCHIVE_MULTIVOLUME_UNSUPPORTED' })
    }
  })
  it('honors an already cancelled selection', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(detectArchiveSignature(new Blob(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
