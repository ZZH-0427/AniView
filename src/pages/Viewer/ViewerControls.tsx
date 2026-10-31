import { IconButton } from '../../components/IconButton'
import { ViewerMoreMenu } from '../../components/ViewerMoreMenu'

export function ViewerHeader({ name, metadata, fullscreenAvailable, fullscreen, onFullscreen, onClose, onRemove, onConvert }: {
  name: string; metadata: string | undefined; fullscreenAvailable: boolean; fullscreen: boolean
  onFullscreen: () => void; onClose: () => void; onRemove: () => void
  onConvert?: (() => void) | undefined
}) {
  return <>
    <div className="viewer-heading"><span className="viewer-brand">AniView</span><h1 title={name}>{name}</h1></div>
    <div className="viewer-header-actions">
      {fullscreenAvailable && <IconButton icon={fullscreen ? 'exit-fullscreen' : 'fullscreen'}
        label={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'} onClick={onFullscreen} />}
      <ViewerMoreMenu onRemove={onRemove} onConvert={onConvert} />
      <IconButton icon="close" label="Close" onClick={onClose} />
    </div>
    {metadata && <p className="viewer-metadata">{metadata}</p>}
  </>
}

export function PlaybackControls({ status, ready, busy, frame, total, onStep, onToggle, onReplay }: {
  status: string; ready: boolean; busy: boolean; frame: number; total: number | undefined
  onStep: (direction: 'previous' | 'next') => void; onToggle: () => void; onReplay: () => void
}) {
  return <div className="viewer-controls playback-controls" role="group" aria-label="Animation playback">
    <IconButton icon="step-back" label="Previous Frame" disabled={!ready || busy || frame <= 1} onClick={() => onStep('previous')} />
    <IconButton icon={status === 'playing' ? 'pause' : 'play'} label={status === 'playing' ? 'Pause' : 'Play'}
      className="play-toggle" disabled={!ready || busy || (status !== 'paused' && status !== 'playing')} onClick={onToggle} />
    <IconButton icon="step-forward" label="Next Frame" disabled={!ready || busy || (total !== undefined && frame >= total)} onClick={() => onStep('next')} />
    <IconButton icon="replay" label="Replay" disabled={!ready} onClick={onReplay} />
  </div>
}

export function FileNavigation({ position, count, onPrevious, onNext }: {
  position: number; count: number; onPrevious: () => void; onNext: () => void
}) {
  return <div className="viewer-controls file-navigation" role="group" aria-label="Image navigation">
    <IconButton icon="previous-file" label="Previous File" disabled={position <= 1} onClick={onPrevious} />
    <p className="viewer-file-count">Image <span data-testid="session-position">{position} / {count}</span></p>
    <IconButton icon="next-file" label="Next File" disabled={position >= count} onClick={onNext} />
  </div>
}

export function ViewportControls({ ready, scale, minimum, maximum, mode, onZoom, onFit, onActual }: {
  ready: boolean; scale: number | undefined; minimum: number | undefined; maximum: number | undefined; mode: string | undefined
  onZoom: (factor: number) => void; onFit: () => void; onActual: () => void
}) {
  return <div className="viewer-controls viewport-controls" role="group" aria-label="Image view controls">
    <IconButton icon="zoom-out" label="Zoom Out" disabled={!ready || scale === undefined || minimum === undefined || scale <= minimum} onClick={() => onZoom(1 / 1.25)} />
    <output data-testid="zoom-percent" aria-label="Zoom" title={mode === 'fit' ? 'Fit to view' : mode === 'actual' ? 'Actual size: one image pixel per CSS pixel' : 'Custom zoom'}>
      {scale === undefined ? '—' : `${Math.round(scale * 100)}%`}
    </output>
    <IconButton icon="zoom-in" label="Zoom In" disabled={!ready || scale === undefined || maximum === undefined || scale >= maximum} onClick={() => onZoom(1.25)} />
    <span className="viewer-toolbar-divider" aria-hidden="true" />
    <IconButton icon="fit" label="Fit" text="Fit" title="Fit to view" className="view-mode-button" disabled={!ready} onClick={onFit} />
    <IconButton icon="actual-size" label="100%" text="1:1" title="Actual size (100%): one image pixel per CSS pixel" className="view-mode-button" disabled={!ready} onClick={onActual} />
  </div>
}
