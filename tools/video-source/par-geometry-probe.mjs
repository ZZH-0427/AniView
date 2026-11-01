// Isolated numeric diagnostic. Does not rebuild or alter the frozen 8D1 candidate.
import {build} from 'vite'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const source=resolve('.tools/video-source/par-probe-source')
const output=resolve('.tools/video-source-site/par-followup')
await mkdir(source,{recursive:true})
await writeFile(resolve(source,'worker.js'),String.raw`
import {Input,BufferSource,MP4,VideoSampleSink} from 'mediabunny'
const pickConfig=c=>({codec:c.codec,codedWidth:c.codedWidth,codedHeight:c.codedHeight,
  displayAspectWidth:c.displayAspectWidth,displayAspectHeight:c.displayAspectHeight,
  descriptionBytes:c.description?.byteLength??0})
const frameGeometry=f=>({codedWidth:f.codedWidth,codedHeight:f.codedHeight,
  displayWidth:f.displayWidth,displayHeight:f.displayHeight,format:f.format,
  visibleRect:f.visibleRect?{x:f.visibleRect.x,y:f.visibleRect.y,width:f.visibleRect.width,height:f.visibleRect.height}:null})
self.onmessage=async()=>{
 const report={diagnosticVersion:'par-geometry-1',secureContext:self.isSecureContext,
  browser:navigator.userAgent,hmr:false,nativeFrames:[],configured:[],samples:[],
  sampleAcquired:0,sampleClosed:0,inputDisposed:false,iteratorReturned:false,errors:[]}
 let input,iterator,sample
 const NativeDecoder=self.VideoDecoder
 try{
  if(!self.isSecureContext||!NativeDecoder)throw Error('VIDEO_DECODER_UNAVAILABLE')
  // Observe frames before Mediabunny's existing Android copy; ownership stays with the library.
  self.VideoDecoder=class extends NativeDecoder{
   constructor(init){super({...init,output(frame){if(report.nativeFrames.length<3)report.nativeFrames.push(frameGeometry(frame));init.output(frame)}})}
   configure(config){report.configured.push(pickConfig(config));return super.configure(config)}
  }
  const response=await fetch('../experiments/video-source/fixtures/par.mp4')
  if(!response.ok)throw Error('FIXTURE_HTTP_'+response.status)
  const bytes=await response.arrayBuffer()
  if(bytes.byteLength>65536)throw Error('FIXTURE_SIZE')
  input=new Input({source:new BufferSource(bytes),formats:[MP4]})
  const track=await input.getPrimaryVideoTrack()
  if(!track)throw Error('NO_VIDEO_TRACK')
  const config=await track.getDecoderConfig()
  report.requestedConfig=pickConfig(config)
  const supported=await NativeDecoder.isConfigSupported(config)
  report.support={supported:supported.supported,config:pickConfig(supported.config)}
  report.track={codedWidth:await track.getCodedWidth(),codedHeight:await track.getCodedHeight(),
   displayWidth:await track.getDisplayWidth(),displayHeight:await track.getDisplayHeight(),
   squarePixelWidth:await track.getSquarePixelWidth(),squarePixelHeight:await track.getSquarePixelHeight(),
   rotation:await track.getRotation(),pixelAspectRatio:await track.getPixelAspectRatio()}
  iterator=new VideoSampleSink(track).samples(0)
  const next=await iterator.next()
  if(next.done)throw Error('NO_SAMPLE')
  sample=next.value;report.sampleAcquired++
  const s={codedWidth:sample.codedWidth,codedHeight:sample.codedHeight,
   displayWidth:sample.displayWidth,displayHeight:sample.displayHeight,
   squarePixelWidth:sample.squarePixelWidth,squarePixelHeight:sample.squarePixelHeight,
   visibleRect:sample.visibleRect,rotation:sample.rotation,format:sample.format}
  report.samples.push(s)
  report.absoluteSizeMatch=Math.abs(s.displayWidth-report.track.displayWidth)<=1&&Math.abs(s.displayHeight-report.track.displayHeight)<=1
  report.aspectRatioMatch=s.displayWidth*report.track.displayHeight===s.displayHeight*report.track.displayWidth
  const canvas=new OffscreenCanvas(128,48),context=canvas.getContext('2d',{alpha:false,willReadFrequently:true})
  try{
   sample.draw(context,0,0,128,48)
   report.drawSucceeded=true
   report.corners=[[.1,.1],[.9,.1],[.1,.9],[.9,.9]].map(([x,y])=>Array.from(context.getImageData(Math.floor(x*128),Math.floor(y*48),1,1).data))
   const pixels=context.getImageData(0,0,128,48).data
   report.drawHash=pixels.reduce((hash,value)=>Math.imul(hash^value,16777619),2166136261)>>>0
  }finally{canvas.width=0;canvas.height=0}
  // Public constructor round-trip isolates display-size preservation in Android's Canvas-copy path.
  const copyCanvas=new OffscreenCanvas(64,48)
  const copyContext=copyCanvas.getContext('2d',{alpha:false})
  copyContext.fillStyle='#808080';copyContext.fillRect(0,0,64,48)
  let frame
  try{frame=new VideoFrame(copyCanvas,{timestamp:0,displayWidth:128,displayHeight:48});report.canvasFrameRoundTrip=frameGeometry(frame)}
  catch(error){report.canvasFrameError=String(error?.name??'ERROR')}
  finally{frame?.close();copyCanvas.width=0;copyCanvas.height=0}
 }catch(error){report.errors.push(String(error?.message??error))}
 finally{
  if(sample){try{sample.close();report.sampleClosed++}catch{report.errors.push('SAMPLE_CLOSE')}}
  if(iterator){try{await iterator.return();report.iteratorReturned=true}catch{report.errors.push('ITERATOR_CLOSE')}}
  if(input){try{input.dispose();report.inputDisposed=true}catch{report.errors.push('INPUT_DISPOSE')}}
  self.VideoDecoder=NativeDecoder
  self.postMessage(report)
 }
}
`)
await build({configFile:false,root:source,publicDir:false,build:{outDir:output,emptyOutDir:true,
 lib:{entry:resolve(source,'worker.js'),formats:['es'],fileName:()=> 'worker.js'},
 rollupOptions:{output:{inlineDynamicImports:true}}}})
