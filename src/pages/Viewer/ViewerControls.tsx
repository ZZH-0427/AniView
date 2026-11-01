import { IconButton } from '../../components/IconButton'
import { ViewerMoreMenu } from '../../components/ViewerMoreMenu'
import { useI18n } from '../../i18n'
import { LanguageSwitcher } from '../../i18n/LanguageSwitcher'

export function ViewerHeader({ name, metadata, fullscreenAvailable, fullscreen, onFullscreen, onClose, onRemove, onConvert }: {
  name: string; metadata: string | undefined; fullscreenAvailable: boolean; fullscreen: boolean
  onFullscreen: () => void; onClose: () => void; onRemove: () => void
  onConvert?: (() => void) | undefined
}) {
  const { t } = useI18n()
  return <>
    <div className="viewer-heading"><span className="viewer-brand">AniView</span><h1 title={name}>{name}</h1></div>
    <div className="viewer-header-actions">
      {fullscreenAvailable && <IconButton icon={fullscreen ? 'exit-fullscreen' : 'fullscreen'}
        label={t(fullscreen ? 'viewer.exitFullscreen' : 'viewer.fullscreen')} onClick={onFullscreen} />}
      <ViewerMoreMenu onRemove={onRemove} onConvert={onConvert} />
      <IconButton icon="close" label={t('common.close')} onClick={onClose} />
    </div>
    {metadata && <p className="viewer-metadata">{metadata}</p>}
    {fullscreen && <div className="viewer-language"><LanguageSwitcher /></div>}
  </>
}

export function PlaybackControls({ status, ready, busy, frame, total, onStep, onToggle, onReplay }: {
  status: string; ready: boolean; busy: boolean; frame: number; total: number | undefined
  onStep: (direction: 'previous' | 'next') => void; onToggle: () => void; onReplay: () => void
}) {
  const { t } = useI18n()
  return <div className="viewer-controls playback-controls" role="group" aria-label={t('viewer.playback')}>
    <IconButton icon="step-back" label={t('viewer.previousFrame')} disabled={!ready || busy || frame <= 1} onClick={() => onStep('previous')} />
    <IconButton icon={status === 'playing' ? 'pause' : 'play'} label={t(status === 'playing' ? 'viewer.pause' : 'viewer.play')}
      className="play-toggle" disabled={!ready || busy || (status !== 'paused' && status !== 'playing')} onClick={onToggle} />
    <IconButton icon="step-forward" label={t('viewer.nextFrame')} disabled={!ready || busy || (total !== undefined && frame >= total)} onClick={() => onStep('next')} />
    <IconButton icon="replay" label={t('viewer.replay')} disabled={!ready} onClick={onReplay} />
  </div>
}

export function FileNavigation({ position, count, onPrevious, onNext }: {
  position: number; count: number; onPrevious: () => void; onNext: () => void
}) {
  const { t } = useI18n()
  return <div className="viewer-controls file-navigation" role="group" aria-label={t('viewer.navigation')}>
    <IconButton icon="previous-file" label={t('viewer.previousFile')} disabled={position <= 1} onClick={onPrevious} />
    <p className="viewer-file-count">{t('viewer.image')} <span data-testid="session-position">{position} / {count}</span></p>
    <IconButton icon="next-file" label={t('viewer.nextFile')} disabled={position >= count} onClick={onNext} />
  </div>
}

export function ViewportControls({ ready, scale, minimum, maximum, mode, onZoom, onFit, onActual }: {
  ready: boolean; scale: number | undefined; minimum: number | undefined; maximum: number | undefined; mode: string | undefined
  onZoom: (factor: number) => void; onFit: () => void; onActual: () => void
}) {
  const { t } = useI18n()
  return <div className="viewer-controls viewport-controls" role="group" aria-label={t('viewer.viewControls')}>
    <IconButton icon="zoom-out" label={t('viewer.zoomOut')} disabled={!ready || scale === undefined || minimum === undefined || scale <= minimum} onClick={() => onZoom(1 / 1.25)} />
    <output data-testid="zoom-percent" aria-label={t('viewer.zoom')} title={t(mode === 'fit' ? 'viewer.fitTitle' : mode === 'actual' ? 'viewer.actualZoom' : 'viewer.customZoom')}>
      {scale === undefined ? '—' : `${Math.round(scale * 100)}%`}
    </output>
    <IconButton icon="zoom-in" label={t('viewer.zoomIn')} disabled={!ready || scale === undefined || maximum === undefined || scale >= maximum} onClick={() => onZoom(1.25)} />
    <span className="viewer-toolbar-divider" aria-hidden="true" />
    <IconButton icon="fit" label={t('viewer.fit')} text={t('viewer.fit')} title={t('viewer.fitTitle')} className="view-mode-button" disabled={!ready} onClick={onFit} />
    <IconButton icon="actual-size" label="100%" text="1:1" title={t('viewer.actual')} className="view-mode-button" disabled={!ready} onClick={onActual} />
  </div>
}
