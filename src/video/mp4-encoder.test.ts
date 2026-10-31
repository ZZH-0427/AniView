import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
const fake=vi.hoisted(()=>({configured:0,closed:0,frameClosed:0,configureError:false,encodeError:false,finalizeError:false,chunkBytes:16,
  samples:[] as {timestamp:number;duration:number}[],disposed:0}))
vi.mock('mediabunny',()=>({
  BufferTarget:class {buffer:ArrayBuffer|null=null;on(){}},Mp4OutputFormat:class {},MP4:{},BufferSource:class {},
  Output:class {
    state='pending';constructor(private options:{target:{buffer:ArrayBuffer|null}}){}
    addVideoTrack(){}async start(){this.state='started'}async finalize(){if(fake.finalizeError)throw Error();this.options.target.buffer=new ArrayBuffer(10);this.state='finalized'}async cancel(){this.state='canceled'}
  },
  EncodedVideoPacketSource:class {async add(){}close(){}},
  EncodedPacket:class {static fromEncodedChunk(){return{data:new Uint8Array(1),type:'key'}}},
  Input:class {async getPrimaryVideoTrack(){return{canDecode:async()=>true,getDecoderConfig:async()=>({codec:'avc1.42e01f'}),getDisplayWidth:async()=>2,getDisplayHeight:async()=>2}}
    async getAudioTracks(){return[]}async computeDuration(){const s=fake.samples.at(-1)!;return(s.timestamp+s.duration)/1e6}dispose(){fake.disposed++}},
  VideoSampleSink:class {async *samples(){for(const s of fake.samples)yield{timestamp:s.timestamp/1e6,duration:s.duration/1e6,toVideoFrame:()=>new Frame(new Uint8Array(16),s),close(){}}}},
}))
class Frame {
  constructor(_data:Uint8Array,readonly init:{timestamp:number;duration?:number}){}
  close(){fake.frameClosed++}async copyTo(target:Uint8Array){target.fill(255);return[]}
}
class Encoder {
  static async isConfigSupported(config:VideoEncoderConfig){return{supported:true,config}}
  state='configured';encodeQueueSize=0
  constructor(private cb:VideoEncoderInit){}
  configure(){if(fake.configureError)throw Error();fake.configured++}
  encode(frame:Frame){if(fake.encodeError)throw Error();fake.samples.push({timestamp:frame.init.timestamp,duration:frame.init.duration!})
    const chunk={timestamp:frame.init.timestamp,byteLength:fake.chunkBytes};this.cb.output(chunk as EncodedVideoChunk,{decoderConfig:{codec:'avc1.42e01f'}})}
  async flush(){}close(){fake.closed++;this.state='closed'}
}
import { MP4Encoder } from './mp4-encoder'
beforeEach(()=>{Object.assign(fake,{configured:0,closed:0,frameClosed:0,configureError:false,encodeError:false,finalizeError:false,chunkBytes:16,samples:[],disposed:0});vi.stubGlobal('VideoFrame',Frame);vi.stubGlobal('VideoEncoder',Encoder)})
afterEach(()=>vi.unstubAllGlobals())
const meta={width:2,height:2,frameCount:1,playCount:0},frame=()=>({index:0,durationMs:27,rgba:new Uint8Array(16).fill(255).buffer})
describe('public-API MP4 adapter lifecycle (real browser tests verify the real mux)',()=>{
  it('reports finalization phases in order and ignores observer exceptions',async()=>{
    const phases:string[]=[],e=new MP4Encoder(meta,undefined,p=>{phases.push(p);throw Error('observer')})
    await e.open();await e.addFrame(frame());await e.finish();await e.dispose()
    expect(phases).toEqual(['flushing','flushed','mux-finalizing','inspecting']);expect(fake.closed).toBe(1)
  })
  it('encodes once, closes frames and native codec, writes only video and inspects actual output',async()=>{
    const e=new MP4Encoder(meta);await e.open();await e.addFrame(frame());const r=await e.finish();await e.dispose()
    expect(r.metrics).toMatchObject({framesCreated:2,framesClosed:2,activeVideoFrames:0,peakVideoFrames:1,packets:1})
    expect(r.validation).toMatchObject({frameCount:1,audioTracks:0,totalDurationErrorUs:0});expect(fake.closed).toBe(1);expect(fake.disposed).toBe(1)
  })
  it('classifies configure failure and still permits disposal',async()=>{
    fake.configureError=true;const e=new MP4Encoder(meta);await expect(e.open()).rejects.toMatchObject({code:'VIDEO_ENCODER_INIT_FAILED'});await e.dispose();expect(fake.closed).toBe(1)
  })
  it('closes owned frame when encode throws',async()=>{
    const e=new MP4Encoder(meta);await e.open();fake.encodeError=true;await expect(e.addFrame(frame())).rejects.toMatchObject({code:'VIDEO_ENCODE_FAILED'})
    expect(e.metrics.framesClosed).toBe(1);expect(e.metrics.activeVideoFrames).toBe(0);await e.dispose()
  })
  it('rejects encoded bytes before copying an unsafe packet',async()=>{
    const e=new MP4Encoder(meta);await e.open();fake.chunkBytes=64*1024*1024
    await expect(e.addFrame(frame())).rejects.toMatchObject({code:'VIDEO_OUTPUT_TOO_LARGE'});expect(e.metrics.framesClosed).toBe(1);await e.dispose()
  })
  it('distinguishes mux finalization error from source decoding',async()=>{
    const e=new MP4Encoder(meta);await e.open();await e.addFrame(frame());fake.finalizeError=true
    await expect(e.finish()).rejects.toMatchObject({code:'VIDEO_MUX_FAILED'});await e.dispose();expect(fake.closed).toBe(1)
  })
  it('checks frame order and refuses zero duration',async()=>{
    const e=new MP4Encoder(meta);await e.open();await expect(e.addFrame({...frame(),index:1})).rejects.toMatchObject({code:'VIDEO_FRAME_FAILED'})
    await expect(e.addFrame({...frame(),durationMs:0})).rejects.toMatchObject({code:'VIDEO_FRAME_FAILED'});await e.dispose()
  })
})
