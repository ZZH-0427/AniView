// Offline original fixtures only. This executable never enters the browser/runtime bundle.
import {spawn,execFileSync} from 'node:child_process'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {once} from 'node:events'
import {resolve} from 'node:path'
import {Input,BufferSource,MP4,WEBM,EncodedPacketSink,Output,Mp4OutputFormat,WebMOutputFormat,BufferTarget,EncodedVideoPacketSource} from 'mediabunny'
const ffmpeg=process.env.FFMPEG_PATH??resolve('.tools/video-source/fixture-tool/ffmpeg.exe')
const root=resolve('.tools/video-source/fixtures')
await mkdir(root,{recursive:true})
const version=execFileSync(ffmpeg,['-version'],{encoding:'utf8',windowsHide:true}).split('\n')[0]
function rgbFrame(width,height,id){
  const p=Buffer.alloc(width*height*3),colors=[[215,35,45],[30,185,65],[35,65,220],[225,195,30]]
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*3,c=colors[(y<height/2?0:2)+(x<width/2?0:1)]
    p[at]=c[0];p[at+1]=c[1];p[at+2]=c[2]
    if(y>=height*.4&&y<height*.6){const bit=Math.min(7,Math.floor(x*8/width)),v=(id>>bit)&1?240:16;p[at]=p[at+1]=p[at+2]=v}
    // Fine line/texture patches away from the barcode.
    if(y>height*.7&&y<height*.8&&x>width*.35&&x<width*.65){const v=(x%5<2||y%7<2)?210:40;p[at]=p[at+1]=p[at+2]=v}
  }
  return p
}
async function encode(name,{width=64,height=48,count=12,fps=10,codec='avc',bframes=0,keyint=20,par=false,photo=false,hdr=false}={}){
  const file=resolve(root,name),args=['-y','-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size',width+'x'+height,'-framerate',String(fps),'-i','pipe:0','-an']
  if(par)args.push('-vf','setsar=2/1')
  args.push('-pix_fmt','yuv420p','-color_primaries',hdr?'bt2020':'bt709','-color_trc',hdr?'smpte2084':'bt709','-colorspace',hdr?'bt2020nc':'bt709','-color_range','tv')
  if(codec==='avc')args.push('-c:v','libx264','-preset','fast','-crf','16','-profile:v','high','-bf',String(bframes),'-g',String(keyint),'-keyint_min',String(keyint),'-sc_threshold','0','-video_track_timescale','90000','-movflags','+faststart')
  else args.push('-c:v','libvpx-vp9','-profile:v','0','-crf','16','-b:v','0','-deadline','good','-cpu-used','4','-row-mt','1','-g',String(keyint))
  args.push(file)
  const child=spawn(ffmpeg,args,{windowsHide:true,stdio:['pipe','ignore','pipe']})
  let error='';child.stderr.on('data',d=>error+=d);child.stdin.on('error',()=>{})
  const ended=once(child,'exit')
  const photoPixels=photo?execFileSync(ffmpeg,['-v','error','-i',resolve('.tools/video/nasa-blue-marble.jpg'),'-vf',
    'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:8*1024*1024}):undefined
  for(let i=0;i<count;i++){
    const frame=photoPixels?Buffer.from(photoPixels):rgbFrame(width,height,i%256)
    if(photoPixels)for(let y=40;y<100;y++)for(let x=40;x<100;x++){const at=(y*width+x)*3;frame[at]=i*60;frame[at+1]=200;frame[at+2]=40}
    if(!child.stdin.write(frame))await once(child.stdin,'drain')
  }
  child.stdin.end();const [code]=await ended;if(code!==0)throw Error(name+': '+error)
  return{name,width,height,codec,rotation:0,flip:false,displayWidth:par?width*2:width,displayHeight:height,
    pts:Array.from({length:count},(_,i)=>i/fps),ids:Array.from({length:count},(_,i)=>i%256),duration:count/fps,scene:photo?'photo':'markers'}
}
async function remux(base,name,{pts,durations,rotation=0,offset=0}={}){
  const bytes=await readFile(resolve(root,base.name)),input=new Input({source:new BufferSource(bytes),formats:[MP4,WEBM]})
  try{
    const track=await input.getPrimaryVideoTrack(),codec=await track.getCodec(),config=await track.getDecoderConfig()
    const target=new BufferTarget(),output=new Output({format:codec==='avc'?new Mp4OutputFormat():new WebMOutputFormat(),target})
    const source=new EncodedVideoPacketSource(codec)
    output.addVideoTrack(source,{rotation});await output.start()
    const count=pts?.length??base.pts.length
    let i=0
    for await(const packet of new EncodedPacketSink(track).packets()){
      if(i===count)break
      const timestamp=(pts?.[i]??packet.timestamp)+offset,duration=durations?.[i]??packet.duration
      await source.add(packet.clone({timestamp,duration}),{decoderConfig:config});i++
    }
    source.close();await output.finalize();await writeFile(resolve(root,name),new Uint8Array(target.buffer))
    return{...base,name,rotation,displayWidth:rotation%180?base.displayHeight:base.displayWidth,
      displayHeight:rotation%180?base.displayWidth:base.displayHeight,pts:pts??base.pts,ids:base.ids.slice(0,count),
      duration:pts?pts.at(-1)+durations.at(-1):base.duration,origin:offset}
  }finally{input.dispose()}
}
const fixtures=[]
const cfr=await encode('cfr.mp4');fixtures.push(cfr)
fixtures.push(await encode('vp9.webm',{codec:'vp9'}))
fixtures.push(await encode('bframes.mp4',{count:24,bframes:2}))
fixtures.push(await remux(cfr,'vfr.mp4',{pts:[0,.1,.4,.45,1],durations:[.1,.3,.05,.55,.03]}))
fixtures.push(await remux(cfr,'rotation.mp4',{rotation:90}))
fixtures.push(await encode('portrait.mp4',{width:1080,height:1920,count:4,fps:2}))
fixtures.push(await encode('1080.mp4',{width:1920,height:1080,count:6,fps:5}))
fixtures.push(await encode('par.mp4',{width:64,height:48,par:true}))
fixtures.push(await encode('long.mp4',{count:320,fps:10}))
fixtures.push(await encode('long-gop.mp4',{count:120,fps:10,keyint:120}))
fixtures.push(await encode('benchmark.mp4',{width:320,height:240,count:151,fps:15,keyint:30}))
fixtures.push(await remux(fixtures[1],'nonzero.webm',{offset:5}))
fixtures.push(await encode('dense-1080.mp4',{width:1920,height:1080,count:325,fps:60,keyint:120}))
fixtures.push(await encode('photo.mp4',{width:1920,height:1080,count:4,fps:2,photo:true}))
execFileSync(ffmpeg,['-y','-v','error','-itsoffset','-0.2','-i',resolve(root,'cfr.mp4'),'-c','copy','-copyts','-avoid_negative_ts','disabled',resolve(root,'negative.mp4')],{windowsHide:true})
fixtures.push({...cfr,name:'negative.mp4',pts:cfr.pts.map(p=>p-.2),duration:1,origin:0})
fixtures.push(await encode('4k.mp4',{width:3840,height:2160,count:1,fps:1}))
fixtures.push(await encode('hdr-tagged.mp4',{count:2,hdr:true}))
execFileSync(ffmpeg,['-y','-v','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','1','-c:a','aac','-b:a','32k',resolve(root,'audio.mp4')],{windowsHide:true})
fixtures.push({name:'audio.mp4',width:0,height:0,codec:'audio',rotation:0,flip:false,displayWidth:0,displayHeight:0,pts:[],ids:[],duration:1,scene:'markers'})
const external=spawn(ffmpeg,['-v','info','-debug_ts','-i',resolve(root,'bframes.mp4'),'-vf','showinfo','-f','null','-'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
let debug='';external.stderr.on('data',d=>debug+=d);await once(external,'exit')
await writeFile(resolve(root,'bframe-oracle.txt'),debug)
const bcount=(debug.match(/type:B/g)??[]).length
if(!bcount)throw Error('Fixture did not contain B frames')
const packetTimes=[...debug.matchAll(/demuxer ->.*?pkt_pts_time:([-\d.]+).*?pkt_dts_time:([-\d.]+)/g)].map(m=>({pts:Number(m[1]),dts:Number(m[2])}))
if(!packetTimes.some(p=>p.pts!==p.dts))throw Error('No independently observed PTS/DTS distinction')
const manifest={schema:1,originalSyntheticTemporalFixtures:true,photographicFixture:'NASA Apollo 17 derivative; external quality fixture, not an original synthetic image',externalTool:version,bFrameCount:bcount,packetTimes,fixtures}
await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest,null,2))
console.log(JSON.stringify({fixtures:fixtures.length,bFrameCount:bcount,packetPtsDtsDiffer:true,tool:version}))
