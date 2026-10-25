import { BinaryFormatDetector } from '../formats/binary-detector'
import type { DetectedFormat, FormatDetector } from '../formats/detector'
import type { VirtualFile } from '../input/virtual-file'
import { MediaError } from '../media/errors'

export const CREATION_DETECTION_PREFIX_BYTES = 64 * 1024

/** One admission-only prefix avoids repeated Android provider opens for PNG headers. */
export async function detectCreationSource(file: VirtualFile, detector: FormatDetector = new BinaryFormatDetector(), signal?: AbortSignal): Promise<DetectedFormat> {
  let prefix: Promise<ArrayBuffer> | undefined
  let closed = false
  const readExact = async (start: number, end: number): Promise<ArrayBuffer> => {
    if (closed || signal?.aborted) throw new MediaError('FILE_READ_FAILED')
    try {
      const data = await file.read(start, end)
      if (closed || signal?.aborted || data.byteLength !== end - start) throw new MediaError('FILE_READ_FAILED')
      return data
    } catch (cause) {
      throw cause instanceof MediaError ? cause : new MediaError('FILE_READ_FAILED', { cause })
    }
  }
  const cached: VirtualFile = {
    name: file.name, size: file.size, source: file.source,
    ...(file.mimeType === undefined ? {} : { mimeType: file.mimeType }),
    read: async (start = 0, end = file.size) => {
      if (closed || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start < 0 || end < start || end > file.size || signal?.aborted) throw new MediaError('FILE_READ_FAILED')
      if (start === end) return new ArrayBuffer(0)
      // Lazy initialization also keeps injected/readless detectors free of I/O.
      const bytes = await (prefix ??= readExact(0, Math.min(file.size, CREATION_DETECTION_PREFIX_BYTES)))
      if (end <= bytes.byteLength) return bytes.slice(start, end)
      // The authoritative detector still walks late PNG chunk headers. Do not
      // classify an image as static merely because animation metadata is distant.
      return readExact(start, end)
    },
  }
  try { return await detector.detect(cached, signal) }
  finally {
    // Neither this wrapper nor its encoded prefix becomes a session/source cache.
    closed = true
    prefix = undefined
  }
}
