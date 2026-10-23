import type { FileSource, VirtualFile } from './virtual-file'

export function browserFile(file: File, source: FileSource = 'file'): VirtualFile {
  return { name: file.name, size: file.size, mimeType: file.type, source,
    read: (start, end) => file.slice(start, end).arrayBuffer() }
}
