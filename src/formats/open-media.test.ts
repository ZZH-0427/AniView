import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimationSequence } from '../media/animation'
import type { VirtualFile } from '../input/virtual-file'
import { staticFixture } from './static/static-fixtures.test-support'
import { apngFixture } from './apng/apng-fixtures.test-support'
import { openMedia } from './open-media'

const animation = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('./open-animation', () => ({ openAnimation: animation.open }))
class Bitmap implements ImageBitmap { readonly width = 40; readonly height = 20; close = vi.fn() }
const files = import.meta.glob<string>('../../tests/fixtures/zip/*.{gif,webp}', { eager: true, query: '?inline', import: 'default' })
function file(data: ArrayBuffer, source: VirtualFile['source'] = 'file'): VirtualFile {
  return { name: 'wrong-extension.bmp', mimeType: 'image/bmp', size: data.byteLength, source,
    read: async (start = 0, end = data.byteLength) => data.slice(start, end) }
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

describe('unified media opening', () => {
  it.each([['quadrants.jpg', 'jpeg'], ['quadrants.png', 'png'], ['quadrants.webp', 'webp']] as const)('routes %s through native static source using binary detection', async (name, format) => {
    const bitmap = new Bitmap(); vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const phases: string[] = []
    for (const source of ['file', 'archive', 'drag-drop', 'gallery'] as const) {
      const opened = await openMedia(file(staticFixture(name), source), { onPhase: phase => phases.push(phase) })
      expect(opened.kind).toBe('static'); expect(opened.format).toBe(format)
      if (opened.kind !== 'static') throw new Error('Expected static source')
      expect(opened.source.image).toBe(bitmap); opened.source.dispose()
    }
    expect(animation.open).not.toHaveBeenCalled()
    expect(phases).toEqual(Array(4).fill(['reading', 'decoding']).flat())
  })
  it.each([
    ['apng', apngFixture('full-infinite.png')],
    ['gif', Uint8Array.from(atob('R0lGODlhAQABAAAAACw='), c => c.charCodeAt(0)).buffer],
    ['webp', Uint8Array.from(atob(files['../../tests/fixtures/zip/original-two-frame.webp']!.split(',')[1]!), c => c.charCodeAt(0)).buffer],
  ] as const)('keeps animated %s on the existing animation pipeline', async (format, data) => {
    const sequence: AnimationSequence = { width: 1, height: 1, frames: async function* () {}, dispose: vi.fn(async () => {}) }
    animation.open.mockResolvedValue({ format, sequence })
    const phases: string[] = [], input = file(data)
    await expect(openMedia(input, { onPhase: phase => phases.push(phase) })).resolves.toEqual({ kind: 'animation', format, sequence })
    expect(animation.open).toHaveBeenCalledWith(input, expect.any(Object)); expect(phases).toEqual(['reading', 'decoding'])
  })
  it('rejects unsupported files without constructing static or animation resources', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn())
    await expect(openMedia(file(new TextEncoder().encode('<svg></svg>').buffer))).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
    expect(animation.open).not.toHaveBeenCalled(); expect(createImageBitmap).not.toHaveBeenCalled()
  })
  it('rejects oversized encoded input before even reading format metadata', async () => {
    const read = vi.fn()
    await expect(openMedia({ ...file(new ArrayBuffer(0)), size: 67_108_865, read })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' })
    expect(read).not.toHaveBeenCalled()
  })
  it('preserves the archive-entry size category without extracting oversized bytes', async () => {
    const read = vi.fn()
    await expect(openMedia({ ...file(new ArrayBuffer(0), 'archive'), size: 67_108_865, read })).rejects.toMatchObject({ code: 'ARCHIVE_ENTRY_TOO_LARGE' })
    expect(read).not.toHaveBeenCalled()
  })
  it('keeps malformed archive file metadata distinct from an oversized entry', async () => {
    const read = vi.fn()
    await expect(openMedia({ ...file(new ArrayBuffer(0), 'archive'), size: -1, read })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
    expect(read).not.toHaveBeenCalled()
  })
  it('releases a late animation sequence when open was cancelled', async () => {
    const abort = new AbortController()
    const sequence: AnimationSequence = { width: 1, height: 1, frames: async function* () {}, dispose: vi.fn(async () => {}) }
    animation.open.mockImplementation(async () => { abort.abort(); return { format: 'gif', sequence } })
    await expect(openMedia(file(Uint8Array.from(atob('R0lGODlhAQABAAAAACw='), c => c.charCodeAt(0)).buffer), { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(sequence.dispose).toHaveBeenCalledTimes(1)
  })
})
