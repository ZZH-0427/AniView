// Engineering source-container fixtures. Codecs remain existing project/native codecs.
// Enlarge committed regional APNG/GIF fixtures before decoding, so native AVC's
// minimum dimensions do not prevent exercising their original disposal operations.
import {inflateSync,deflateSync} from 'node:zlib'
import {readFile} from 'node:fs/promises'
import omggif from 'omggif'
import assert from 'node:assert/strict'
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function chunk(type,data){const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b}
export async function regionalAPNG(){
  const source=await readFile('tests/fixtures/apng/composition.png'),parts=[],scale=16
  let w=0,h=0
  for(let i=8;i<source.length;){const len=source.readUInt32BE(i),type=source.toString('ascii',i+4,i+8),d=Buffer.from(source.subarray(i+8,i+8+len));i+=12+len
    if(type==='IHDR'){w=d.readUInt32BE();h=d.readUInt32BE(4);d.writeUInt32BE(w*scale);d.writeUInt32BE(h*scale,4)}
    if(type==='fcTL'){w=d.readUInt32BE(4);h=d.readUInt32BE(8);for(const at of [4,8,12,16])d.writeUInt32BE(d.readUInt32BE(at)*scale,at)}
    if(type==='IDAT'||type==='fdAT'){
      const prefix=type==='fdAT'?d.subarray(0,4):Buffer.alloc(0),raw=inflateSync(d.subarray(prefix.length)),out=Buffer.alloc((w*scale*4+1)*h*scale)
      assert.equal(raw.length,(w*4+1)*h)
      for(let y=0;y<h*scale;y++){assert.equal(raw[Math.floor(y/scale)*(w*4+1)],0);for(let x=0;x<w*scale;x++)raw.copy(out,y*(w*scale*4+1)+1+x*4,Math.floor(y/scale)*(w*4+1)+1+Math.floor(x/scale)*4,Math.floor(y/scale)*(w*4+1)+5+Math.floor(x/scale)*4)}
      parts.push(chunk(type,Buffer.concat([prefix,deflateSync(out)])))
    }else parts.push(chunk(type,d))
  }
  return Buffer.concat([source.subarray(0,8),...parts])
}
export async function regionalGIF(name='previous.gif'){
  const b=await readFile('tests/fixtures/gif/'+name),reader=new omggif.GifReader(b),scale=16,out=new Uint8Array(1024*1024)
  const paletteAt=(at,count)=>Array.from({length:count},(_,n)=>(b[at+n*3]<<16)|(b[at+n*3+1]<<8)|b[at+n*3+2])
  const global=b[10]&128?paletteAt(13,2**((b[10]&7)+1)):undefined,loop=reader.loopCount()
  const writer=new omggif.GifWriter(out,reader.width*scale,reader.height*scale,{...(global?{palette:global,background:b[11]}:{}),...(loop===null?{}:{loop})})
  for(let i=0;i<reader.numFrames();i++){
    const f=reader.frameInfo(i),palette=paletteAt(f.palette_offset,f.palette_size),rgba=new Uint8Array(reader.width*reader.height*4)
    reader.decodeAndBlitFrameRGBA(i,rgba)
    const indices=new Uint8Array(f.width*scale*f.height*scale)
    for(let y=0;y<f.height*scale;y++)for(let x=0;x<f.width*scale;x++){
      const at=((f.y+Math.floor(y/scale))*reader.width+f.x+Math.floor(x/scale))*4,rgb=(rgba[at]<<16)|(rgba[at+1]<<8)|rgba[at+2]
      const index=rgba[at+3]===0?f.transparent_index:palette.indexOf(rgb);assert(index!==null&&index>=0)
      indices[y*f.width*scale+x]=index
    }
    writer.addFrame(f.x*scale,f.y*scale,f.width*scale,f.height*scale,indices,{palette,delay:f.delay,disposal:f.disposal,...(f.transparent_index===null?{}:{transparent:f.transparent_index})})
  }
  return Buffer.from(out.slice(0,writer.end()))
}
export async function regionalWebP(){
  const source=await readFile('tests/fixtures/zip/original-two-frame.webp'),headers=[],frames=[]
  for(let i=12;i<source.length;){const n=source.readUInt32LE(i+4),end=i+8+n+n%2,b=Buffer.from(source.subarray(i,end)),t=b.toString('ascii',0,4);i=end
    if(t==='ANMF')frames.push(b);else{if(t==='VP8X'){b.writeUIntLE(63,12,3);b.writeUIntLE(31,15,3)}headers.push(b)}
  }
  const rects=[[0,0,2,20],[1,16,1,27],[1,0,0,100],[0,16,2,250]],body=Buffer.concat([Buffer.from('WEBP'),...headers,...rects.map(([n,x,flags,ms])=>{const b=Buffer.from(frames[n]);b.writeUIntLE(x,8,3);b.writeUIntLE(ms,20,3);b[23]=flags;return b})]),riff=Buffer.alloc(8)
  riff.write('RIFF');riff.writeUInt32LE(body.length,4);return Buffer.concat([riff,body])
}
