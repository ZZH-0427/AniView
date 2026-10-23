import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'

interface FullscreenState { available: boolean; fullscreen: boolean; hidden: boolean; notice: string }
const serverState: FullscreenState = { available: false, fullscreen: false, hidden: false, notice: '' }

/** External browser state and one inactivity timer, independent from animation renders. */
class ViewerFullscreen {
  private state = serverState
  private readonly listeners = new Set<() => void>()
  private readonly engaged = new Set<'pointer' | 'focus'>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private keepVisible = true
  constructor(private readonly element: () => HTMLElement | null) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(next: Partial<FullscreenState>) {
    const state = { ...this.state, ...next }
    if ((Object.keys(state) as (keyof FullscreenState)[]).every(key => this.state[key] === state[key])) return
    this.state = state
    for (const listener of this.listeners) listener()
  }
  private clearTimer() { clearTimeout(this.timer); this.timer = undefined }
  reveal = () => {
    this.clearTimer()
    this.update({ hidden: false })
    if (this.state.fullscreen && !this.keepVisible && !this.engaged.size && !this.state.notice)
      this.timer = setTimeout(() => this.update({ hidden: true }), 2500)
  }
  hold = (source: 'pointer' | 'focus', value: boolean) => {
    if (value) this.engaged.add(source)
    else this.engaged.delete(source)
    this.reveal()
  }
  setKeepVisible(value: boolean) {
    if (value !== this.keepVisible) { this.keepVisible = value; this.reveal() }
  }
  connect() {
    const element = this.element()
    this.update({ available: !!element?.requestFullscreen && !!document.exitFullscreen && document.fullscreenEnabled !== false })
    const changed = () => {
      const entered = document.fullscreenElement === element
      this.update({ fullscreen: entered, notice: '' })
      // Leave the initiating button so inactivity can hide controls. Tab/focus on
      // controls thereafter holds them visible, as does pointer hover.
      if (entered) element?.focus({ preventScroll: true })
      this.reveal()
    }
    document.addEventListener('fullscreenchange', changed)
    return () => { this.clearTimer(); document.removeEventListener('fullscreenchange', changed) }
  }
  toggle = () => {
    const element = this.element()
    if (!element) return
    this.update({ notice: '' })
    const request = document.fullscreenElement === element ? document.exitFullscreen() : element.requestFullscreen?.()
    void request?.catch(() => {
      this.update({ notice: 'Fullscreen is unavailable right now. You can keep viewing here.' }); this.reveal()
    })
  }
  exit = () => {
    if (document.fullscreenElement === this.element())
      void document.exitFullscreen().catch(() => {
        this.update({ notice: 'Please use your browser controls to leave fullscreen.' }); this.reveal()
      })
  }
}

export function useViewerFullscreen(container: RefObject<HTMLElement | null>, keepVisible: boolean) {
  const [controller] = useState(() => new ViewerFullscreen(() => container.current))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => serverState)
  useEffect(() => controller.connect(), [controller])
  useEffect(() => controller.setKeepVisible(keepVisible), [controller, keepVisible])
  return { ...state, toggle: controller.toggle, exit: controller.exit, reveal: controller.reveal, hold: controller.hold }
}
