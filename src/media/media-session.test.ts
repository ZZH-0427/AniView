import { describe, expect, it, vi } from 'vitest'
import type { VirtualFile } from '../input/virtual-file'
import {
  appendFiles, clearMediaSession, createMediaSession, currentSessionItem,
  MAX_SESSION_ITEMS, nextFile, previousFile, removeCurrentFile,
} from './media-session'

function file(name: string): VirtualFile {
  return { name, size: 6, source: 'file', read: vi.fn(async () => new ArrayBuffer(6)) }
}

function sessionWith(...names: string[]) {
  return appendFiles(createMediaSession(), names.map(file)).session
}

describe('MediaSession', () => {
  it('starts empty and navigates, removes and clears safely', () => {
    const empty = createMediaSession()
    expect(empty.items).toEqual([])
    expect(empty.currentIndex).toBe(-1)
    expect(currentSessionItem(empty)).toBeUndefined()
    expect(previousFile(empty)).toBe(empty)
    expect(nextFile(empty)).toBe(empty)
    expect(removeCurrentFile(empty)).toBe(empty)
    expect(clearMediaSession(empty)).toBe(empty)
  })

  it('opens the first selected file without reading it', () => {
    const selected = file('single.gif')
    const result = appendFiles(createMediaSession(), [selected])
    expect(result).toMatchObject({ added: 1, truncated: 0 })
    expect(result.session.currentIndex).toBe(0)
    expect(currentSessionItem(result.session)?.file).toBe(selected)
    expect(selected.read).not.toHaveBeenCalled()
  })

  it('preserves the selection order with multiple files and immutable navigation', () => {
    const original = sessionWith('z.gif', 'b.webp', 'a.png')
    const second = nextFile(original)
    expect(second.currentIndex).toBe(1)
    expect(currentSessionItem(second)?.file.name).toBe('b.webp')
    expect(previousFile(second).currentIndex).toBe(0)
    expect(original.currentIndex).toBe(0)
    expect(original.items.map((item) => item.file.name)).toEqual(['z.gif', 'b.webp', 'a.png'])
    expect(second.items).toBe(original.items)
  })

  it('clamps file navigation at each end instead of looping the file list', () => {
    const first = sessionWith('first.gif', 'last.gif')
    expect(previousFile(first)).toBe(first)
    const last = nextFile(first)
    expect(nextFile(last)).toBe(last)
    expect(last.currentIndex).toBe(1)
  })

  it('appends more images while preserving the current item', () => {
    const original = nextFile(sessionWith('first.gif', 'current.gif'))
    const result = appendFiles(original, [file('new.gif')])
    expect(result.session.items).toHaveLength(3)
    expect(result.session.currentIndex).toBe(1)
    expect(currentSessionItem(result.session)).toBe(currentSessionItem(original))
    expect(original.items).toHaveLength(2)
    expect(result.session.items.map((item) => item.id)).toEqual([0, 1, 2])
  })

  it('treats cancellation/empty additions as no-ops on an existing session', () => {
    const original = sessionWith('playing.gif')
    expect(appendFiles(original, [])).toEqual({ session: original, added: 0, truncated: 0 })
    expect(appendFiles(original, []).session).toBe(original)
  })

  it('keeps duplicate selections with distinct IDs, even when the File reference is identical', () => {
    const selected = file('same.gif')
    const first = appendFiles(createMediaSession(), [selected]).session
    const second = appendFiles(first, [selected]).session
    expect(second.items.map((item) => item.id)).toEqual([0, 1])
    expect(second.items[0]?.file).toBe(second.items[1]?.file)
    expect(selected.read).not.toHaveBeenCalled()
  })

  it('removes a middle item and opens its successor at the same index', () => {
    const original = nextFile(sessionWith('first.gif', 'removed.gif', 'successor.gif'))
    const removed = removeCurrentFile(original)
    expect(removed.items.map((item) => item.file.name)).toEqual(['first.gif', 'successor.gif'])
    expect(removed.currentIndex).toBe(1)
    expect(currentSessionItem(removed)?.file.name).toBe('successor.gif')
    expect(original.items).toHaveLength(3)
  })

  it('removes the last item and selects the preceding file', () => {
    const original = nextFile(sessionWith('previous.gif', 'last.gif'))
    const removed = removeCurrentFile(original)
    expect(removed.currentIndex).toBe(0)
    expect(currentSessionItem(removed)?.file.name).toBe('previous.gif')
  })

  it('removes the final file and safely opens a subsequent selection with a fresh ID', () => {
    const removed = removeCurrentFile(sessionWith('only.gif'))
    expect(removed.items).toEqual([])
    expect(removed.currentIndex).toBe(-1)
    expect(currentSessionItem(removed)).toBeUndefined()
    expect(currentSessionItem(appendFiles(removed, [file('reopened.gif')]).session)?.id).toBe(1)
  })

  it('clears all references but preserves monotonic IDs across new sessions', () => {
    const original = sessionWith('first.gif', 'second.gif')
    const cleared = clearMediaSession(original)
    expect(cleared).toEqual({ items: [], currentIndex: -1, nextId: 2 })
    expect(currentSessionItem(appendFiles(cleared, [file('fresh.gif')]).session)?.id).toBe(2)
    expect(original.items).toHaveLength(2)
  })

  it('retains unsupported items and permits navigation to later supported items without any reads', () => {
    const original = sessionWith('unsupported.heic', 'supported.gif')
    expect(currentSessionItem(original)?.file.name).toBe('unsupported.heic')
    expect(currentSessionItem(nextFile(original))?.file.name).toBe('supported.gif')
    for (const item of original.items) expect(item.file.read).not.toHaveBeenCalled()
  })

  it('resolves rapid next/previous transitions deterministically', () => {
    const original = sessionWith('a.gif', 'b.gif', 'c.gif')
    const navigated = nextFile(previousFile(nextFile(nextFile(original))))
    expect(currentSessionItem(navigated)?.file.name).toBe('c.gif')
    expect(navigated.currentIndex).toBe(2)
    expect(original.currentIndex).toBe(0)
  })

  it('limits retained references and reports exactly how many files were not added', () => {
    const selected = Array.from({ length: MAX_SESSION_ITEMS + 3 }, (_, index) => file(`${index}.gif`))
    const { session, added, truncated } = appendFiles(createMediaSession(), selected)
    expect(added).toBe(MAX_SESSION_ITEMS)
    expect(truncated).toBe(3)
    expect(session.items).toHaveLength(MAX_SESSION_ITEMS)
    expect(session.items.at(-1)?.file.name).toBe(`${MAX_SESSION_ITEMS - 1}.gif`)
    expect(session.nextId).toBe(MAX_SESSION_ITEMS)
    expect(appendFiles(session, [file('overflow.gif')])).toEqual({ session, added: 0, truncated: 1 })
    for (const item of selected) expect(item.read).not.toHaveBeenCalled()
  })

  it('applies the item limit to additions to an existing session and permits adding after removal', () => {
    const starting = sessionWith('current.gif')
    const addition = Array.from({ length: MAX_SESSION_ITEMS }, (_, index) => file(`${index}.gif`))
    const result = appendFiles(starting, addition)
    expect(result.added).toBe(MAX_SESSION_ITEMS - 1)
    expect(result.truncated).toBe(1)
    expect(currentSessionItem(result.session)?.id).toBe(0)
    const removed = removeCurrentFile(result.session)
    const readded = appendFiles(removed, [file('new.gif')])
    expect(readded.added).toBe(1)
    expect(readded.session.items.at(-1)?.id).toBe(MAX_SESSION_ITEMS)
  })
})
