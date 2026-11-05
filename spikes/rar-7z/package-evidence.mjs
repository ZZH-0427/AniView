import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
const root='spikes/rar-7z',out='.tools/m10c2/source-package',licenses=root+'/licenses'
await mkdir(out,{recursive:true});await mkdir(licenses,{recursive:true});await mkdir(out+'/adapter',{recursive:true})
for(const [from,name]of [
  ['.tools/m10c2/source/DOC/License.txt','7zip-License.txt'],['.tools/m10c2/source/DOC/copying.txt','LGPL-2.1.txt'],
  ['.tools/m10c2/source/DOC/unRarLicense.txt','unRarLicense.txt'],['.tools/m10c2/wrapper/LICENSE','sevenzip-wasm-LICENSE.txt'],
  ['.tools/emsdk/upstream/emscripten/LICENSE','emscripten-LICENSE.txt']
])await copyFile(from,licenses+'/'+name)
for(const name of ['compiler-rt','libcxx','libcxxabi','libunwind'])await copyFile('.tools/emsdk/upstream/emscripten/system/lib/'+name+'/LICENSE.TXT',licenses+'/'+name+'-LICENSE.txt')
// musl supplies a standalone copyright file rather than a file named LICENSE.
await copyFile('.tools/emsdk/upstream/emscripten/system/lib/libc/musl/COPYRIGHT',licenses+'/musl-COPYRIGHT.txt')
for(const name of await readdir(root))if(/\.(mjs|ts|md|py)$/.test(name))await copyFile(root+'/'+name,out+'/adapter/'+name)
for(const name of ['index.html','trace-index.html','.gitignore'])await copyFile(root+'/'+name,out+'/adapter/'+name)
await mkdir(out+'/adapter/native',{recursive:true});await copyFile(root+'/native/bridge.cpp',out+'/adapter/native/bridge.cpp')
await copyFile('.tools/m10c2/7zip.tar.gz',out+'/7zip-b88c6bc.tar.gz');await copyFile('.tools/m10c2/wrapper.tar.gz',out+'/wrapper-7b53d4a.tar.gz')
const manifest={schema:1,engine:'7-Zip 26.05',engineRevision:'b88c6bc09339de32f7d18bbab900686b244f42ba',referencePackage:'sevenzip-wasm 26.5.0',emscripten:'6.0.13',node:process.version,
  memory:{initial:16777216,maximum:67108864,growth:true,shared:false},assets:[],buildReproducible:false}
for(const file of ['artifacts/bounded-sevenzip.js','artifacts/bounded-sevenzip.wasm','worker.mjs','backend.mjs','policy.mjs','runtime-init.mjs','harness.mjs']){const b=await readFile(root+'/'+file);manifest.assets.push({file,bytes:b.length,gzipBytes:gzipSync(b).length,sha256:createHash('sha256').update(b).digest('hex')})}
async function hashReport(path){const bytes=await readFile(path);return JSON.parse(bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''))}
const a=await hashReport('.tools/m10c2/rebuild-1-hashes.json')
const b=await hashReport('.tools/m10c2/rebuild-2-hashes.json')
manifest.buildReproducible=a.length===b.length&&a.every((x,i)=>x.Hash===b[i].Hash)
// Inspect the memory section, rather than trusting link flags alone.
const wasm=await readFile(root+'/artifacts/bounded-sevenzip.wasm');let at=8
function leb(){let n=0,shift=0,v;do{v=wasm[at++];n+=(v&127)*2**shift;shift+=7}while(v&128);return n}
while(at<wasm.length){const type=wasm[at++],size=leb(),end=at+size;if(type===5){const count=leb(),flags=leb(),initial=leb(),maximum=(flags&1)?leb():null;manifest.memory.binary={count,flags,initial:initial*65536,maximum:maximum*65536};break}at=end}
await writeFile(root+'/artifacts/manifest.json',JSON.stringify(manifest,null,2)+'\n')
await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n')
await mkdir(out+'/licenses',{recursive:true});for(const name of await readdir(licenses))await copyFile(licenses+'/'+name,out+'/licenses/'+name)
execFileSync('tar',['-czf',resolve(root+'/artifacts/corresponding-source.tar.gz'),'-C',resolve(out),'.'],{windowsHide:true})
await writeFile('.tools/m10c2/package-manifest.json',JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest))
