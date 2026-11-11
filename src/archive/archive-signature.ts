import { MediaError } from '../media/errors'

export type ArchiveSignature = 'zip' | 'rar4' | 'rar5' | '7z'

/** A whitelist at byte zero: executable/SFX and other 7-Zip handlers are excluded. */
export function archiveSignature(bytes: Uint8Array): ArchiveSignature | undefined {
  const starts = (prefix: readonly number[]) => prefix.every((byte, index) => bytes[index] === byte)
  if (starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06]) || starts([0x50, 0x4b, 0x07, 0x08])) return 'zip'
  if (starts([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) return 'rar4'
  if (starts([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])) return 'rar5'
  if (starts([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z'
  return undefined
}

export async function detectArchiveSignature(file: Blob & { readonly name?: string }, signal?: AbortSignal): Promise<ArchiveSignature> {
  signal?.throwIfAborted()
  const signature = archiveSignature(new Uint8Array(await file.slice(0, 8).arrayBuffer()))
  signal?.throwIfAborted()
  if (!signature) throw new MediaError('ARCHIVE_UNSUPPORTED_FORMAT')
  // No pairing UI or hidden search for adjacent volumes. Signatures still choose the engine.
  if (signature !== 'zip' && /(?:\.part\d+\.rar|\.r\d{2}|\.7z\.\d+)$/iu.test(file.name ?? '')) {
    throw new MediaError('ARCHIVE_MULTIVOLUME_UNSUPPORTED')
  }
  return signature
}
