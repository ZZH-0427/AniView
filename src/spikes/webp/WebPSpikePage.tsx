import { useEffect, useRef, useState } from 'react'
import { WebPDecoder } from '../../formats/webp/webp-decoder'
import type { WebPMetadata } from '../../formats/webp/webp-worker-protocol'
import { MediaError } from '../../media/errors'
import './webp-spike.css'

interface FrameInfo { index: number; durationMs: number; decodeMs: number; deliveryMs: number }

export default function WebPSpikePage() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const client = useRef<WebPDecoder | undefined>(undefined)
  const generation = useRef(0)
  const alive = useRef(true)
  const [file, setFile] = useState<File | undefined>(undefined)
  const [metadata, setMetadata] = useState<WebPMetadata | undefined>(undefined)
  const [frame, setFrame] = useState<FrameInfo | undefined>(undefined)
  const [workerStatus, setWorkerStatus] = useState('closed')
  const [wasmStatus, setWasmStatus] = useState('not loaded')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [readyMs, setReadyMs] = useState(0)
  const [wasmMs, setWasmMs] = useState(0)
  const [heapBytes, setHeapBytes] = useState(0)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; client.current?.dispose() }
  }, [])

  function clearCanvas() {
    const surface = canvas.current
    surface?.getContext('2d')?.clearRect(0, 0, surface.width, surface.height)
  }

  async function close() {
    const epoch = ++generation.current
    const decoder = client.current
    client.current = undefined
    // Idle contexts get an explicit C destroy. Pending work is cancelled by termination.
    try { await decoder?.close() } catch { /* Worker may already be stopped or busy. */ }
    finally { decoder?.dispose() }
    if (!alive.current || generation.current !== epoch) return false
    setBusy(false)
    setMetadata(undefined)
    setFrame(undefined)
    setWorkerStatus('closed')
    setWasmStatus('not loaded')
    setHeapBytes(0)
    setError('')
    clearCanvas()
    return true
  }

  function report(cause: unknown) {
    setError(cause instanceof MediaError ? `${cause.code}: ${cause.message}` : 'DECODE_FAILED: Unable to process this image.')
    setWorkerStatus('error')
  }

  async function open() {
    if (!file) return
    if (!await close()) return
    const epoch = ++generation.current
    setBusy(true)
    setWorkerStatus('initializing')
    setWasmStatus('loading')
    const start = performance.now()
    try {
      const decoder = new WebPDecoder()
      client.current = decoder
      const response = await decoder.open({ name: file.name, size: file.size, mimeType: file.type, source: 'file',
        read: (start, end) => file.slice(start, end).arrayBuffer() })
      if (!alive.current || generation.current !== epoch) return
      if (response.type !== 'ready') throw new MediaError('DECODE_FAILED')
      setMetadata(response.metadata)
      setReadyMs(performance.now() - start)
      setWasmMs(response.wasmReadyMs)
      setHeapBytes(response.heapBytes)
      setWorkerStatus('ready')
      setWasmStatus('loaded')
    } catch (cause) {
      if (alive.current && generation.current === epoch) { report(cause); setWasmStatus('unavailable / no active decoder'); client.current?.dispose(); client.current = undefined }
    } finally { if (alive.current && generation.current === epoch) setBusy(false) }
  }

  async function command(type: 'next' | 'reset') {
    const decoder = client.current
    if (!decoder) return
    const epoch = generation.current
    setBusy(true)
    setError('')
    const requestStart = performance.now()
    try {
      const response = await (type === 'next' ? decoder.next() : decoder.reset())
      if (!alive.current || generation.current !== epoch) return
      if (response.type === 'frame') {
        const surface = canvas.current
        if (!surface) return
        surface.width = response.width
        surface.height = response.height
        const context = surface.getContext('2d')
        if (!context) throw new MediaError('DECODE_FAILED')
        context.putImageData(new ImageData(new Uint8ClampedArray(response.rgba), response.width, response.height), 0, 0)
        // Only small diagnostics enter React state. RGBA references die after this call.
        setFrame({ index: response.frameIndex, durationMs: response.durationMs, decodeMs: response.decodeMs, deliveryMs: performance.now() - requestStart })
        setHeapBytes(response.heapBytes)
        setWorkerStatus('ready')
      } else if (response.type === 'end') setWorkerStatus('end')
      else if (response.type === 'reset') { setFrame(undefined); clearCanvas(); setWorkerStatus('ready') }
      else throw new MediaError('DECODE_FAILED')
    } catch (cause) { if (alive.current && generation.current === epoch) report(cause) }
    finally { if (alive.current && generation.current === epoch) setBusy(false) }
  }

  return (
    <main className="webp-spike">
      <h1>Animated WebP technical spike</h1>
      <p>Milestone 1A engineering harness · libwebp 1.6.0 · not the production player.</p>
      <p>Files are processed locally in your browser.</p>
      <p><a href={`${import.meta.env.BASE_URL}third-party-notices.txt`}>Codec and runtime license notices</a></p>
      <label>Select Animated WebP <input type="file" accept=".webp,image/webp" disabled={busy}
        onChange={(event) => { const selected = event.target.files?.[0]; void close().then((current) => { if (current) setFile(selected) }) }} /></label>
      <div className="spike-controls">
        <button onClick={() => void open()} disabled={!file || busy}>Open File</button>
        <button onClick={() => void command('next')} disabled={!metadata || busy || workerStatus === 'error'}>Start / Decode next</button>
        <button onClick={() => void command('reset')} disabled={!metadata || busy || workerStatus === 'error'}>Reset</button>
        <button onClick={() => void close()}>Close</button>
      </div>
      <p data-testid="worker-status">Worker status: {workerStatus}</p>
      <p data-testid="wasm-status">WASM status: {wasmStatus}</p>
      <dl>
        <dt>Dimensions</dt><dd data-testid="dimensions">{metadata ? `${metadata.width} × ${metadata.height}` : '—'}</dd>
        <dt>Frame count</dt><dd data-testid="frame-count">{metadata?.frameCount ?? '—'}</dd>
        <dt>Loop count (libwebp)</dt><dd data-testid="loop-count">{metadata?.loopCount ?? '—'}</dd>
        <dt>Current frame (1-based)</dt><dd data-testid="frame-index">{frame ? frame.index + 1 : '—'}</dd>
        <dt>Duration (ms)</dt><dd data-testid="duration">{frame?.durationMs ?? '—'}</dd>
        <dt>WASM ready (ms)</dt><dd data-testid="wasm-ms">{wasmMs.toFixed(2)}</dd>
        <dt>Decoder ready incl. file read (ms)</dt><dd data-testid="ready-ms">{readyMs.toFixed(2)}</dd>
        <dt>Decode + copy (ms)</dt><dd data-testid="decode-ms">{frame?.decodeMs.toFixed(2) ?? '—'}</dd>
        <dt>Next request → canvas (ms)</dt><dd data-testid="delivery-ms">{frame?.deliveryMs.toFixed(2) ?? '—'}</dd>
        <dt>WASM heap (bytes)</dt><dd data-testid="heap-bytes">{heapBytes}</dd>
      </dl>
      <p role="alert" data-testid="error">{error}</p>
      <canvas ref={canvas} width={1} height={1} aria-label="Decoded RGBA canvas" />
    </main>
  )
}
