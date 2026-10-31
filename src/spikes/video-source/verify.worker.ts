import { fingerprint } from '../conversion/fixtures'
import type { CanonicalAnimationFrame } from '../../conversion/model'
export interface VerifyRequest {id:number;frame:CanonicalAnimationFrame;width:number;height:number;rotation:number;flip:boolean}
globalThis.addEventListener('message',(event:MessageEvent<VerifyRequest>)=>{
  const {id,frame,width,height,rotation,flip}=event.data
  const pixels=new Uint8Array(frame.rgba)
  const at=(u:number,v:number)=>{
    let x=u,y=v
    if(rotation===90){x=1-v;y=u}else if(rotation===180){x=1-u;y=1-v}else if(rotation===270){x=v;y=1-u}
    if(flip)x=1-x
    return(Math.min(height-1,Math.floor(y*height))*width+Math.min(width-1,Math.floor(x*width)))*4
  }
  let label=0
  for(let bit=0;bit<8;bit++){const p=at((bit+.5)/8,.5);if(pixels[p]!+pixels[p+1]!+pixels[p+2]!>384)label|=1<<bit}
  const corners=[[.1,.1],[.9,.1],[.1,.9],[.9,.9]].map(([u,v])=>{
    const p=at(u!,v!),r=pixels[p]!,g=pixels[p+1]!,b=pixels[p+2]!
    return r>120&&g>120&&b<120?'yellow':r>120&&g<120&&b<120?'red':g>120&&r<120&&b<120?'green':b>120&&r<120&&g<150?'blue':'other'
  })
  globalThis.postMessage({id,fingerprint:fingerprint(frame,width,height),label,corners})
})
