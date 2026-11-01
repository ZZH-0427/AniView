import { ImageInput } from '../../components/ImageInput'
import { ArchiveInput } from '../../components/ArchiveInput'
import type { VirtualFile } from '../../input/virtual-file'
import { IconButton } from '../../components/IconButton'
import { useI18n } from '../../i18n'

export function Home({ onOpen, onArchive, onCreate,onConvertVideo }: {
  onOpen: (files: readonly VirtualFile[]) => void
  onArchive: (file: File) => void
  onCreate?: () => void
  onConvertVideo?:()=>void
}) {
  const { t } = useI18n()
  return (
    <main className="home">
      <header>
        <p className="eyebrow">{t('home.eyebrow')}</p>
        <h1>AniView</h1>
        <p className="formats">GIF · Animated WebP · APNG · JPEG · PNG · WebP</p>
      </header>

      <section className="foundation" aria-labelledby="foundation-title">
        <span className="foundation-mark" aria-hidden="true">A</span>
        <h2 id="foundation-title">{t('home.heading')}</h2>
        <p>{t('home.description')}</p>
        <ImageInput onFiles={onOpen} />
        <ArchiveInput onOpen={onArchive} />
        {onCreate && <div className="home-create-entry"><IconButton icon="create" label={t('home.createAnimation')} text={t('home.createAnimation')}
          data-testid="create-gif-entry" onClick={onCreate} /></div>}
        {onConvertVideo&&<div className="home-create-entry"><IconButton icon="video" label={t('home.convertVideo')} text={t('home.convertVideo')} data-testid="convert-video-entry" onClick={onConvertVideo}/></div>}
        <p className="drop-hint">{t('home.dropHint')}</p>
      </section>

      <footer>
        <p>{t('common.privacy')}</p>
      </footer>
    </main>
  )
}
