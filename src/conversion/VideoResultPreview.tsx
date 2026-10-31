import { useEffect, useRef } from 'react'

/** Borrows the session URL; native video never enters MediaSession or Player. */
export default function VideoResultPreview({url,onBack}:{url:string;onBack:()=>void}){
  const video=useRef<HTMLVideoElement>(null)
  useEffect(()=>{const element=video.current;return()=>{if(element){element.pause();element.removeAttribute('src');element.load()}}},[url])
  return <main className="conversion-page" data-testid="video-result-preview">
    <header className="conversion-header"><button onClick={onBack} data-testid="video-preview-back">← Back to result</button><h1>MP4 Preview</h1></header>
    <video ref={video} src={url} controls playsInline preload="metadata" aria-label="Converted MP4 preview" data-testid="mp4-video" style={{width:'100%',maxHeight:'75dvh'}} />
  </main>
}
