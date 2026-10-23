import type { VirtualFile } from './virtual-file'

export function browserFile(file: File): VirtualFile {
  return { name: file.name, size: file.size, mimeType: file.type, source: 'file',
    read: (start, end) => file.slice(start, end).arrayBuffer() }
}
