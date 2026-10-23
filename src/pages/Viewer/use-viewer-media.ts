import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VirtualFile } from '../../input/virtual-file'
import { openMedia } from '../../formats/open-media'
import type { StaticImageSource } from '../../formats/static/static-image-source'
import { AnimationPlayer } from '../../player/animation-player'
import { CanvasRenderer } from '../../renderer/canvas-renderer'
import { ViewportController } from '../../renderer/viewport-controller'
import type { ViewportSnapshot } from '../../renderer/viewport-controller'
import { attachViewportGestures } from '../../renderer/viewport-gestures'
import { MediaError } from '../../media/errors'
import type { AnimationSequence } from '../../media/animation'
import { requireViewerCapabilities } from '../../media/viewer-capabilities'
import { countRuntimeEvent } from '../../media/runtime-diagnostics'

const emptyCache = { cacheBytes: 0, cachedFrames: 0, peakBytes: 0, peakFrames: 0, maxBytes: 0, underruns: 0 }
interface MediaInfo { kind: 'static' | 'animation'; format: string; width: number; height: number; frames?: number | undefined }
export const viewerErrorMessage = (cause: unknown) => cause instanceof MediaError
  ? cause.message : 'Unable to display this image. Please try another file.'

/** One keyed media lifetime: source/Player ownership and rendering stay outside UI controls. */
export function useViewerMedia(file: VirtualFile, transition: { current: Promise<void> },
  canvas: RefObject<HTMLCanvasElement | null>, surface: RefObject<HTMLDivElement | null>) {
  const playerRef = useRef<AnimationPlayer | undefined>(undefined)
  const viewportRef = useRef<ViewportController | undefined>(undefined)
  const [status, setStatus] = useState('loading')
  const [phase, setPhase] = useState(file.source === 'archive' ? 'Loading ZIP entry…' : 'Opening file…')
  const [error, setError] = useState('')
  const [info, setInfo] = useState<MediaInfo>()
  const [frame, setFrame] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reconstructing, setReconstructing] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [view, setView] = useState<ViewportSnapshot>()
  const [metrics, setMetrics] = useState(emptyCache)
  const [stepMetrics, setStepMetrics] = useState({ cacheHits: 0, reconstructions: 0, reconstructedFrames: 0 })

  useEffect(() => {
    const element = canvas.current, parent = surface.current
    if (!element || !parent) return
    let active = true
    let renderer: CanvasRenderer | undefined, observer: ResizeObserver | undefined
    let player: AnimationPlayer | undefined, image: StaticImageSource | undefined
    let pendingSequence: AnimationSequence | undefined
    let unobserve: (() => void) | undefined, detachGestures: (() => void) | undefined
    let detachVisibility: (() => void) | undefined
    let labelUpdate: number | undefined
    let abort: AbortController | undefined
    const precedingCleanup = transition.current
    const report = (cause: unknown) => {
      if (!active) return
      setStatus('error'); setError(viewerErrorMessage(cause))
    }
    const opening = (async () => {
      try {
        await precedingCleanup
        if (!active) return
        requireViewerCapabilities()
        abort = new AbortController()
        renderer = new CanvasRenderer(element)
        const viewport = new ViewportController()
        viewportRef.current = viewport
        unobserve = viewport.subscribe(snapshot => {
          if (!active) return
          renderer?.setTransform(snapshot, window.devicePixelRatio || 1)
          if (labelUpdate === undefined) labelUpdate = requestAnimationFrame(() => {
            labelUpdate = undefined
            if (active) setView(viewport.snapshot)
          })
        })
        const resize = () => {
          viewport.resize(parent.clientWidth, parent.clientHeight)
          renderer?.setTransform(viewport.snapshot, window.devicePixelRatio || 1)
        }
        resize()
        observer = new ResizeObserver(resize)
        observer.observe(parent)
        window.addEventListener('resize', resize)
        const detachPointers = attachViewportGestures(parent, viewport)
        detachGestures = () => { detachPointers(); window.removeEventListener('resize', resize) }
        const media = await openMedia(file, { signal: abort.signal, onPhase: next => {
          if (active) setPhase(next === 'decoding' ? 'Decoding…' : file.source === 'archive' ? 'Loading ZIP entry…' : 'Opening file…')
        } })
        if (!active) {
          countRuntimeEvent('staleResultsDiscarded')
          if (media.kind === 'static') media.source.dispose()
          else await media.sequence.dispose()
          return
        }
        if (media.kind === 'static') {
          image = media.source
          if (!image.image) throw new MediaError('DECODE_FAILED')
          viewport.setContent(image.width, image.height)
          renderer.renderImage(image.image, image.width, image.height)
          setInfo({ kind: 'static', format: media.format, width: image.width, height: image.height })
          setStatus('ready')
        } else {
          const sequence = media.sequence
          pendingSequence = sequence
          viewport.setContent(sequence.width, sequence.height)
          setInfo({ kind: 'animation', format: media.format, width: sequence.width, height: sequence.height, frames: sequence.frameCount })
          player = new AnimationPlayer(renderer, () => {
            if (!active || !player) return
            if (player.state === 'idle') return // Visibility may change before load has produced its first frame.
            setStatus(player.state); setFrame(player.currentFrame + 1)
            setBusy(player.busy); setReconstructing(player.reconstructing); setBuffering(player.buffering)
            setMetrics(player.metrics); setStepMetrics(player.stepMetrics)
            if (player.state === 'error') report(player.error)
          })
          playerRef.current = player
          const visibility = () => player?.setBackgrounded(document.visibilityState === 'hidden')
          visibility()
          document.addEventListener('visibilitychange', visibility)
          detachVisibility = () => document.removeEventListener('visibilitychange', visibility)
          await player.load(sequence)
          pendingSequence = undefined
        }
      } catch (cause) {
        image?.dispose()
        const cleanup = await Promise.allSettled([player?.dispose(), pendingSequence?.dispose()])
        for (const result of cleanup) if (result.status === 'rejected') countRuntimeEvent('cleanupErrors')
        if (!abort?.signal.aborted) report(cause)
      }
    })()
    return () => {
      active = false; abort?.abort()
      observer?.disconnect(); unobserve?.(); detachGestures?.(); detachVisibility?.()
      if (labelUpdate !== undefined) cancelAnimationFrame(labelUpdate)
      playerRef.current = undefined; viewportRef.current = undefined
      image?.dispose()
      const closing = player?.dispose().catch(() => countRuntimeEvent('cleanupErrors'))
      const releasing = file.release?.().catch(() => countRuntimeEvent('cleanupErrors'))
      renderer?.dispose()
      transition.current = Promise.all([opening, closing, releasing]).then(() => {})
    }
  }, [canvas, file, surface, transition])
  return { playerRef, viewportRef, status, phase, error, setError, info, frame, busy, reconstructing, buffering, view, metrics, stepMetrics }
}
