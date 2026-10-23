import { useEffect, useRef, useState } from 'react'
import { browserFile } from '../../input/browser-file'
import { openAnimation } from '../../formats/open-animation'
import { AnimationPlayer } from '../../player/animation-player'
import { CanvasRenderer } from '../../renderer/canvas-renderer'
import { MediaError } from '../../media/errors'
import './viewer.css'

export function Viewer({ file, onClose }: { file: File; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const controller = useRef<AnimationPlayer | undefined>(undefined)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [metadata, setMetadata] = useState('')
  const [frame, setFrame] = useState(0)
  const [metrics, setMetrics] = useState({ cacheBytes: 0, cachedFrames: 0, peakBytes: 0, peakFrames: 0, maxBytes: 0, underruns: 0 })

  useEffect(() => {
    const surface = canvas.current
    const parent = container.current
    if (!surface || !parent) return
    let active = true
    let opened = false
    const abort = new AbortController()
    let renderer: CanvasRenderer | undefined
    let observer: ResizeObserver | undefined
    let player: AnimationPlayer | undefined
    const report = (cause: unknown) => {
      if (!active) return
      setStatus('error')
      setError(cause instanceof MediaError ? cause.message : 'Unable to play this image. Please try another file.')
    }
    void (async () => {
      try {
        renderer = new CanvasRenderer(surface)
        const resize = () => renderer?.setViewport({ width: parent.clientWidth, height: parent.clientHeight,
          devicePixelRatio: window.devicePixelRatio || 1, zoom: 1, panX: 0, panY: 0 })
        resize()
        observer = new ResizeObserver(resize)
        observer.observe(parent)
        player = new AnimationPlayer(renderer, () => {
          if (!active || !player) return
          setStatus(player.state)
          setFrame(player.currentFrame + 1)
          setMetrics(player.metrics)
          if (player.state === 'error') report(player.error)
        })
        controller.current = player
        const { sequence, format } = await openAnimation(browserFile(file), { signal: abort.signal })
        if (!active) { await sequence.dispose(); return }
        opened = true
        setMetadata(`${format.toUpperCase()} · ${sequence.width} × ${sequence.height} · ${sequence.frameCount ?? '?'} frames`)
        await player.load(sequence)
      } catch (cause) { report(cause) }
    })()
    return () => {
      active = false
      if (!opened) abort.abort()
      observer?.disconnect()
      controller.current = undefined
      void player?.dispose().catch(() => {})
      renderer?.dispose()
    }
  }, [file])

  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
  return <main className="viewer">
    <header><h1>{file.name}</h1><p>{metadata}</p></header>
    <div className="viewer-surface" ref={container}><canvas ref={canvas} aria-label="Animation canvas" /></div>
    <p data-testid="playback-state">{status}</p>
    <p data-testid="current-frame">Frame {frame}</p>
    <div className="viewer-controls">
      <button disabled={status !== 'paused' && status !== 'playing'} onClick={() => status === 'playing' ? controller.current?.pause() : controller.current?.play()}>{status === 'playing' ? 'Pause' : 'Play'}</button>
      <button disabled={status === 'loading' || status === 'error'} onClick={() => void controller.current?.replay().catch(reportReplay)}>Replay</button>
      <button onClick={onClose}>Close</button>
    </div>
    <p role="alert">{error}</p>
    {debug && <output data-testid="playback-metrics">{JSON.stringify(metrics)}</output>}
    <p>Files are processed locally in your browser.</p>
  </main>
  function reportReplay() { setError('Unable to replay. Please reopen this file.') }
}
