import { CustomSource, EncodedPacketSink, Input, MP4, WEBM, VideoSampleSink } from 'mediabunny'
import type { InputVideoTrack, VideoSample } from 'mediabunny'
import type { CanonicalAnimationFrame } from '../conversion/model'
import { emptySourceMetrics, gateCodec, validateCodedSize, validateVideoMatrix, validateSampleColor, VIDEO_INPUT_LIMITS, VideoInputError } from './model'
import type { FrameEvidence, SamplingPlan, SourcePhase, VideoInspection, VideoSourceMetrics, VideoSourceOptions } from './model'
import { createSamplingPlan, frameTime, normalizeTimeline } from './sampling-plan'
import { PresentationSampler } from './presentation-sampler'
import { mp4EditedEnd } from './mp4-timeline-guard'
import {validateSampleGeometry} from './sample-geometry'
import type {TrackSampleGeometry} from './sample-geometry'

export type RangeReader=(start:number,end:number)=>Promise<Uint8Array>
export class VideoSource {
  readonly metrics=emptySourceMetrics()
  inspection:VideoInspection|undefined
  plan:SamplingPlan|undefined
  private input:Input<CustomSource>|undefined
  private track:InputVideoTrack|undefined
  private sampler:PresentationSampler<VideoSample>|undefined
  private canvas:OffscreenCanvas|undefined
  private context:OffscreenCanvasRenderingContext2D|undefined
  private index=0
  private closed=false
  private evidence=false
  private firstQuery=0
  private decodeStarted=0
  private codedArea=0
  private expectedGeometry:TrackSampleGeometry|undefined
  constructor(private readonly read:RangeReader,private readonly size:number,private readonly publish:(metrics:VideoSourceMetrics)=>void=()=>{}){}
  private check(){if(this.closed)throw new VideoInputError('CANCELLED')}
  private phase(phase:SourcePhase){this.metrics.phase=phase;this.publish(this.metrics)}
  private acquire=(sample:VideoSample)=>{
    this.metrics.samplesAcquired++;this.metrics.activeSamples++;this.metrics.peakSamples=Math.max(this.metrics.peakSamples,this.metrics.activeSamples)
    this.metrics.observedSourceSamples++
    this.metrics.observedSourcePixels+=this.codedArea
    validateSampleColor(sample.colorSpace)
    validateCodedSize(Math.ceil(sample.displayWidth),Math.ceil(sample.displayHeight))
    if(sample.format&&/P10|P12|F16/.test(sample.format))throw new VideoInputError('VIDEO_CODEC_UNSUPPORTED')
    if(this.expectedGeometry&&validateSampleGeometry(this.expectedGeometry,sample))this.metrics.trackParFallbackSamples++
    if(this.plan&&sample.timestamp<this.firstQuery)this.metrics.observablePrerollSamples++
    if(this.metrics.observablePrerollSamples===1&&this.metrics.phase==='preroll')this.publish(this.metrics)
    if(this.metrics.observedSourceSamples>VIDEO_INPUT_LIMITS.maxObservedSamples
      ||this.metrics.observedSourcePixels>VIDEO_INPUT_LIMITS.maxObservedSourcePixels)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
  }
  private release=(failed=false)=>{this.metrics.samplesClosed++;this.metrics.activeSamples--;if(failed)this.metrics.cleanupErrors++}
  private async bytes(start:number,end:number){
    this.check()
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>this.size)throw new VideoInputError('VIDEO_DECODE_FAILED')
    const bytes=await this.read(start,end);this.check()
    if(bytes.byteLength!==end-start)throw new VideoInputError('VIDEO_DECODE_FAILED')
    this.metrics.readBytes+=bytes.byteLength;return bytes
  }
  async open(){
    const started=performance.now()
    if(!Number.isSafeInteger(this.size)||this.size<1||this.size>VIDEO_INPUT_LIMITS.maxSourceBytes)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
    this.metrics.capability.apiPresent=typeof VideoDecoder!=='undefined';this.metrics.capability.secureContext=globalThis.isSecureContext
    if(!globalThis.isSecureContext||!this.metrics.capability.apiPresent)throw new VideoInputError('VIDEO_DECODER_UNAVAILABLE')
    this.phase('opening')
    const source=new CustomSource({getSize:()=>this.size,maxCacheSize:VIDEO_INPUT_LIMITS.maxCacheBytes,prefetchProfile:'none',
      read:(start,end)=>new ReadableStream<Uint8Array>({pull:async controller=>{
        try{if(start>=end){controller.close();return}const next=Math.min(end,start+VIDEO_INPUT_LIMITS.maxReadChunk);controller.enqueue(await this.bytes(start,next));start=next}
        catch(error){controller.error(error)}
      }})})
    this.input=new Input({source,formats:[MP4,WEBM]})
    this.metrics.capability.containerReadable=await this.input.canRead()
    if(!this.metrics.capability.containerReadable)throw new VideoInputError('VIDEO_CONTAINER_UNSUPPORTED')
    const format=await this.input.getFormat(),container=format===MP4?'mp4':format===WEBM?'webm':null
    if(!container)throw new VideoInputError('VIDEO_CONTAINER_UNSUPPORTED')
    const track=await this.input.getPrimaryVideoTrack()
    this.metrics.capability.videoTrack=!!track
    if(!track)throw new VideoInputError('NO_VIDEO_TRACK')
    this.track=track
    const codec=await track.getCodec(),config=await track.getDecoderConfig()
    this.metrics.capability.codec=codec
    if(!config)throw new VideoInputError('VIDEO_CONFIG_UNSUPPORTED')
    gateCodec(container,codec,config.codec,await track.hasHighDynamicRange(),await track.canBeTransparent())
    const codedWidth=await track.getCodedWidth(),codedHeight=await track.getCodedHeight()
    validateCodedSize(codedWidth,codedHeight)
    this.codedArea=codedWidth*codedHeight
    const matrix=await track.getTransformationMatrix()
    validateVideoMatrix(matrix)
    const support=await VideoDecoder.isConfigSupported(config)
    this.metrics.capability.configSupported=!!support.supported
    if(!support.supported)throw new VideoInputError('VIDEO_CONFIG_UNSUPPORTED')
    const editedEnd=container==='mp4'?await mp4EditedEnd((a,b)=>this.bytes(a,b),this.size,track.id):undefined
    const end=await track.computeDuration(),resolution=await track.getTimeResolution()
    const firstPacketTimestamp=await track.getFirstTimestamp()
    const geometry={displayWidth:await track.getDisplayWidth(),displayHeight:await track.getDisplayHeight(),
      squarePixelWidth:await track.getSquarePixelWidth(),squarePixelHeight:await track.getSquarePixelHeight(),
      rotation:await track.getRotation(),flip:await track.getFlip()}
    // The Android library copy can use display-sized surfaces; pathological PAR
    // must not bypass the source-allocation guard through a tiny coded image.
    validateCodedSize(Math.ceil(geometry.displayWidth),Math.ceil(geometry.displayHeight))
    this.expectedGeometry={codedWidth,codedHeight,...geometry}
    this.check()
    this.metrics.openMs=performance.now()-started;this.phase('probing')
    const probeStart=performance.now(),probeTime=Math.max(0,firstPacketTimestamp)
    const probeKey=await new EncodedPacketSink(track).getKeyPacket(probeTime,{verifyKeyPackets:true})
    if(!probeKey||probeTime-probeKey.timestamp>VIDEO_INPUT_LIMITS.maxPrerollSeconds)throw new VideoInputError('VIDEO_PREROLL_LIMIT')
    const iterator=new VideoSampleSink(track).samples(probeTime)
    let first:VideoSample|undefined
    try{
      for(let n=0;n<150;n++){
        const result=await iterator.next()
        if(result.done)throw new VideoInputError('VIDEO_DECODE_FAILED')
        first=result.value
        this.metrics.capability.decoderInitialized=true;this.metrics.capability.firstDecoded=true
        this.acquire(first)
        this.check()
        if(first.timestamp+first.duration>0)break
        first.close();this.release();first=undefined
      }
      if(!first)throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
      if(first.format&&/P10|P12|F16/.test(first.format))throw new VideoInputError('VIDEO_CODEC_UNSUPPORTED')
      const timeline=normalizeTimeline(first.timestamp,editedEnd===undefined?end:Math.min(end,editedEnd),resolution)
      this.canvas=new OffscreenCanvas(1,1);this.metrics.activeCanvases=1;this.metrics.peakCanvases=1
      const context=this.canvas.getContext('2d',{colorSpace:'srgb',willReadFrequently:true,alpha:false})
      if(!context)throw new VideoInputError('VIDEO_DRAW_FAILED')
      this.context=context
      try{first.draw(context,0,0,1,1);this.metrics.capability.firstDraw=true}catch{throw new VideoInputError('VIDEO_DRAW_FAILED')}
      this.metrics.activeImageData=1;this.metrics.peakImageData=1
      try{context.getImageData(0,0,1,1);this.metrics.capability.firstReadback=true}
      catch{throw new VideoInputError('VIDEO_RGBA_FAILED')}finally{this.metrics.activeImageData=0}
      this.inspection={container,codec:codec as 'avc'|'vp9',codecString:config.codec,codedWidth,codedHeight,
        ...geometry,timeResolution:resolution,...timeline,firstPacketTimestamp,
        secureContext:globalThis.isSecureContext,apiPresent:true,configSupported:true,decoderInitialized:true,firstDecoded:true,firstDraw:true,
        nativeMemoryBytes:null,colorPolicy:'SDR8-browser-to-sRGB',alpha:false,audio:'ignored',trackSelection:'primary'}
      this.metrics.probeMs=performance.now()-probeStart
      return this.inspection
    }finally{
      if(first){let failed=false;try{first.close()}catch{failed=true}finally{this.release(failed)}}
      try{await iterator.return()}catch{this.metrics.cleanupErrors++}
    }
  }
  async configure(options:VideoSourceOptions){
    this.check()
    if(!this.track||!this.inspection||!this.canvas||!this.context||this.plan)throw new VideoInputError('VIDEO_OUTPUT_PLAN_LIMIT')
    const plan=createSamplingPlan(this.inspection,options)
    this.firstQuery=this.inspection.visibleStartTicks/this.inspection.timeResolution+plan.startUs/1e6
    this.phase('preroll')
    const before=performance.now(),sink=new EncodedPacketSink(this.track)
    const key=await sink.getKeyPacket(this.firstQuery,{verifyKeyPackets:true})
    this.check()
    if(!key||key.timestamp>this.firstQuery+1e-9)throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
    const preroll=this.firstQuery-key.timestamp
    if(preroll>VIDEO_INPUT_LIMITS.maxPrerollSeconds)throw new VideoInputError('VIDEO_PREROLL_LIMIT')
    this.metrics.prerollSeconds=preroll
    const end=this.inspection.visibleStartTicks/this.inspection.timeResolution+plan.endUs/1e6
    this.sampler=new PresentationSampler(new VideoSampleSink(this.track).samples(key.timestamp,end),this.inspection.timeResolution,this.acquire,this.release)
    this.plan=plan;this.evidence=!!options.evidence;this.canvas.width=plan.width;this.canvas.height=plan.height
    this.context.imageSmoothingEnabled=true;this.context.imageSmoothingQuality='high'
    this.metrics.seekPrerollMs+=performance.now()-before;this.decodeStarted=performance.now()
    return plan
  }
  async next():Promise<CanonicalAnimationFrame|null>{
    this.check()
    const plan=this.plan,info=this.inspection
    if(!plan||!info||!this.sampler||!this.context||this.metrics.awaitingAck)throw new VideoInputError('VIDEO_DECODE_FAILED')
    if(this.index===plan.frameCount)return null
    this.phase(this.index===0?'preroll':'sampling')
    const timing=frameTime(plan,this.index),before=performance.now()
    const sample=await this.sampler.select(timing.timeUs,info.visibleStartTicks);this.check()
    this.phase('sampling')
    this.metrics.sampleMs+=performance.now()-before;this.metrics.decodeMs=this.metrics.probeMs+this.metrics.sampleMs
    if(this.index===0)this.metrics.seekPrerollMs+=performance.now()-this.decodeStarted
    this.phase('drawing')
    // Let cancellation posted by the broker run before synchronous draw/readback.
    await new Promise<void>(resolve=>setTimeout(resolve,0));this.check()
    const draw=performance.now()
    try{sample.draw(this.context,0,0,plan.width,plan.height)}catch{throw new VideoInputError('VIDEO_DRAW_FAILED')}
    this.metrics.drawMs+=performance.now()-draw;this.phase('readback')
    let image:ImageData
    const read=performance.now()
    try{image=this.context.getImageData(0,0,plan.width,plan.height)}catch{throw new VideoInputError('VIDEO_RGBA_FAILED')}
    this.metrics.readbackMs+=performance.now()-read;this.metrics.activeImageData=1;this.metrics.peakImageData=1
    try{
      if(image.data.byteOffset!==0||image.data.byteLength!==plan.width*plan.height*4||!(image.data.buffer instanceof ArrayBuffer))throw new VideoInputError('VIDEO_RGBA_FAILED')
      if(this.evidence)this.metrics.evidence.push(this.fingerprint(image.data,timing.timeUs,timing.durationMs,sample.timestamp))
      this.metrics.ownedRgba=1;this.metrics.peakOwnedRgba=1;this.metrics.peakFrameBytes=image.data.byteLength
      this.metrics.awaitingAck=1;this.phase('waiting-encoder')
      return{index:this.index++,durationMs:timing.durationMs,rgba:image.data.buffer}
    }finally{this.metrics.activeImageData=0}
  }
  private fingerprint(pixels:Uint8ClampedArray,requestedUs:number,durationMs:number,sourceTimestamp:number):FrameEvidence{
    const samples:number[]=[],count=pixels.length/4
    for(let i=0;i<64;i++){const at=Math.floor(i*count/64)*4;for(let c=0;c<4;c++)samples.push(pixels[at+c]!)}
    let hash:number|null=null
    if(count<=16_384){hash=2166136261;for(const p of pixels)hash=Math.imul(hash^p,16777619);hash>>>=0}
    return{index:this.index,durationMs,requestedUs,sourceTimestamp,rgbaHash:hash,samples}
  }
  transferred(){this.metrics.ownedRgba=0}
  acknowledge(){this.check();if(this.metrics.awaitingAck!==1)throw new VideoInputError('VIDEO_DECODE_FAILED');this.metrics.awaitingAck=0}
  async close(){
    if(this.closed)return
    this.closed=true
    this.metrics.stoppedAt=this.metrics.phase
    try{this.input?.dispose()}catch{this.metrics.cleanupErrors++}
    try{await this.sampler?.close()}catch{this.metrics.cleanupErrors++}
    this.sampler=undefined;this.input=undefined;this.track=undefined
    if(this.canvas){this.canvas.width=0;this.canvas.height=0}
    this.canvas=undefined;this.context=undefined
    this.metrics.activeCanvases=0;this.metrics.ownedRgba=0;this.metrics.awaitingAck=0;this.metrics.activeImageData=0;this.phase('closed')
  }
}
