// Original tiny conformance fixtures; omggif's writer is used only by test tooling.
import omggif from 'omggif'
import { mkdir, writeFile } from 'node:fs/promises'
const { GifWriter, GifReader } = omggif
await mkdir('tests/fixtures/gif', { recursive: true })
const palette=[0,0xff0000,0x00ff00,0x0000ff]
async function make(name,frames,loop,version='89a',width=3,height=2){
 const bytes=new Uint8Array(65536)
 const writer=new GifWriter(bytes,width,height,{...(name==='local-only'?{}:{palette,background:1}),...(loop===undefined?{}:{loop})})
 for(const f of frames)writer.addFrame(f.x??0,f.y??0,f.w??width,f.h??height,Uint8Array.from(f.p),{delay:f.delay??3,disposal:f.d??1,...(f.t===undefined?{}:{transparent:f.t}),...(f.local?{palette:[0,0xffffff,0xff00ff,0x00ffff]}:{})})
 let data=bytes.slice(0,writer.end())
 data[4]=version==='87a'?55:57
 if(name==='interlace'){
  const info=new GifReader(data).frameInfo(0); data[info.data_offset-1]|=64
 }
 if(version==='87a') {
  const offset=13+palette.length*3
  data=Uint8Array.from([...data.subarray(0,offset),...data.subarray(offset+8)])
 }
 await writeFile(`tests/fixtures/gif/${name}.gif`,data)
}
await make('background-opaque',[{w:1,h:1,p:[3],d:2},{x:2,w:1,h:1,p:[2]}])
await make('background-transparent',[{p:[1,1,1,1,1,1]},{x:1,w:1,h:1,p:[3],d:2,t:0},{w:1,h:1,p:[2],t:0}])
await make('previous',[{p:[1,1,1,1,1,1]},{x:1,w:1,h:1,p:[3],d:3},{x:2,w:1,h:1,p:[2]}],0)
await make('transparent-local',[{p:[1,1,1,1,1,1],d:0},{p:[0,1,0,0,0,0],t:0,local:true}])
await make('local-only',[{p:[0,1,2,3,0,1],t:0,local:true}])
await make('interlace',[{p:[1,1,1,3,3,3,2,2,2,1,2,3]}],undefined,'89a',3,4)
await make('gif87a',[{p:[1,2,3,1,2,3]}],undefined,'87a')
await make('short-delay',[{p:[1,1,1,1,1,1],delay:0},{p:[2,2,2,2,2,2],delay:1},{p:[3,3,3,3,3,3],delay:2}],0)
await make('finite',[{p:[1,1,1,1,1,1]},{p:[2,2,2,2,2,2]}],2)
await make('long',Array.from({length:100},(_,i)=>({p:Array(6).fill(i%3+1),delay:3,d:i%4})),0)
// Empty passes, nonzero offsets, transparent pixels and a local palette.
for(let h=1;h<=17;h++){
 const rows=[]
 for(const [start,step] of [[0,8],[4,8],[2,4],[1,2]])for(let y=start;y<h;y+=step)rows.push(y)
 const name=`interlace-${h}`
 await make(name,[{p:Array(4*(h+2)).fill(1)},{x:1,y:1,w:2,h,p:rows.flatMap(y=>[y%3+1,0]),local:true,t:0}],undefined,'89a',4,h+2)
 const {readFile}=await import('node:fs/promises')
 const path=`tests/fixtures/gif/${name}.gif`,data=new Uint8Array(await readFile(path)),info=new GifReader(data).frameInfo(1)
 data[info.data_offset-info.palette_size*3-1]|=64
 await writeFile(path,data)
}
