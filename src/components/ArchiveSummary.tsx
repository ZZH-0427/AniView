import { useEffect, useState } from 'react'
import type { ArchiveState } from '../app/use-media-source'
import { DiagnosticsGroup, DiagnosticsPanel, RawDiagnostics } from './DiagnosticsPanel'
import { useI18n } from '../i18n'
import type { MediaSessionItem } from '../media/media-session'
import { ArchivePasswordPrompt } from './ArchivePasswordPrompt'
import './archive-password.css'

export function ArchiveSummary({ archive, onClose, count, onUnlock, onCancelAccess, onShowPrompt, onRetry, items = [], selected = -1, onSelect }: {
  archive: ArchiveState; onClose: () => void; count: number
  onUnlock?: (password: string) => void; onCancelAccess?: () => void; onShowPrompt?: () => void; onRetry?: () => void
  items?: readonly MediaSessionItem[]; selected?: number; onSelect?: (index: number) => void
}) {
  const { t, text } = useI18n()
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
  const [metrics, setMetrics] = useState(() => archive.status === 'open' ? archive.session.metrics : null)
  useEffect(() => {
    if (!debug || archive.status !== 'open') return
    const timer = setInterval(() => setMetrics({ ...archive.session.metrics }), 100)
    return () => clearInterval(timer)
  }, [archive, debug])
  const format = archive.status === 'open' ? archive.session.format : archive.status === 'locked' ? archive.format : undefined
  return <section className="archive-summary" aria-label={format ? t('archive.section', { format: format === '7z' ? '7z' : format.toUpperCase() }) : t('archive.openAction')}>
    <h2 data-testid="archive-name">{archive.name}</h2>
    <p data-testid="archive-status" data-state={archive.status} role="status">{t(archive.status === 'open' ? 'zip.open' : archive.status === 'opening' ? 'zip.opening' : archive.status === 'locked' ? 'archive.passwordRequired' : 'zip.error')}</p>
    {archive.status === 'opening' && <p>{t('archive.reading')}</p>}
    {archive.status === 'locked' && (archive.prompt
      ? <ArchivePasswordPrompt scope="archive" format={archive.format} busy={archive.busy} error={archive.error}
          onUnlock={password => onUnlock?.(password)} onCancel={() => onCancelAccess?.()} />
      : <div className="archive-password"><p>{t('archive.cancelled')}</p>
          <button onClick={onShowPrompt} data-testid="archive-opening-retry">{t('zip.unlock')}</button></div>)}
    {archive.status === 'error' && <><p role="alert">{text(archive.errorMessage ?? { key: 'errors.archive' })}</p>
      {archive.canRetry && <button onClick={onRetry} data-testid="archive-opening-retry">{t('archive.retry')}</button>}</>}
    {archive.status === 'open' && <>
      <p>{t('zip.entries', { entries: archive.session.entries.length, count })}</p>
      {!count && <p>{t(archive.session.files.length ? 'zip.noneRemain' : 'archive.empty')}</p>}
      {archive.session.format !== 'zip' && !!items.length && <label className="archive-entry-picker">{t('archive.selectEntry')}
        <select data-testid="archive-entry-picker" value={selected} onChange={event => {
          const index = Number(event.currentTarget.value)
          if (Number.isSafeInteger(index) && index >= 0 && index < items.length) onSelect?.(index)
        }}>{items.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.file.name}</option>)}</select>
      </label>}
      {debug && <DiagnosticsPanel title="Archive diagnostics">
        <DiagnosticsGroup title="Archive" values={[
          { label: 'Entries / media', value: `${metrics?.entryCount ?? 0} / ${metrics?.mediaCount ?? 0}` },
          { label: 'Declared bytes', value: metrics?.totalDeclaredBytes ?? 0 },
          { label: 'Extractions', value: metrics?.extractions ?? 0 },
          { label: 'Current / peak bytes', value: `${metrics?.currentExtractedBytes ?? 0} / ${metrics?.peakExtractedBytes ?? 0}` },
          { label: 'Chunk / metadata / extraction (ms)', value: `${archive.chunkMs.toFixed(1)} / ${(metrics?.metadataMs ?? 0).toFixed(1)} / ${(metrics?.extractMs ?? 0).toFixed(1)}` },
        ]} />
        <RawDiagnostics items={[{ testId: 'archive-metrics', value: { ...metrics, chunkMs: archive.chunkMs } }]} />
      </DiagnosticsPanel>}
    </>}
    <button onClick={onClose}>{t('zip.close')}</button>
  </section>
}
