import { useCallback, useEffect, useRef } from 'react'
import type { VirtualFile } from '../../input/virtual-file'
import { useViewerMedia, viewerErrorMessage } from './use-viewer-media'
import { useViewerFullscreen } from './use-viewer-fullscreen'
import { hasControlFocus, viewerShortcut } from './viewer-shortcuts'
import './viewer.css'

export function Viewer({ file, onClose, transition, position, count, onPrevious, onNext, onRemove }: {
  file: VirtualFile; onClose: () => void; transition: { current: Promise<void> }
  position: number; count: number; onPrevious: () => void; onNext: () => void
  onRemove: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLElement>(null)
  const media = useViewerMedia(file, transition, canvas, surface)
  const { playerRef, viewportRef, info, status, frame, busy, reconstructing, error, setError, view } = media
  const fullscreen = useViewerFullscreen(container, status === 'loading' || status === 'error' || !!error || busy || media.buffering)
  const animated = info?.kind === 'animation'
  const ready = ['ready', 'paused', 'playing', 'ended'].includes(status) && !!info
  const step = useCallback((direction: 'previous' | 'next') => {
    const player = playerRef.current
    if (!player || player.state === 'error') return
    setError('')
    void (direction === 'previous' ? player.stepBackward() : player.stepForward())
      .catch(cause => setError(viewerErrorMessage(cause)))
  }, [playerRef, setError])
  const togglePlayback = useCallback(() => {
    const player = playerRef.current
    if (!player || player.busy) return
    if (player.state === 'playing') player.pause()
    else player.play()
  }, [playerRef])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      fullscreen.reveal()
      const shortcut = viewerShortcut(event, hasControlFocus(event.target))
      if (!shortcut) return
      const viewport = viewportRef.current
      switch (shortcut) {
        case 'previous-file': if (position <= 1) return; onPrevious(); break
        case 'next-file': if (position >= count) return; onNext(); break
        case 'previous-frame': if (!animated || !ready) return; step('previous'); break
        case 'next-frame': if (!animated || !ready) return; step('next'); break
        case 'toggle-play': if (!animated || !ready) return; togglePlayback(); break
        case 'fit': if (!ready) return; viewport?.fit(); break
        case 'actual': if (!ready) return; viewport?.actual(); break
        case 'zoom-in': if (!ready) return; viewport?.zoomBy(1.25); break
        case 'zoom-out': if (!ready) return; viewport?.zoomBy(1 / 1.25); break
        case 'exit-fullscreen': if (!fullscreen.fullscreen) return; fullscreen.exit(); break
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [animated, count, fullscreen, onNext, onPrevious, position, ready, step, togglePlayback, viewportRef])

  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
  const message = status === 'loading' ? media.phase : reconstructing ? 'Reconstructing previous frame…'
    : busy ? 'Decoding…' : media.buffering ? 'Buffering…' : status === 'playing' ? 'Playing' : status === 'paused' ? 'Paused' : status === 'ended' ? 'Finished' : status === 'ready' ? 'Ready' : ''
  return <main className={`viewer${fullscreen.hidden ? ' viewer-controls-hidden' : ''}`} ref={container} tabIndex={-1}
    onPointerMove={fullscreen.reveal} onPointerDown={fullscreen.reveal}>
    <header className="viewer-chrome viewer-header" onPointerEnter={() => fullscreen.hold('pointer', true)}
      onPointerLeave={() => fullscreen.hold('pointer', false)} onFocus={() => fullscreen.hold('focus', true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) fullscreen.hold('focus', false) }}>
      <div className="viewer-heading"><h1 title={file.name}>{file.name}</h1>
        <p>{info && `${info.format.toUpperCase()} · ${info.width} × ${info.height}${animated ? ` · ${info.frames ?? '?'} frames` : ''}`}</p>
        <p className="viewer-file-count">Image <span data-testid="session-position">{position} / {count}</span></p>
      </div>
      <button onClick={onClose}>Close</button>
    </header>
    <div className="viewer-surface" data-testid="media-surface" ref={surface} tabIndex={0}
      aria-label="Image view. Drag to pan; pinch or use the wheel to zoom."
      onPointerDown={event => event.currentTarget.focus({ preventScroll: true })}>
      <canvas ref={canvas} aria-label="Image canvas" />
    </div>
    <div className="viewer-chrome viewer-bottom"
      onPointerEnter={() => fullscreen.hold('pointer', true)} onPointerLeave={() => fullscreen.hold('pointer', false)}
      onFocus={() => fullscreen.hold('focus', true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) fullscreen.hold('focus', false)
      }}>
      <div className="viewer-progress">
        <p data-testid="playback-state" className="visually-hidden">{status}</p>
        <p role="status" data-testid="viewer-operation">{message}</p>
        {animated && <p data-testid="current-frame">Frame {frame} / {info.frames ?? '?'}</p>}
      </div>
      {animated && <div className="viewer-controls playback-controls" aria-label="Animation playback">
        <button disabled={!ready || busy || frame <= 1} onClick={() => step('previous')}>Previous Frame</button>
        <button disabled={!ready || busy || (status !== 'paused' && status !== 'playing')} onClick={togglePlayback}>{status === 'playing' ? 'Pause' : 'Play'}</button>
        <button disabled={!ready || busy || (info.frames !== undefined && frame >= info.frames)} onClick={() => step('next')}>Next Frame</button>
        <button disabled={!ready} onClick={() => {
          setError(''); void playerRef.current?.replay().catch(cause => setError(viewerErrorMessage(cause)))
        }}>Replay</button>
      </div>}
      <div className="viewer-controls" aria-label="Image navigation and view">
        <button disabled={position <= 1} onClick={onPrevious}>Previous File</button>
        <button disabled={position >= count} onClick={onNext}>Next File</button>
        <button onClick={onRemove}>Remove from list</button>
        <button disabled={!ready || !view || view.scale <= view.minScale} onClick={() => viewportRef.current?.zoomBy(1 / 1.25)} aria-label="Zoom Out">−</button>
        <output data-testid="zoom-percent" aria-label="Zoom">{view ? `${Math.round(view.scale * 100)}%` : '—'}</output>
        <button disabled={!ready || !view || view.scale >= view.maxScale} onClick={() => viewportRef.current?.zoomBy(1.25)} aria-label="Zoom In">+</button>
        <button disabled={!ready} onClick={() => viewportRef.current?.fit()}>Fit</button>
        <button disabled={!ready} onClick={() => viewportRef.current?.actual()}>100%</button>
        {fullscreen.available && <button onClick={fullscreen.toggle}>{fullscreen.fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>}
      </div>
      <p role="alert">{error}</p>
      <p role="status">{fullscreen.notice}</p>
      {debug && <div className="viewer-diagnostics">
        <output data-testid="playback-metrics">{JSON.stringify(media.metrics)}</output>
        <output data-testid="step-metrics">{JSON.stringify(media.stepMetrics)}</output>
        <output data-testid="viewport-metrics">{JSON.stringify(view)}</output>
        <output data-testid="media-resource">{JSON.stringify({ kind: info?.kind, width: info?.width, height: info?.height })}</output>
      </div>}
      <p className="viewer-privacy">Files are processed locally in your browser.</p>
    </div>
  </main>
}
