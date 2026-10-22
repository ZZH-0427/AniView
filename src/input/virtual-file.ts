export type FileSource = 'gallery' | 'file' | 'archive' | 'drag-drop'

/** Source adapters own browser/ZIP objects; consumers only receive local bytes. */
export interface VirtualFile {
  readonly name: string
  readonly size: number
  readonly mimeType?: string
  readonly source: FileSource
  /** Read [start, end) bytes; omitted bounds mean the entire file. */
  read(start?: number, end?: number): Promise<ArrayBuffer>
}
