import assert from 'node:assert/strict'
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {gzipSync} from 'node:zlib'
async function files(root,prefix=''){const paths=[];for(const e of await readdir(root,{withFileTypes:true})){const p=prefix+e.name;if(e.isDirectory())paths.push(...await files(root+'/'+e.name,p+'/'));else paths.push(p)}return paths.sort()}
const arg=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback
const root=arg('--second','.tools/rc-audit/build-2'),firstRoot=arg('--first','.tools/rc-audit/build-1'),paths=await files(root),first=await files(firstRoot);assert.deepEqual(paths,first)
const assets=[];for(const path of paths){const b=await readFile(root+'/'+path);assert.deepEqual(b,await readFile(firstRoot+'/'+path),path);assets.push({path,size:b.length,sha256:createHash('sha256').update(b).digest('hex'),gzipBytes:gzipSync(b).length})}
const forbidden=paths.filter(p=>/\.map$|(^|\/)(validation|fixtures|experiments|node_modules|\.tools)(\/|$)|\.log$/.test(p));assert.deepEqual(forbidden,[])
const identity=JSON.parse(await readFile(root+'/release-candidate.json','utf8'));assert.equal(identity.sourceDirty,false)
const html=await readFile(root+'/index.html','utf8'),startups=[...html.matchAll(/(?:src|href)="\/AniView\/([^"?]+\.js)"/g)].map(x=>x[1]),css=[...html.matchAll(/href="\/AniView\/([^"?]+\.css)"/g)].map(x=>x[1])
const sum=names=>names.reduce((a,p)=>{const v=assets.find(x=>x.path===p);return{size:a.size+v.size,gzipBytes:a.gzipBytes+v.gzipBytes}},{size:0,gzipBytes:0})
const groups={ordinaryEntry:startups.map(p=>assets.find(x=>x.path===p)),ordinaryTotal:sum(startups),entryCss:sum(css),
 creator:assets.filter(x=>/CreatorWorkspace-/.test(x.path)),videoUi:assets.filter(x=>/VideoConversionWorkspace-/.test(x.path)),
 sourceWorker:assets.filter(x=>/source\.worker-/.test(x.path)),encoderWorkers:assets.filter(x=>/encoder\.worker-/.test(x.path)),
 lazyRuntimes:assets.filter(x=>/\/(runtime-|VideoResultPreview-|ConversionWorkspace-)/.test(x.path)),
 mp4Runtime:assets.filter(x=>/\/convert-(?!animation-).*\.js$/.test(x.path)),wasm:assets.filter(x=>/\.wasm$/.test(x.path))}
const report={schema:1,date:'2026-11-04',...identity,status:'DESKTOP AUDIT; ANDROID PENDING',fileCount:paths.length,
 determinism:{cleanBuilds:2,identicalFiles:paths.length,differentFiles:[]},base:'/AniView/',sourceMaps:false,unexpectedArtifacts:forbidden,
 counts:{javascript:paths.filter(x=>x.endsWith('.js')).length,css:paths.filter(x=>x.endsWith('.css')).length,workers:paths.filter(x=>x.includes('.worker-')).length,wasm:paths.filter(x=>x.endsWith('.wasm')).length},groups,assets}
await mkdir('docs/research',{recursive:true});await writeFile('docs/research/v0.2-rc-build-manifest.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({candidate:identity.commit,files:paths.length,deterministic:true,counts:report.counts,ordinary:groups.ordinaryTotal,css:groups.entryCss,workers:groups.encoderWorkers.map(x=>({path:x.path,size:x.size}))}))
