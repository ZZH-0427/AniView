import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const root='.tools/m10c2'
await mkdir(root,{recursive:true})
for(const item of [
  ['7zip','https://codeload.github.com/ip7z/7zip/tar.gz/b88c6bc09339de32f7d18bbab900686b244f42ba','d06cf3c4b4cb085f9a9a5c385b80e46d9ab47849860a4e2c00e1882409c7f830'],
  ['wrapper','https://codeload.github.com/arktronic/sevenzip-wasm/tar.gz/7b53d4abf78da9eb06f9447730ae31eaf9acd7c3','6b0caee34dca8d9dffcc53ab26e9c95a8c6ae5ff5f15f309ad8b73f009487ba8']
]){
  const [name,url,expected]=item,path=root+'/'+name+'.tar.gz'
  let bytes;try{bytes=await readFile(path)}catch{const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Source download '+response.status);bytes=Buffer.from(await response.arrayBuffer());await writeFile(path,bytes)}
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Source archive integrity mismatch')
  const directory=root+'/'+(name==='7zip'?'source':name);await mkdir(directory,{recursive:true})
  const r=spawnSync('tar',['-xf',path,'-C',directory,'--strip-components=1'],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('Source unpack failed')
}
console.log('Pinned source archives verified; no package install or hooks executed.')
