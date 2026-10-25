import { ImageInput } from '../../components/ImageInput'
import { ArchiveInput } from '../../components/ArchiveInput'
import type { VirtualFile } from '../../input/virtual-file'
import { IconButton } from '../../components/IconButton'

export function Home({ onOpen, onArchive, onCreate }: {
  onOpen: (files: readonly VirtualFile[]) => void
  onArchive: (file: File) => void
  onCreate?: () => void
}) {
  return (
    <main className="home">
      <header>
        <p className="eyebrow">Local Animated Media Viewer</p>
        <h1>AniView</h1>
        <p className="formats">GIF · Animated WebP · APNG · JPEG · PNG · WebP</p>
      </header>

      <section className="foundation" aria-labelledby="foundation-title">
        <span className="foundation-mark" aria-hidden="true">A</span>
        <h2 id="foundation-title">Your images, on your device</h2>
        <p>View photos and animations. Inspect frames, zoom in and explore.</p>
        <ImageInput onFiles={onOpen} />
        <ArchiveInput onOpen={onArchive} />
        {onCreate && <div className="home-create-entry"><IconButton icon="create" label="Create GIF" text="Create GIF"
          data-testid="create-gif-entry" onClick={onCreate} /></div>}
        <p className="drop-hint">Drag &amp; drop images here. You can select several at once.</p>
      </section>

      <footer>
        <p>Files are processed locally in your browser.</p>
      </footer>
    </main>
  )
}
