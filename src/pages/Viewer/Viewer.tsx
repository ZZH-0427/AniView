import { useCallback, useEffect, useRef } from 'react'
import type { VirtualFile } from '../../input/virtual-file'
import { useViewerMedia } from './use-viewer-media'
import { useViewerFullscreen } from './use-viewer-fullscreen'
import { hasControlFocus, viewerShortcut } from './viewer-shortcuts'
import { ViewerHeader, PlaybackControls, FileNavigation, ViewportControls } from './ViewerControls'
import { ViewerDiagnostics } from '../../components/DiagnosticsPanel'
import './viewer.css'
import { useI18n } from '../../i18n'
import { mediaMessage } from '../../i18n/media-errors'

export function Viewer({ file, onClose, transition, position, count, onPrevious, onNext, onRemove, onConvert }: {
  file: VirtualFile; onClose: () => void; transition: { current: Promise<void> }
  position: number; count: number; onPrevious: () => void; onNext: () => void
  onRemove: () => void
  onConvert?: (() => void) | undefined
}) {
  const { t, text } = useI18n()
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
    setError(undefined)
    void (direction === 'previous' ? player.stepBackward() : player.stepForward())
      .catch(cause => setError(mediaMessage(cause)))
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

  const message = status === 'loading' ? t(media.phase === 'decoding' ? 'viewer.decoding' : media.phase === 'archive' ? 'viewer.loadingZip' : 'viewer.opening')
    : reconstructing ? t('viewer.reconstructing') : busy ? t('viewer.decoding') : media.buffering ? t('viewer.buffering')
      : status === 'playing' ? t('viewer.playing') : status === 'paused' ? t('viewer.paused') : status === 'ended' ? t('viewer.finished') : status === 'ready' ? t('viewer.ready') : ''
  return <main className={`viewer${fullscreen.hidden ? ' viewer-controls-hidden' : ''}`} ref={container} tabIndex={-1}
    onPointerMove={fullscreen.reveal} onPointerDown={fullscreen.reveal}>
    <header className="viewer-chrome viewer-header" onPointerEnter={() => fullscreen.hold('pointer', true)}
      onPointerLeave={() => fullscreen.hold('pointer', false)} onFocus={() => fullscreen.hold('focus', true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) fullscreen.hold('focus', false) }}>
      <ViewerHeader name={file.name}
        metadata={info && `${info.format.toUpperCase()} · ${info.width} × ${info.height}${animated ? ` · ${t('viewer.frames', { count: info.frames ?? '?' })}` : ''}`}
        fullscreenAvailable={fullscreen.available} fullscreen={fullscreen.fullscreen} onFullscreen={fullscreen.toggle}
        onClose={onClose} onRemove={onRemove} onConvert={animated && ready && onConvert ? () => {
          void (async () => {
            if (document.fullscreenElement) {
              try { await document.exitFullscreen() } catch { setError({ key: 'viewer.exitBeforeConvert' }); return }
            }
            onConvert()
          })()
        } : undefined} />
    </header>
    <div className="viewer-surface" data-testid="media-surface" ref={surface} tabIndex={0}
      aria-label={t('viewer.surface')}
      onPointerDown={event => event.currentTarget.focus({ preventScroll: true })}>
      <canvas ref={canvas} aria-label={t('viewer.canvas')} />
    </div>
    <div className="viewer-chrome viewer-bottom"
      onPointerEnter={() => fullscreen.hold('pointer', true)} onPointerLeave={() => fullscreen.hold('pointer', false)}
      onFocus={() => fullscreen.hold('focus', true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) fullscreen.hold('focus', false)
      }}>
      <div className="viewer-progress">
        <p data-testid="playback-state" data-state={status} className="visually-hidden">{t(status === 'loading' ? 'viewer.state.loading' : status === 'playing' ? 'viewer.state.playing' : status === 'paused' ? 'viewer.state.paused' : status === 'ended' ? 'viewer.state.ended' : status === 'error' ? 'viewer.state.error' : 'viewer.state.ready')}</p>
        <p role="status" data-testid="viewer-operation">{message}</p>
        {animated && <p data-testid="current-frame">{t('viewer.framePosition', { current: frame, total: info.frames ?? '?' })}</p>}
      </div>
      {animated && <PlaybackControls status={status} ready={ready} busy={busy} frame={frame} total={info.frames}
        onStep={step} onToggle={togglePlayback} onReplay={() => {
          setError(undefined); void playerRef.current?.replay().catch(cause => setError(mediaMessage(cause)))
        }} />}
      <FileNavigation position={position} count={count} onPrevious={onPrevious} onNext={onNext} />
      <ViewportControls ready={ready} scale={view?.scale} minimum={view?.minScale} maximum={view?.maxScale} mode={view?.mode}
        onZoom={factor => viewportRef.current?.zoomBy(factor)} onFit={() => viewportRef.current?.fit()} onActual={() => viewportRef.current?.actual()} />
      <p role="alert">{error && text(error)}</p>
      <p role="status">{fullscreen.notice && t(fullscreen.notice === 'unavailable' ? 'viewer.fullscreenFailed' : 'viewer.fullscreenExitFailed')}</p>
      <ViewerDiagnostics metrics={media.metrics} stepMetrics={media.stepMetrics} view={view} info={info} />
      <p className="viewer-privacy">{t('common.privacy')}</p>
    </div>
  </main>
}
