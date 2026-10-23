const errorMessages = {
  UNSUPPORTED_FORMAT: 'This file format is not supported.',
  CORRUPTED_FILE: 'This file appears to be damaged.',
  DECODE_FAILED: 'This image could not be decoded.',
  ARCHIVE_CORRUPTED: 'This archive appears to be damaged.',
  ARCHIVE_ENCRYPTED: 'This archive requires a password.',
  ARCHIVE_UNSUPPORTED: 'This archive uses an unsupported feature.',
  OUT_OF_MEMORY: 'There is not enough memory to open this file.',
  RESOURCE_LIMIT_EXCEEDED: 'This file exceeds the supported processing limits. Please try a smaller image.',
  WORKER_FAILED: 'Media processing stopped. Please try opening the file again.',
  WASM_UNAVAILABLE: 'The required decoder could not be loaded in this browser.',
  FILE_READ_FAILED: 'This file could not be read.',
  APNG_RUNTIME_UNAVAILABLE: 'APNG playback requires Worker image decoding and OffscreenCanvas support in this browser.',
  GIF_RUNTIME_UNAVAILABLE: 'GIF playback requires Web Worker support in this browser.',
  STATIC_PNG_NOT_ANIMATED: 'This is a static PNG. Animated playback does not apply.',
} as const

export type MediaErrorCode = keyof typeof errorMessages

/** Only the stable message/code belongs in UI; cause is for local diagnostics. */
export class MediaError extends Error {
  readonly code: MediaErrorCode

  constructor(code: MediaErrorCode, options?: ErrorOptions) {
    super(errorMessages[code], options)
    this.name = 'MediaError'
    this.code = code
  }
}
