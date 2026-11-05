import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const root=resolve('.tools/m10c2'),dir=join(root,'fixtures'),inputs=join(root,'inputs')
await mkdir(dir,{recursive:true});await mkdir(inputs,{recursive:true})
const seven='C:/Program Files/7-Zip/7z.exe',rows=[]
const sha=b=>createHash('sha256').update(b).digest('hex')
const media=[['01.gif','tests/fixtures/gif/previous.gif'],['02.webp','tests/fixtures/zip/original-two-frame.webp'],['03.png','tests/fixtures/apng/full-infinite.png'],['04.jpg','tests/fixtures/static/quadrants.jpg']]
const basic=[]
for(const [name,file]of media){const b=await readFile(file);await writeFile(join(inputs,name),b);basic.push({path:name,bytes:b.length,sha256:sha(b)})}
for(const name of ['目录 中文.txt','日本語.txt','emoji-😀 = .txt']){const b=Buffer.from('AniView original synthetic fixture '+name);await writeFile(join(inputs,name),b);basic.push({path:name,bytes:b.length,sha256:sha(b)})}
async function make(name,args,expected=basic,cwd=inputs){
  const path=join(dir,name)
  execFileSync(seven,['a','-t7z','-y','-mmt=1',...args,path,...expected.map(e=>e.path)],{cwd,windowsHide:true,stdio:'ignore'})
  const b=await readFile(path);rows.push({name,bytes:b.length,sha256:sha(b),expected,credential:/password|headers/.test(name)?'aniview-test':null})
}
await make('normal.7z',['-ms=off','-m0=LZMA2','-md=1m'])
await make('solid.7z',['-ms=on','-m0=LZMA2','-md=1m'])
await make('password.7z',['-ms=on','-paniview-test','-mhe=off','-md=1m'])
await make('headers.7z',['-ms=on','-paniview-test','-mhe=on','-md=1m'])
for(const method of ['Copy','LZMA','LZMA2','Deflate','BZip2','PPMd'])await make('codec-'+method.toLowerCase()+'.7z',['-ms=on','-m0='+method])
for(const filter of ['BCJ','BCJ2','Delta'])await make('filter-'+filter.toLowerCase()+'.7z',['-ms=on','-m0='+filter,'-m1=LZMA2'])
for(const [name,mb,method,dict]of [['input-1m.7z',1/3,'Copy',null],['medium.7z',2,'LZMA2','4m'],['large.7z',5,'Copy',null]]){
  const cwd=join(inputs,name);await mkdir(cwd,{recursive:true});const expected=[];let x=0x12345678
  for(let k=0;k<3;k++){const b=Buffer.alloc(Math.floor(mb*1024**2));for(let i=0;i<b.length;i++){x^=x<<13;x^=x>>>17;x^=x<<5;b[i]=x&255}const path=`0${k}.bin`;await writeFile(join(cwd,path),b);expected.push({path,bytes:b.length,sha256:sha(b)})}
  await make(name,['-ms=on','-m0='+method,...(dict?['-md='+dict]:[]),'-mx=1'],expected,cwd)
}
const cwd=join(inputs,'compressible');await mkdir(cwd,{recursive:true});const repetitive=Buffer.alloc(20*1024**2,65)
await writeFile(join(cwd,'zeros.bin'),repetitive)
for(const dict of ['1m','4m','16m','64m'])await make('dict-'+dict+'.7z',['-ms=on','-m0=LZMA2','-md='+dict],[{path:'zeros.bin',bytes:repetitive.length,sha256:sha(repetitive)}],cwd)
const oversized=Buffer.alloc(80*1024**2,65);await writeFile(join(cwd,'oversized.bin'),oversized)
await make('dictionary-over-cap.7z',['-ms=on','-m0=LZMA2','-md=128m'],[{path:'oversized.bin',bytes:oversized.length,sha256:sha(oversized)}],cwd)
const pin='2774b74cb7269c9b5fa89e7d876b11d5a729c421'
for(const name of ['test_read_format_rar.rar','test_read_format_rar5_compressed.rar','test_read_format_rar5_multiple_files_solid.rar','test_read_format_rar4_encrypted.rar','test_read_format_rar4_encrypted_filenames.rar','test_read_format_rar5_encrypted.rar','test_read_format_rar5_encrypted_filenames.rar']){
  const url=`https://raw.githubusercontent.com/libarchive/libarchive/${pin}/libarchive/test/${name}.uu`
  const api=`https://api.github.com/repos/libarchive/libarchive/contents/libarchive/test/${name}.uu?ref=${pin}`
  const r=await fetch(api,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(name+': '+r.status)
  const json=await r.json();if(json.encoding!=='base64')throw Error('Unexpected source encoding')
  const lines=Buffer.from(json.content,'base64').toString('utf8').split(/\r?\n/);let active=false;const output=[]
  for(const line of lines){if(line.startsWith('begin ')){active=true;continue}if(!active)continue;if(line==='end')break;const n=(line.charCodeAt(0)-32)&63;for(let i=1,count=0;count<n;i+=4){const a=(line.charCodeAt(i)-32)&63,b=(line.charCodeAt(i+1)-32)&63,c=(line.charCodeAt(i+2)-32)&63,d=(line.charCodeAt(i+3)-32)&63;for(const v of [(a<<2)|(b>>4),(b<<4)|(c>>2),(c<<6)|d])if(count++<n)output.push(v&255)}}
  const bytes=Buffer.from(output);await writeFile(join(dir,name),bytes)
  const targets=name==='test_read_format_rar.rar'?['test.txt','testdir/test.txt']:name==='test_read_format_rar5_compressed.rar'?['test.bin']:name.includes('solid')?['test1.bin','test2.bin','test3.bin','test4.bin']:['b.txt']
  const expected=targets.map(path=>{const b=execFileSync(seven,['e','-so','-ppassword',join(dir,name),'--',path],{windowsHide:true,stdio:['ignore','pipe','pipe']});return {path,bytes:b.length,sha256:sha(b)}})
  rows.push({name,bytes:bytes.length,sha256:sha(bytes),expected,credential:name.includes('encrypted')?'password':null,url})
}
const damaged=Buffer.from(await readFile(join(dir,'normal.7z')));damaged[Math.min(55,damaged.length-1)]^=255;await writeFile(join(dir,'damaged.7z'),damaged)
const truncated=damaged.subarray(0,20);await writeFile(join(dir,'truncated.7z'),truncated)
await writeFile(join(dir,'manifest.json'),JSON.stringify(rows,null,2)+'\n')
console.log(JSON.stringify(rows.map(x=>({name:x.name,bytes:x.bytes}))))
