import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { IconButton } from './IconButton'
import { ViewerMoreMenu } from './ViewerMoreMenu'

describe('accessible viewer action presentation', () => {
  it.each([
    ['play', 'Play'], ['pause', 'Pause'], ['step-back', 'Previous Frame'], ['step-forward', 'Next Frame'],
    ['replay', 'Replay'], ['previous-file', 'Previous File'], ['next-file', 'Next File'], ['zoom-in', 'Zoom In'],
    ['zoom-out', 'Zoom Out'], ['fit', 'Fit'], ['actual-size', '100%'], ['fullscreen', 'Fullscreen'],
    ['exit-fullscreen', 'Exit Fullscreen'], ['close', 'Close'], ['more', 'More'], ['remove', 'Remove from list'],
  ] satisfies [IconName, string][])('gives the %s icon action a text alternative and native button semantics', (icon, label) => {
    const html = renderToStaticMarkup(<IconButton icon={icon} label={label} />)
    expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain(`title="${label}"`)
    expect(html).toContain('type="button"')
    expect(html).toContain(`data-icon="${icon}"`)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
  })
  it('preserves disabled/pressed states, custom classes and a more descriptive tooltip', () => {
    const html = renderToStaticMarkup(<IconButton icon="actual-size" label="100%" title="Actual size (100%)"
      disabled aria-pressed className="viewer-actual" data-testid="actual-size" />)
    expect(html).toContain('class="icon-button viewer-actual"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="100%"')
    expect(html).toContain('title="Actual size (100%)"')
    expect(html).toContain('data-testid="actual-size"')
  })
  it('keeps frame stepping visually distinct from file navigation within one SVG family', () => {
    const step = renderToStaticMarkup(<Icon name="step-back" />)
    const file = renderToStaticMarkup(<Icon name="previous-file" />)
    expect(step).not.toBe(file)
    for (const svg of [step, file]) {
      expect(svg).toContain('viewBox="0 0 24 24"')
      expect(svg).toContain('stroke="currentColor"')
      expect(svg).toContain('stroke-linecap="round"')
      expect(svg).toContain('stroke-linejoin="round"')
      expect(svg).toContain('fill="none"')
    }
  })
  it('starts More closed with its accessible menu relationship and does not remove eagerly', () => {
    const remove = vi.fn(), opened = vi.fn()
    const html = renderToStaticMarkup(<ViewerMoreMenu onRemove={remove} onOpenChange={opened} />)
    expect(html).toContain('aria-label="More"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-controls=')
    expect(html).not.toContain('role="menuitem"')
    expect(remove).not.toHaveBeenCalled()
    expect(opened).not.toHaveBeenCalled()
  })
})
