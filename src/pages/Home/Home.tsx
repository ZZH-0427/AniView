export function Home({ onOpen }: { onOpen?: (file: File) => void }) {
  return (
    <main className="home">
      <header>
        <p className="eyebrow">Local Animated Media Viewer</p>
        <h1>AniView</h1>
        <p className="formats">GIF · Animated WebP · APNG</p>
      </header>

      <section className="foundation" aria-labelledby="foundation-title">
        <span className="foundation-mark" aria-hidden="true">A</span>
        <h2 id="foundation-title">Open WebP or APNG</h2>
        <p>Early development. Animated WebP and APNG playback are available; GIF is planned.</p>
        <label className="open-file">Open WebP or APNG
          <input aria-label="Open WebP or APNG" type="file" accept=".webp,.png,.apng,image/webp,image/png,image/apng" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onOpen?.(file)
            event.target.value = ''
          }} />
        </label>
      </section>

      <footer>
        <p>Files are processed locally in your browser.</p>
      </footer>
    </main>
  )
}
