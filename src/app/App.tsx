import { lazy, Suspense, useEffect, useState } from 'react'
import { MediaApp } from './MediaApp'
import { useI18n } from '../i18n'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'

const WebPSpikePage = lazy(() => import('../spikes/webp/WebPSpikePage'))
const CreatorWorkspace = lazy(() => import('../creation/CreatorWorkspace'))
const VideoConversionWorkspace=lazy(()=>import('../video-conversion/VideoConversionWorkspace'))

function AppContent() {
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  const [convertingVideo,setConvertingVideo]=useState(false)
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('spike') === 'webp') {
    return <Suspense fallback={<p>Loading engineering harness…</p>}><WebPSpikePage /></Suspense>
  }
  if (creating) return <Suspense fallback={<p role="status">{t('common.openingCreator')}</p>}>
    <CreatorWorkspace onBack={() => setCreating(false)} />
  </Suspense>
  if(convertingVideo)return <Suspense fallback={<p role="status">{t('common.openingVideo')}</p>}><VideoConversionWorkspace onBack={()=>setConvertingVideo(false)}/></Suspense>
  return <MediaApp onCreate={() => setCreating(true)} onConvertVideo={()=>setConvertingVideo(true)}/>
}

export function App() {
  const { locale, t } = useI18n()
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = t('app.title')
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'))
  }, [locale, t])
  return <div className="localized-app"><div className="language-utility"><LanguageSwitcher /></div><AppContent /></div>
}
