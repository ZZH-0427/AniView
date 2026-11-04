import { BinaryFormatDetector } from '../formats/binary-detector'
import { ConversionError } from '../conversion/model'
import type { ConversionFormat } from '../conversion/model'
import { openAnimationFrameSource } from '../conversion/frame-source'
import { inspectConversionOutput } from '../conversion/output-inspection'
import type { VirtualFile } from '../input/virtual-file'
import type { CreationCleanup } from '../media/creation-cleanup'

/** A successful encoder response is not output validation. Read the actual encoded stream. */
export async function inspectCreationOutput(blob: Blob, format: ConversionFormat, signal: AbortSignal,
  observe?: (value: Partial<CreationCleanup>) => void) {
  const file: VirtualFile = { name: '', size: blob.size, source: 'file', mimeType: blob.type,
    read: (a, b) => blob.slice(a, b).arrayBuffer() }
  const detected = await new BinaryFormatDetector().detect(file, signal)
  if (detected.kind !== format || !('animated' in detected) || !detected.animated) throw new ConversionError('TARGET_ENCODE_FAILED')
  try {
    return await inspectConversionOutput(file, format, signal, async (input, target, abort) => {
      // The inspector creates its consumer Worker before invoking this callback.
      observe?.({ activeInspectionWorkers: 1 })
      const source = await openAnimationFrameSource(input, target, abort)
      observe?.({ activeValidationDecoderWorkers: 1 })
      return source
    })
  } finally { observe?.({ activeInspectionWorkers: 0, activeValidationDecoderWorkers: 0 }) }
}
