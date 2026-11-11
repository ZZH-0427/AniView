import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ zip: vi.fn(), extended: vi.fn() }))
vi.mock('./archive-session', () => ({ ArchiveSession: { open: mock.zip } }))
vi.mock('./extended-session', () => ({ ExtendedArchiveSession: { create: mock.extended } }))
import { createArchiveSource } from './archive-source-factory'

describe('archive source dispatch', () => {
  beforeEach(() => { mock.zip.mockReset(); mock.extended.mockReset() })
  it('keeps ZIP metadata, entry identity and access operations on the existing session', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'misnamed.rar')
    const session = { id: 'zip-identity', name: file.name, entries: [], files: [], metrics: {},
      close: vi.fn(), entryForFile: vi.fn(), ensureEntryAvailable: vi.fn(), unlockEntry: vi.fn(), releaseEntry: vi.fn() }
    mock.zip.mockResolvedValue(session)
    const opening = await createArchiveSource(file)
    expect(mock.extended).not.toHaveBeenCalled()
    expect(mock.zip).not.toHaveBeenCalled()
    const source = await opening.open()
    expect(source.format).toBe('zip'); expect(source.entries).toBe(session.entries)
    await source.unlockEntry(9, 'test-only')
    expect(session.unlockEntry).toHaveBeenCalledWith(9, 'test-only', undefined)
    await opening.close(); expect(session.close).toHaveBeenCalledOnce()
    expect(mock.extended).not.toHaveBeenCalled()
  })
  it.each([
    [4, [0x52, 0x61, 0x72, 0x21, 0x1a, 7, 0]],
    [5, [0x52, 0x61, 0x72, 0x21, 0x1a, 7, 1, 0]],
    [7, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],
  ])('prepares %i separately and leaves header password retries on that owner', async (kind, bytes) => {
    const session = { name: 'media', format: kind === 7 ? '7z' : 'rar', open: vi.fn().mockResolvedValue(undefined), close: vi.fn() }
    mock.extended.mockReturnValue(session)
    const file = new File([new Uint8Array(bytes)], 'wrong.zip')
    const opening = await createArchiveSource(file)
    expect(mock.zip).not.toHaveBeenCalled()
    expect(mock.extended).toHaveBeenCalledWith(file, kind)
    expect(await opening.open({ password: 'fixture-only' })).toBe(session)
    expect(session.open).toHaveBeenCalledWith({ password: 'fixture-only' })
    await opening.close(); expect(session.close).toHaveBeenCalledOnce()
  })
  it('rejects unsupported formats before loading any backend', async () => {
    for (const name of ['unsupported.tar', 'unsupported.cab', 'unsupported.iso', 'unsupported.rar']) {
      await expect(createArchiveSource(new File(['unsupported container'], name)))
        .rejects.toMatchObject({ code: 'ARCHIVE_UNSUPPORTED_FORMAT' })
    }
    expect(mock.zip).not.toHaveBeenCalled(); expect(mock.extended).not.toHaveBeenCalled()
  })
})
