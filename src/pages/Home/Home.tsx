import { ImageInput } from '../../components/ImageInput'
import { ArchiveInput } from '../../components/ArchiveInput'
import type { VirtualFile } from '../../input/virtual-file'

export function Home({ onOpen, onArchive }: {
  onOpen: (files: readonly VirtualFile[]) => void
  onArchive: (file: File) => void
}) {
  return (
    <main className="home">
      <header>
        <p className="eyebrow">Local Animated Media Viewer</p>
        <h1>AniView</h1>
        <p className="formats">GIF · Animated WebP · APNG</p>
      </header>

      <section className="foundation" aria-labelledby="foundation-title">
        <span className="foundation-mark" aria-hidden="true">A</span>
        <h2 id="foundation-title">Your animations, on your device</h2>
        <p>Play GIF, Animated WebP and APNG files.</p>
        <ImageInput onFiles={onOpen} />
        <ArchiveInput onOpen={onArchive} />
        <p className="drop-hint">Drag &amp; drop images here. You can select several at once.</p>
        <p>Static-image viewing is not available yet.</p>
      </section>

      <footer>
        <p>Files are processed locally in your browser.</p>
      </footer>
    </main>
  )
}
