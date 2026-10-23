import type { VirtualFile } from '../input/virtual-file'

export const MAX_SESSION_ITEMS = 1000

export interface MediaSessionItem {
  readonly id: number
  readonly file: VirtualFile
}

/** A page-lifetime list of file references, independent of decoding/playback state. */
export interface MediaSession {
  readonly items: readonly MediaSessionItem[]
  readonly currentIndex: number
  readonly nextId: number
}

export function createMediaSession(): MediaSession {
  return { items: [], currentIndex: -1, nextId: 0 }
}

export function currentSessionItem(session: MediaSession): MediaSessionItem | undefined {
  return session.items[session.currentIndex]
}

export function appendFiles(session: MediaSession, files: readonly VirtualFile[]): {
  session: MediaSession
  added: number
  truncated: number
} {
  const added = Math.min(files.length, Math.max(0, MAX_SESSION_ITEMS - session.items.length))
  const truncated = files.length - added
  if (added === 0) return { session, added, truncated }

  const items = files.slice(0, added).map((file, index) => ({ id: session.nextId + index, file }))
  return {
    session: {
      items: [...session.items, ...items],
      currentIndex: session.items.length === 0 ? 0 : session.currentIndex,
      nextId: session.nextId + added,
    },
    added,
    truncated,
  }
}

export function previousFile(session: MediaSession): MediaSession {
  if (session.currentIndex <= 0) return session
  return { ...session, currentIndex: session.currentIndex - 1 }
}

export function nextFile(session: MediaSession): MediaSession {
  if (session.currentIndex >= session.items.length - 1) return session
  return { ...session, currentIndex: session.currentIndex + 1 }
}

/** Removes only the in-memory reference, never the underlying device file. */
export function removeCurrentFile(session: MediaSession): MediaSession {
  if (!currentSessionItem(session)) return session
  const items = session.items.filter((_, index) => index !== session.currentIndex)
  return {
    ...session,
    items,
    currentIndex: items.length === 0 ? -1 : Math.min(session.currentIndex, items.length - 1),
  }
}

export function clearMediaSession(session: MediaSession): MediaSession {
  if (session.items.length === 0) return session
  // IDs stay unique across clear/reopen, protecting UI/async item identities.
  return { items: [], currentIndex: -1, nextId: session.nextId }
}
