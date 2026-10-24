import type { ReactNode, SVGProps } from 'react'

export type IconName = 'play' | 'pause' | 'step-back' | 'step-forward' | 'replay'
  | 'previous-file' | 'next-file' | 'zoom-in' | 'zoom-out' | 'fit' | 'actual-size'
  | 'fullscreen' | 'exit-fullscreen' | 'close' | 'more' | 'remove'

const artwork: Record<IconName, ReactNode> = {
  play: <path d="m9 5 10 7-10 7Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  'step-back': <><path d="M5 5v14m13-14-9 7 9 7Z" /></>,
  'step-forward': <><path d="M19 5v14M6 5l9 7-9 7Z" /></>,
  replay: <><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /></>,
  'previous-file': <path d="m15 5-7 7 7 7" />,
  'next-file': <path d="m9 5 7 7-7 7" />,
  'zoom-in': <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M7.5 10.5h6m-3-3v6" /></>,
  'zoom-out': <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M7.5 10.5h6" /></>,
  fit: <><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  'actual-size': <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m7 10 2-1v6m6-5 2-1v6" /><circle cx="12" cy="10" r="0.5" /><circle cx="12" cy="14" r="0.5" /></>,
  fullscreen: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  'exit-fullscreen': <path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  remove: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></>,
}

/** One small, rounded stroke family. Meaning belongs to the enclosing control. */
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg {...props} data-icon={name} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {artwork[name]}
  </svg>
}
