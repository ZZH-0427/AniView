export type ViewerShortcut = 'toggle-play' | 'previous-frame' | 'next-frame'
  | 'previous-file' | 'next-file' | 'fit' | 'actual' | 'zoom-in' | 'zoom-out' | 'exit-fullscreen'

/** Focused controls keep their native keyboard behavior, including Space on buttons. */
export function viewerShortcut(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing'>,
  controlFocused: boolean): ViewerShortcut | undefined {
  if (controlFocused || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return
  if (event.key === 'ArrowLeft') return event.shiftKey ? 'previous-file' : 'previous-frame'
  if (event.key === 'ArrowRight') return event.shiftKey ? 'next-file' : 'next-frame'
  if (event.key === ' ') return 'toggle-play'
  if (event.key === '0') return 'fit'
  if (event.key === '1') return 'actual'
  if (event.key === '+' || event.key === '=') return 'zoom-in'
  if (event.key === '-') return 'zoom-out'
  if (event.key === 'Escape') return 'exit-fullscreen'
}

export function hasControlFocus(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('button, input, select, textarea, summary, a, [role="button"], [contenteditable]:not([contenteditable="false"])')
}
