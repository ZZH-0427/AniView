import { browserFile } from './browser-file'
import type { VirtualFile } from './virtual-file'

/** URL, HTML and text drops have no files and therefore produce no media. */
export function droppedFiles(data: { readonly files: ArrayLike<File> }): VirtualFile[] {
  return Array.from(data.files, (file) => browserFile(file, 'drag-drop'))
}
