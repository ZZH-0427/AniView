import {renderToStaticMarkup} from 'react-dom/server'
import {describe,expect,it} from 'vitest'
import {App} from '../app/App'
import ConvertVideo from './ConvertVideo'
import {VideoConversionSession} from './video-conversion-session'
import type {VideoProductError} from './errors'
import {videoErrorMessage} from './errors'
describe('video conversion product surface',()=>{
 it('exposes a separate lazy Home entry without replacing Viewer or GIF creation',()=>{
  const html=renderToStaticMarkup(<App/>);expect(html).toContain('data-testid="convert-video-entry"')
  expect(html).toContain('Create animation');expect(html).toContain('Choose Images');expect(html).toContain('Open ZIP archive')
  expect(html).not.toContain('video-conversion-page')
 })
 it('renders accessible single-file selection, trim/settings and a disabled initial conversion',()=>{
  const session=new VideoConversionSession(),html=renderToStaticMarkup(<ConvertVideo session={session} snapshot={session.getSnapshot()} onBack={()=>{}} onPreview={()=>{}}/>)
  for(const text of['Convert video','Set Start','Set End','Estimated result','Original','Loop forever','Sampled frames']){
   if(text!=='Sampled frames')expect(html).toContain(text)
  }
  expect(html).toContain('accept=".mp4,.webm,video/mp4,video/webm"');expect(html).not.toContain('multiple=');expect(html).not.toContain('capture=')
  expect(html).toMatch(/data-testid="video-convert" disabled=""/);expect(html).not.toContain('trackParFallbackSamples')
  expect(html).not.toContain('Summary JSON')
 })
 it.each(['VIDEO_CONTAINER_UNSUPPORTED','VIDEO_CODEC_UNSUPPORTED','VIDEO_DECODER_UNAVAILABLE','VIDEO_CONFIG_UNSUPPORTED','VIDEO_TIMELINE_UNSUPPORTED',
  'VIDEO_SOURCE_LIMIT','VIDEO_OUTPUT_PLAN_LIMIT','VIDEO_PREROLL_LIMIT','VIDEO_JOB_DEADLINE','VIDEO_DRAW_FAILED','VIDEO_RGBA_FAILED','TARGET_ENCODER_UNSUPPORTED','TARGET_ENCODE_FAILED','WORKER_FAILED','CANCELLED'] as VideoProductError[])(
  'maps%s to a stable recoverable user message',code=>{expect(videoErrorMessage(code).length).toBeGreaterThan(20);expect(videoErrorMessage(code)).not.toContain(code)})
})
