import { describe, expect, it, vi } from 'vitest'
import { browserFile } from './browser-file'

describe('browserFile', () => {
  it('preserves metadata as hints and reads full or sliced bytes on demand', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'wrong-name.gif', { type: 'text/plain' })
    const slice = vi.spyOn(file, 'slice')
    const adapted = browserFile(file)
    expect(adapted).toMatchObject({ name: file.name, size: 4, mimeType: 'text/plain', source: 'file' })
    expect(slice).not.toHaveBeenCalled()
    expect(new Uint8Array(await adapted.read())).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(new Uint8Array(await adapted.read(1, 3))).toEqual(new Uint8Array([2, 3]))
    expect(slice).toHaveBeenCalledTimes(2)
  })

  it('supports extensionless files with no MIME and marks the input source', () => {
    const file = new File(['GIF89a'], 'untitled')
    expect(browserFile(file, 'drag-drop')).toMatchObject({
      name: 'untitled', size: 6, mimeType: '', source: 'drag-drop',
    })
  })
})
