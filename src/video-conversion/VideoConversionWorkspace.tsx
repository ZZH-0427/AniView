import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {Viewer} from '../pages/Viewer/Viewer'
import {RuntimeDiagnosticsPanel} from '../components/RuntimeDiagnostics'
import type {VirtualFile} from '../input/virtual-file'
import {VideoConversionSession} from './video-conversion-session'
import ConvertVideo from './ConvertVideo'
import {usePreviewReturn} from '../components/use-preview-return'
import {useI18n} from '../i18n'
export default function VideoConversionWorkspace({onBack}:{onBack:()=>void}){
 const {t}=useI18n()
 const [session]=useState(()=>new VideoConversionSession())
 const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot)
 const [preview,setPreview]=useState<VirtualFile>(),[closing,setClosing]=useState(false),[leaving,setLeaving]=useState(false)
 const transition=useRef(Promise.resolve()),lifetime=useRef(0),mounted=useRef(true)
 const {previewButton,rememberPreview}=usePreviewReturn(!preview&&!closing&&!leaving)
 useEffect(()=>{mounted.current=true;const owner=lifetime,id=++owner.current;return()=>{mounted.current=false;queueMicrotask(()=>{if(owner.current===id)void session.dispose()})}},[session])
 useEffect(()=>{if(!closing)return;let active=true;void transition.current.then(()=>{if(active)setClosing(false)});return()=>{active=false}},[closing])
 const close=()=>{setClosing(true);setPreview(undefined)}
 if(preview)return <div className="media-app has-media"><Viewer file={preview} transition={transition} position={1} count={1}
  onPrevious={()=>{}} onNext={()=>{}} onClose={close} onRemove={close}/></div>
 if(closing||leaving)return <p role="status">{t('common.closingPreview')}</p>
 return <><ConvertVideo session={session} snapshot={snapshot} previewButtonRef={previewButton} onBack={()=>{setLeaving(true);void session.dispose().then(()=>{if(mounted.current)onBack()})}}
  onPreview={()=>{const result=session.getSnapshot().result;if(result){rememberPreview();setPreview({name:result.filename,size:result.blob.size,mimeType:result.blob.type,source:'file',read:(start,end)=>result.blob.slice(start,end).arrayBuffer()})}}}/><RuntimeDiagnosticsPanel/></>
}
