import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'

/** Borrows the session URL; native video never enters MediaSession or Player. */
export default function VideoResultPreview({url,onBack}:{url:string;onBack:()=>void}){
  const { t } = useI18n()
  const video=useRef<HTMLVideoElement>(null)
  useEffect(()=>{const element=video.current;return()=>{if(element){element.pause();element.removeAttribute('src');element.load()}}},[url])
  return <main className="conversion-page" data-testid="video-result-preview">
    <header className="conversion-header"><button onClick={onBack} data-testid="video-preview-back">← {t('common.backResult')}</button><h1>{t('result.mp4Preview')}</h1></header>
    <video ref={video} src={url} controls playsInline preload="metadata" aria-label={t('result.mp4Label')} data-testid="mp4-video" style={{width:'100%',maxHeight:'75dvh'}} />
  </main>
}
