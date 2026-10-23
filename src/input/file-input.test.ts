import { describe, expect, it, vi } from 'vitest'
import { takeFileSelection } from './file-input'

describe('takeFileSelection', () => {
  it('accepts a single file and resets the control for selection of the same file again', async () => {
    const file = new File(['GIF89a'], 'animation.gif')
    const input = { files: { 0: file, length: 1 }, value: 'C:\\fakepath\\animation.gif' }
    const first = takeFileSelection(input)
    expect(input.value).toBe('')
    input.value = 'C:\\fakepath\\animation.gif'
    const second = takeFileSelection(input)
    expect(second[0]?.name).toBe(first[0]?.name)
    expect(input.value).toBe('')
    expect(new TextDecoder().decode(await second[0]?.read())).toBe('GIF89a')
  })

  it('preserves FileList order without filtering extension or MIME or reading bytes', () => {
    const files = [
      new File(['first'], 'z.txt', { type: 'text/plain' }),
      new File(['second'], 'a', { type: '' }),
    ]
    const slices = files.map((file) => vi.spyOn(file, 'slice'))
    const selected = takeFileSelection({ files, value: 'chosen' })
    expect(selected.map(({ name, source }) => ({ name, source }))).toEqual([
      { name: 'z.txt', source: 'file' }, { name: 'a', source: 'file' },
    ])
    for (const slice of slices) expect(slice).not.toHaveBeenCalled()
  })

  it('treats null or empty selection as cancellation and resets the control', () => {
    for (const files of [null, { length: 0 }]) {
      const input = { files, value: 'old selection' }
      expect(takeFileSelection(input)).toEqual([])
      expect(input.value).toBe('')
    }
  })
})
