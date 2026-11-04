// TEST FIXTURE ONLY. These public, synthetic passwords are not personal/account credentials.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { BlobReader, BlobWriter, Uint8ArrayReader, ZipReader, ZipWriter, terminateWorkers } from '@zip.js/zip.js'

const root=resolve('tests/fixtures/zip'),scratch=resolve('.tools/password-zip/inputs')
await mkdir(scratch,{recursive:true})
const password='aniview-test',other='beta',seven=process.env.SEVEN_ZIP??'C:/Program Files/7-Zip/7z.exe'
const producer=execFileSync(seven,['i'],{encoding:'utf8',windowsHide:true}).split('\n').find(x=>x.startsWith('7-Zip'))?.trim()
const gif=await readFile('tests/fixtures/gif/previous.gif'),webp=await readFile('tests/fixtures/zip/original-two-frame.webp'),apng=await readFile('tests/fixtures/apng/full-infinite.png'),png=await readFile('tests/fixtures/static/quadrants.png')
await writeFile(join(scratch,'animated.gif'),gif)
const generated=[]
for(const [kind,method] of [['zipcrypto','ZipCrypto'],['aes128','AES128'],['aes192','AES192'],['aes256','AES256']])for(const compression of ['store','deflate']){
 const name=`password-${kind}-${compression}.zip`,path=join(root,name)
 await rm(path,{force:true}) // One explicitly named generated fixture, never recursive.
 execFileSync(seven,['a','-tzip',compression==='store'?'-mm=Copy':'-mm=Deflate',compression==='store'?'-mx=0':'-mx=5','-mem='+method,'-p'+password,path,'animated.gif'],{cwd:scratch,windowsHide:true,stdio:'ignore'})
 generated.push({name,producer,credential:password})
}
async function archive(name,entries){
 const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false,useCompressionStream:false})
 for(const e of entries)await writer.add(e.name,new Uint8ArrayReader(e.data),{level:0,...e.options})
 await writeFile(join(root,name),new Uint8Array(await(await writer.close()).arrayBuffer()))
 generated.push({name,producer:'@zip.js/zip.js 2.23.0 supplemental fixture',credential:password,...(name.includes('different')?{otherCredential:other}:{})})
}
const zipcrypto={password,zipCrypto:true},aes={password,encryptionStrength:3}
await archive('password-mixed.zip',[
 {name:'01-public.gif',data:gif},{name:'02-locked.gif',data:gif,options:zipcrypto},
 {name:'03-public.png',data:png},{name:'04-locked.webp',data:webp,options:aes},
 {name:'05-locked.png',data:apng,options:{password,encryptionStrength:2}},
])
await archive('password-different.zip',[
 {name:'01-alpha.gif',data:gif,options:zipcrypto},{name:'02-beta.gif',data:gif,options:{password:other,encryptionStrength:1}},
 {name:'03-alpha.png',data:apng,options:aes},
])
await archive('password-first.zip',[{name:'01-locked.gif',data:gif,options:aes},{name:'02-public.gif',data:gif}])
function record(bytes){const eocd=bytes.lastIndexOf(Buffer.from([0x50,0x4b,5,6])),central=bytes.readUInt32LE(eocd+16),local=bytes.readUInt32LE(central+42),start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);return{central,local,start,compressed:bytes.readUInt32LE(central+20)}}
async function mutated(name,source,change){const b=Buffer.from(await readFile(join(root,source)));change(b,record(b));await writeFile(join(root,name),b);generated.push({name,producer:'Controlled mutation of '+source,credential:password})}
await mutated('password-corrupt-zipcrypto.zip','password-zipcrypto-store.zip',(b,r)=>b[r.start+15]^=128)
await mutated('password-corrupt-aes.zip','password-aes256-store.zip',(b,r)=>b[r.start+r.compressed-1]^=128)
await mutated('password-corrupt-header.zip','password-aes256-store.zip',(b,r)=>b[r.start]^=128)
await mutated('password-unsupported.zip','password-zipcrypto-store.zip',(b,r)=>{for(const i of [r.local+6,r.central+8])b.writeUInt16LE(b.readUInt16LE(i)|0x40,i)})
await mutated('password-invalid-strength.zip','password-aes256-store.zip',(b,r)=>{
 for(const [start,length] of [[r.local+30+b.readUInt16LE(r.local+26),b.readUInt16LE(r.local+28)],[r.central+46+b.readUInt16LE(r.central+28),b.readUInt16LE(r.central+30)]])for(let p=start;p<start+length;){const n=b.readUInt16LE(p+2);if(b.readUInt16LE(p)===0x9901)b[p+8]=4;p+=4+n}
})
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'))
for(const value of generated){const bytes=await readFile(join(root,value.name)),reader=new ZipReader(new BlobReader(new Blob([bytes])),{useWebWorkers:false});try{const entries=await reader.getEntries();manifest[value.name]={encodedBytes:bytes.length,encodedSha256:createHash('sha256').update(bytes).digest('hex'),testFixtureOnly:true,...value,entries:entries.map(e=>({name:e.filename,bytes:e.uncompressedSize,encrypted:e.encrypted,compressionMethod:e.compressionMethod,aesStrength:e.extraFieldAES?.strength??null}))}}finally{await reader.close()}}
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await terminateWorkers()
console.log(JSON.stringify({generated:generated.length,producer,testFixtureOnly:true}))
