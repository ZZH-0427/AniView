import {
  ERR_ENCRYPTED, ERR_ENCRYPTED_CENTRAL_DIRECTORY, ERR_INVALID_PASSWORD,
  ERR_INVALID_AUTHENTICATION_CODE, ERR_INVALID_CRC32, ERR_INVALID_COMPRESSED_DATA,
  ERR_INVALID_UNCOMPRESSED_SIZE, ERR_UNSUPPORTED_COMPRESSION, ERR_RESERVED_COMPRESSION_METHOD,
  ERR_UNSUPPORTED_ENCRYPTION, ERR_UNSUPPORTED_FORMAT, ERR_SPLIT_ZIP_FILE,
  ERR_UNSUPPORTED_UINT64, ERR_CODEC_OUT_OF_MEMORY,
} from '@zip.js/zip.js'
import { MediaError } from '../media/errors'
import type { ArchiveEncryption } from './archive-policy'

/** zip.js 2.23.0 exports message constants, not error codes. Keep this comparison at the adapter. */
export function archiveFailure(cause: unknown, encryption: ArchiveEncryption = 'none'): MediaError | DOMException {
  if (cause instanceof MediaError) return cause
  if (cause instanceof Error && cause.name === 'AbortError') return new DOMException('Cancelled', 'AbortError')
  const message = cause instanceof Error ? cause.message : ''
  if (message === ERR_INVALID_PASSWORD) return new MediaError('ARCHIVE_WRONG_PASSWORD')
  if (message === ERR_ENCRYPTED) return new MediaError('ARCHIVE_ENCRYPTED')
  if ([ERR_ENCRYPTED_CENTRAL_DIRECTORY, ERR_UNSUPPORTED_ENCRYPTION].includes(message)) return new MediaError('ARCHIVE_UNSUPPORTED_ENCRYPTION')
  if ([ERR_UNSUPPORTED_COMPRESSION, ERR_RESERVED_COMPRESSION_METHOD, ERR_UNSUPPORTED_FORMAT,
    ERR_SPLIT_ZIP_FILE, ERR_UNSUPPORTED_UINT64].includes(message)) return new MediaError('ARCHIVE_UNSUPPORTED')
  if (message === ERR_CODEC_OUT_OF_MEMORY || cause instanceof RangeError) return new MediaError('OUT_OF_MEMORY')
  if (message === ERR_INVALID_AUTHENTICATION_CODE) return new MediaError('ARCHIVE_INTEGRITY_FAILED')
  // A ZipCrypto wrong password can pass its one-byte verifier. Never claim certainty or retry automatically.
  if (encryption === 'zipcrypto' && [ERR_INVALID_CRC32, ERR_INVALID_COMPRESSED_DATA, ERR_INVALID_UNCOMPRESSED_SIZE].includes(message)) {
    return new MediaError('ARCHIVE_PASSWORD_OR_CORRUPTED')
  }
  return new MediaError('ARCHIVE_CORRUPTED')
}
