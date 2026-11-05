import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const from='spikes/rar-7z',root=process.env.SPIKE_FREEZE_ROOT??'.tools/m10c2/frozen'
await mkdir(root,{recursive:true});const hashes=[]
async function copyTree(source,target){await mkdir(target,{recursive:true});for(const entry of await readdir(source,{withFileTypes:true}))if(entry.isDirectory())await copyTree(source+'/'+entry.name,target+'/'+entry.name);else await copy(source+'/'+entry.name,target+'/'+entry.name)}
async function copy(source,target){await copyFile(source,target);const b=await readFile(target);hashes.push({file:target.slice(root.length+1),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')})}
for(const file of ['index.html','harness.mjs','backend.mjs','worker.mjs','policy.mjs','runtime-init.mjs','THIRD_PARTY_NOTICES.md'])await copy(from+'/'+file,root+'/'+file)
if(process.env.SPIKE_FREEZE_INDEX){await copy(process.env.SPIKE_FREEZE_INDEX,root+'/index.html');hashes.splice(hashes.findIndex(h=>h.file==='index.html'),1)}
await copyTree(from+'/artifacts',root+'/artifacts');await copyTree(from+'/licenses',root+'/licenses');await copyTree('.tools/m10c2/fixtures',root+'/fixtures')
await writeFile((process.env.SPIKE_FREEZE_MANIFEST??'.tools/m10c2/frozen-manifest.json'),JSON.stringify(hashes,null,2)+'\n')
console.log('Frozen '+hashes.length+' independent assets; no source watching or HMR.')
