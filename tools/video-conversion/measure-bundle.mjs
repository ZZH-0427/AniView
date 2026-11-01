import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'
const root='.tools/video-conversion-product'
await mkdir(root,{recursive:true})
const html=await readFile('dist/index.html','utf8'),files=await readdir('dist/assets')
const size=async name=>{const b=await readFile('dist/assets/'+name);return{file:name,bytes:b.length,gzipBytes:gzipSync(b).length}}
const entry=html.match(/src="\/AniView\/assets\/([^"]+\.js)"/)[1]
const startup=[...new Set([entry,...Array.from(html.matchAll(/rel="modulepreload"[^>]*href="\/AniView\/assets\/([^"]+)"/g),m=>m[1])])]
const startupAssets=await Promise.all(startup.map(size))
const selected=async prefix=>Promise.all(files.filter(name=>name.startsWith(prefix)&&name.endsWith('.js')).map(size))
const result={ordinaryEntry:await size(entry),startupJavascript:startupAssets,startupRawTotal:startupAssets.reduce((s,x)=>s+x.bytes,0),
 startupGzipTotal:startupAssets.reduce((s,x)=>s+x.gzipBytes,0),videoProductUI:await selected('VideoConversionWorkspace-'),
 videoRuntime:await Promise.all(files.filter(n=>/^runtime-(?!diagnostics-).*\.js$/.test(n)).map(size)),sourceWorker:await selected('source.worker-'),
 encoderWorkers:await selected('encoder.worker-'),inspectionWorker:await selected('inspection.worker-'),
 baseline8D1:{ordinaryEntryBytes:291867,ordinaryEntryGzipBytes:88531,sourceWorkerBytes:274358,sourceWorkerGzipBytes:72288},
 mediabunny:'Existing pinned code is inside Source/Video encoder Workers; standalone attribution is not an additive dependency delta.'}
result.startupDeltaBytes=result.startupRawTotal-result.baseline8D1.ordinaryEntryBytes
await writeFile(root+'/bundle.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
