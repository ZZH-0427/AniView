const errorMessages = {
  STATIC_IMAGE_RUNTIME_UNAVAILABLE: 'Static-image viewing requires Blob and ImageBitmap support in this browser.',
  VIEWER_RUNTIME_UNAVAILABLE: 'Image viewing requires Canvas, AbortController, Pointer Events, ResizeObserver and animation-frame support in this browser.',
  UNSUPPORTED_FORMAT: 'Unsupported image format.',
  CORRUPTED_FILE: 'This file appears to be damaged.',
  DECODE_FAILED: 'This image could not be decoded.',
  ARCHIVE_CORRUPTED: 'This archive appears to be damaged.',
  ARCHIVE_ENCRYPTED: 'This ZIP entry requires a password.',
  ARCHIVE_UNSUPPORTED_ENCRYPTION: 'This ZIP uses an encryption method that AniView does not support.',
  ARCHIVE_INTEGRITY_FAILED: 'This encrypted entry could not be verified. The file may be damaged or incomplete.',
  ARCHIVE_PASSWORD_OR_CORRUPTED: 'This encrypted entry could not be verified. Check the password or use an undamaged copy of the file.',
  ARCHIVE_UNSUPPORTED: 'This archive uses an unsupported feature.',
  ARCHIVE_INVALID: 'This file is not a valid ZIP archive.',
  ARCHIVE_LIMIT_EXCEEDED: 'This archive exceeds the supported safety limits.',
  ARCHIVE_ENTRY_TOO_LARGE: 'This ZIP entry is too large to open safely.',
  ARCHIVE_CLOSED: 'This archive has been closed. Please open it again.',
  ARCHIVE_WRONG_PASSWORD: 'The password was not accepted. Check the password and try again.',
  ARCHIVE_UNSUPPORTED_FORMAT: 'Unsupported archive format. Please choose a ZIP, RAR, or 7z archive.',
  ARCHIVE_UNSUPPORTED_METHOD: 'This archive uses a compression method that AniView does not support.',
  ARCHIVE_TIMEOUT: 'This archive took too long to process and was stopped.',
  ARCHIVE_MULTIVOLUME_UNSUPPORTED: 'Multi-volume archives are not supported.',
  ARCHIVE_BACKEND_ASSET_FAILED: 'The archive component could not be loaded. Please try again.',
  ARCHIVE_WASM_INITIALIZATION_FAILED: 'The archive component could not start. Please try again.',
  ARCHIVE_BACKEND_ERROR: 'This archive could not be processed. Please try again or use another archive.',
  OUT_OF_MEMORY: 'There is not enough memory to open this file.',
  RESOURCE_LIMIT_EXCEEDED: 'This file exceeds the supported processing limits. Please try a smaller image.',
  WORKER_FAILED: 'Media processing stopped. Please try opening the file again.',
  WASM_UNAVAILABLE: 'The required decoder could not be loaded in this browser.',
  FILE_READ_FAILED: 'This file could not be read.',
  APNG_RUNTIME_UNAVAILABLE: 'APNG playback requires Worker image decoding and OffscreenCanvas support in this browser.',
  GIF_RUNTIME_UNAVAILABLE: 'GIF playback requires Web Worker support in this browser.',
  STATIC_PNG_NOT_ANIMATED: 'This file is a static image. Static-image viewing is not available in this milestone.',
  STATIC_IMAGE_NOT_AVAILABLE: 'This file is a static image. Static-image viewing is not available in this milestone.',
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
