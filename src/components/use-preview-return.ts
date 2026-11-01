import { useCallback, useLayoutEffect, useRef } from 'react'

/** Restore only after the workspace has joined preview teardown and remounted its result. */
export function usePreviewReturn(resultVisible: boolean) {
  const previewButton = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const rememberPreview = useCallback(() => { pending.current = true }, [])

  useLayoutEffect(() => {
    if (!resultVisible || !pending.current) return
    pending.current = false
    const button = previewButton.current
    if (!button?.isConnected || button.disabled) return
    // Resolve the new element, not a detached pre-preview node or an obsolete scrollY.
    // Native scrolling uses the current responsive layout and never animates the return.
    button.focus({ preventScroll: true })
    button.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  }, [resultVisible])

  return { previewButton, rememberPreview }
}
