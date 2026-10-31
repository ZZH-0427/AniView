import type { VirtualFile } from '../input/virtual-file'
import { trackRuntimeResource } from '../media/runtime-diagnostics'
import { ConversionError } from './model'
import type { AnimationFrameSource, ConversionFormat } from './model'

/** A separate decode-back pass; no encoder/source metadata is presented as output metadata. */
export async function inspectConversionOutput(file: VirtualFile, format: ConversionFormat, signal: AbortSignal,
  open: (file: VirtualFile, format: ConversionFormat, signal?: AbortSignal) => Promise<AnimationFrameSource>) {
  const worker = new Worker(new URL('./inspection.worker.ts', import.meta.url), { type: 'module' })
  const release = trackRuntimeResource('worker')
  let source: AnimationFrameSource | undefined, id = 0
  let failed = false
  let pending: { reject(error: ConversionError): void; timer: ReturnType<typeof setTimeout> } | undefined
  const abort = () => { worker.terminate(); pending?.reject(new ConversionError('CANCELLED')); void source?.close() }
  signal.addEventListener('abort', abort, { once: true })
  worker.onerror = event => { event.preventDefault(); failed = true; pending?.reject(new ConversionError('WORKER_FAILED')) }
  worker.onmessageerror = () => { failed = true; pending?.reject(new ConversionError('WORKER_FAILED')) }
  try {
    if (signal.aborted) throw new ConversionError('CANCELLED')
    source = await open(file, format, signal)
    let durationMs = 0
    while (true) {
      const frame = await source.next()
      if (signal.aborted) throw new ConversionError('CANCELLED')
      if (!frame) break
      if (failed) throw new ConversionError('WORKER_FAILED')
      durationMs += frame.durationMs
      await new Promise<void>((resolve, reject) => {
        const request = ++id, timer = setTimeout(() => reject(new ConversionError('WORKER_FAILED')), 120_000)
        pending = { reject, timer }
        worker.onmessage = (event: MessageEvent<{ id: number }>) => { if (event.data.id === request) resolve() }
        worker.postMessage({ id: request, rgba: frame.rgba }, [frame.rgba])
        if (frame.rgba.byteLength !== 0) reject(new ConversionError('WORKER_FAILED'))
      }).finally(() => { clearTimeout(pending?.timer); pending = undefined })
      source.acknowledgeFrame()
    }
    return { ...source.metadata, durationMs }
  } finally {
    signal.removeEventListener('abort', abort); clearTimeout(pending?.timer)
    worker.terminate(); release(); await source?.close()
  }
}