await writeFile(resolve(output,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AniView PAR geometry diagnostic</title><link rel="icon" href="data:,"><style>body{font:16px system-ui;background:#10141e;color:#e6edf8;padding:16px;max-width:900px}button{font:inherit;min-height:48px;padding:12px;margin:6px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>PAR geometry diagnostic</h1><p>par-geometry-1 · separate from frozen 8D1. Local numeric diagnostics only.</p><p id="environment"></p><button id="run">Run PAR probe</button><button id="copy">Copy JSON</button><pre id="result">Ready</pre><script type="module">
const result=document.querySelector('#result'),run=document.querySelector('#run');let active;
document.querySelector('#environment').textContent='Secure context: '+isSecureContext+' · HMR: false';
window.runParProbe=()=>new Promise(resolve=>{active?.terminate();run.disabled=true;result.textContent='Running';const worker=new Worker('./worker.js',{type:'module'});active=worker;const finish=value=>{clearTimeout(timer);worker.terminate();if(active===worker)active=undefined;run.disabled=false;result.textContent=JSON.stringify({...value,workerTerminated:true},null,2);resolve({...value,workerTerminated:true})};const timer=setTimeout(()=>finish({diagnosticVersion:'par-geometry-1',error:'PROBE_TIMEOUT'}),30000);worker.onmessage=e=>finish(e.data);worker.onerror=e=>{e.preventDefault();finish({error:'PROBE_WORKER_FAILED'})};worker.postMessage({type:'probe'})});
run.onclick=()=>window.runParProbe();document.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(result.textContent)}catch{result.textContent+='\\nCopy unavailable: select this text manually.'}};
addEventListener('pagehide',()=>active?.terminate());
</script></body></html>`)
console.log(JSON.stringify({diagnostic:'par-geometry-1',output,originalCandidateUnchanged:true}))
