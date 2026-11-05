// Minimal COPY-only 7z writer for hostile *container metadata* test fixtures.
// This is not a codec implementation and is never available in the product.
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root='.tools/m10c2/fixtures/'
const crc=b=>{let n=0xffffffff;for(const x of b){n^=x;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0}
const u=n=>{for(let extra=0;extra<8;extra++)if(n<2**(7+7*extra)){const out=[(0xff<<(8-extra)&255)|Math.floor(n/2**(8*extra))];for(let i=0;i<extra;i++)out.push(Math.floor(n/2**(8*i))&255);return out}throw Error('uint')}
async function make(name,paths,method=0,attributes){
  const data=paths.map((path,i)=>Buffer.from('fixture '+i)),packed=Buffer.concat(data)
  const names=Buffer.from(paths.map(s=>s+'\0').join(''),'utf16le'),n=paths.length
  const attr=attributes?Buffer.alloc(n*4):null;if(attr)attributes.forEach((v,i)=>attr.writeUInt32LE(v>>>0,i*4))
  const header=Buffer.from([1,4,6,0,...u(n),9,...data.flatMap(b=>u(b.length)),0,7,11,...u(n),0,...paths.flatMap(()=>[1,1,method]),12,...data.flatMap(b=>u(b.length)),0,0,5,...u(n),17,...u(names.length+1),0,...names,...(attr?[21,...u(2+attr.length),1,0,...attr]:[]),0,0])
  const start=Buffer.alloc(20);start.writeBigUInt64LE(BigInt(packed.length),0);start.writeBigUInt64LE(BigInt(header.length),8);start.writeUInt32LE(crc(header),16)
  const sig=Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c,0,4,0,0,0,0]);sig.writeUInt32LE(crc(start),8)
  const all=Buffer.concat([sig,start,packed,header]);await writeFile(root+name,all)
  return {name,bytes:all.length,expected:data.map((b,i)=>({id:i,path:paths[i],bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}))}
}
const result=[]
result.push(await make('duplicates.7z',['same.txt','same.txt','日本語 😀 = : .txt']))
result.push(await make('newline.7z',['good.txt','line\nbreak.txt']))
result.push(await make('traversal.7z',['../escape.txt']))
result.push(await make('path-bomb.7z',['x'.repeat(1500)]))
result.push(await make('unsupported.7z',['unknown.txt'],0x7f))
result.push(await make('entry-bomb.7z',Array.from({length:1100},(_,i)=>'e'+i)))
result.push(await make('symlink.7z',['link.txt'],0,[0xa1ff8000]))
await writeFile(root+'edge-manifest.json',JSON.stringify(result,null,2)+'\n')
console.log(result.map(x=>({name:x.name,bytes:x.bytes})))
