import { describe, expect, it } from 'vitest'
import { viewerShortcut } from './viewer-shortcuts'

const key = (value: string, options: Partial<KeyboardEvent> = {}) => ({ key: value, shiftKey: false,
  ctrlKey: false, altKey: false, metaKey: false, isComposing: false, ...options })

describe('Viewer keyboard controls', () => {
  it('distinguishes frame navigation from file navigation', () => {
    expect(viewerShortcut(key('ArrowLeft'), false)).toBe('previous-frame')
    expect(viewerShortcut(key('ArrowRight'), false)).toBe('next-frame')
    expect(viewerShortcut(key('ArrowLeft', { shiftKey: true }), false)).toBe('previous-file')
    expect(viewerShortcut(key('ArrowRight', { shiftKey: true }), false)).toBe('next-file')
  })
  it('leaves focused buttons, inputs and editable controls alone', () => {
    for (const value of [' ', 'ArrowLeft', 'ArrowRight', '0', '1', '+', '-', 'Escape'])
      expect(viewerShortcut(key(value), true)).toBeUndefined()
  })
  it('does not steal modified browser shortcuts or IME input', () => {
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }])
      expect(viewerShortcut(key('+', options), false)).toBeUndefined()
  })
  it('maps playback, view and fullscreen controls', () => {
    expect(viewerShortcut(key(' '), false)).toBe('toggle-play')
    expect(viewerShortcut(key('0'), false)).toBe('fit')
    expect(viewerShortcut(key('1'), false)).toBe('actual')
    expect(viewerShortcut(key('+'), false)).toBe('zoom-in')
    expect(viewerShortcut(key('='), false)).toBe('zoom-in')
    expect(viewerShortcut(key('-'), false)).toBe('zoom-out')
    expect(viewerShortcut(key('Escape'), false)).toBe('exit-fullscreen')
    expect(viewerShortcut(key('x'), false)).toBeUndefined()
  })
})
