import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

/** One local disclosure; removing a list item retains the existing direct action. */
export function ViewerMoreMenu({ onRemove, onOpenChange, onConvert }: {
  onRemove: () => void
  onOpenChange?: (open: boolean) => void
  onConvert?: (() => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const item = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const notifyOpen = useEffectEvent((next: boolean) => onOpenChange?.(next))

  useEffect(() => {
    if (!open) return
    notifyOpen(true)
    item.current?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      notifyOpen(false)
    }
  }, [open])

  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true) }
      return
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const items = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])
      const index = items.findIndex(button => button === document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
      items[next]?.focus({ preventScroll: true }); return
    }
    if (event.key !== 'Tab') return
    // Unmounting a focused item before the browser's default Tab can lose its
    // place. Resolve the adjacent native control first, then close and focus it.
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]',
    )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0
      && !element.matches(':disabled') && getComputedStyle(element).visibility !== 'hidden'
      && (!container.current?.contains(element) || element === trigger.current))
    const index = trigger.current ? buttons.indexOf(trigger.current) : -1
    const target = event.shiftKey && document.activeElement !== trigger.current ? trigger.current
      : buttons[index + (event.shiftKey ? -1 : 1)]
    setOpen(false)
    if (target) { event.preventDefault(); target.focus({ preventScroll: true }) }
  }

  return <div className="viewer-more-menu" ref={container} onKeyDown={keydown} onBlur={event => {
    if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <IconButton ref={trigger} icon="more" label="More" data-testid="viewer-more-trigger" aria-haspopup="menu" aria-expanded={open}
      aria-controls={menuId} onClick={() => setOpen(value => !value)} />
    {open && <div className="viewer-more-popover" id={menuId} data-testid="viewer-more-menu" role="menu" aria-label="More actions">
      {onConvert && <button ref={item} type="button" className="viewer-more-remove" role="menuitem" aria-label="Convert animation"
        onClick={() => { close(); onConvert() }}><Icon name="create" /><span>Convert animation</span></button>}
      <button ref={onConvert ? undefined : item} type="button" className="viewer-more-remove" role="menuitem" aria-label="Remove from list"
        onClick={() => { close(); onRemove() }}><Icon name="remove" /><span>Remove from list</span></button>
    </div>}
  </div>
}
