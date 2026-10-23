import { browserFile } from './browser-file'
import type { VirtualFile } from './virtual-file'

export interface FileSelection {
  readonly files: ArrayLike<File> | null
  value: string
}

/** Copy references before resetting the control so selecting the same file works. */
export function takeFileSelection(input: FileSelection): VirtualFile[] {
  try {
    return Array.from(input.files ?? [], (file) => browserFile(file))
  } finally {
    input.value = ''
  }
}
