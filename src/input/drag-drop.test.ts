import { describe, expect, it, vi } from 'vitest'
import { droppedFiles } from './drag-drop'

describe('droppedFiles', () => {
  it('adapts a single dropped File with the shared browser adapter', async () => {
    const file = new File(['GIF89a'], 'example.gif', { type: 'image/gif' })
    const [dropped] = droppedFiles({ files: { 0: file, length: 1 } })
    expect(dropped).toMatchObject({ name: 'example.gif', size: 6, mimeType: 'image/gif', source: 'drag-drop' })
    expect(new TextDecoder().decode(await dropped?.read())).toBe('GIF89a')
  })

  it('preserves multiple-file order and unsupported files without reading them', () => {
    const files = [new File(['1'], 'z.png'), new File(['2'], 'a.unsupported')]
    const slices = files.map((file) => vi.spyOn(file, 'slice'))
    expect(droppedFiles({ files }).map((file) => file.name)).toEqual(['z.png', 'a.unsupported'])
    for (const slice of slices) expect(slice).not.toHaveBeenCalled()
  })

  it('ignores empty and non-file drops', () => {
    expect(droppedFiles({ files: [] })).toEqual([])
    const textDrop = { files: { length: 0 }, getData: () => '<script>not a file</script>' }
    expect(droppedFiles(textDrop)).toEqual([])
  })
})
