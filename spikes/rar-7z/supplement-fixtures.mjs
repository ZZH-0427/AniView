import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
const root='.tools/m10c2/fixtures/',manifest=JSON.parse(await readFile(root+'manifest.json'))
const pin='2774b74cb7269c9b5fa89e7d876b11d5a729c421',sha=b=>createHash('sha256').update(b).digest('hex')
for(const name of ['test_read_format_rar4_solid_encrypted.rar','test_read_format_rar4_solid_encrypted_filenames.rar']){
  const api=`https://api.github.com/repos/libarchive/libarchive/contents/libarchive/test/${name}.uu?ref=${pin}`
  const response=await fetch(api,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(response.status)
  const json=await response.json(),lines=Buffer.from(json.content,'base64').toString().split(/\r?\n/);let active=false;const output=[]
  for(const line of lines){if(line.startsWith('begin ')){active=true;continue}if(!active)continue;if(line==='end')break;const n=(line.charCodeAt(0)-32)&63;for(let i=1,count=0;count<n;i+=4){const v=[0,1,2,3].map(k=>(line.charCodeAt(i+k)-32)&63);for(const b of [v[0]*4+(v[1]>>4),v[1]*16+(v[2]>>2),v[2]*64+v[3]])if(count++<n)output.push(b&255)}}
  const b=Buffer.from(output);await writeFile(root+name,b)
  const existing=manifest.find(f=>f.name===name)
  if(!existing)manifest.push({name,bytes:b.length,sha256:sha(b),credential:'password',expected:[],url:api})
}
// Independent native oracle for known ASCII fixture names; not a production
// parser or an interface that accepts arbitrary user filenames.
for(const name of ['test_read_format_rar5_multiple_files_solid.rar','test_read_format_rar4_solid_encrypted.rar','test_read_format_rar4_solid_encrypted_filenames.rar']){
  const row=manifest.find(f=>f.name===name),targets=name.includes('rar5')?['test1.bin','test2.bin','test3.bin','test4.bin']:['a.txt','b.txt','c.txt','d.txt']
  row.expected=[]
  for(const path of targets){const b=execFileSync('C:/Program Files/7-Zip/7z.exe',['e','-so','-ppassword',resolve(root+name),'--',path],{windowsHide:true,stdio:['ignore','pipe','pipe']});row.expected.push({path,bytes:b.length,sha256:sha(b)})}
}
await writeFile(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n')
console.log('RAR solid first/middle/last native hashes ready')
