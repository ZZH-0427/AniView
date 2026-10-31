import {build} from 'vite'
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'
import assert from 'node:assert/strict'
const root='.tools/video-source'
await mkdir(root+'/bundle-probe',{recursive:true})
await writeFile(root+'/bundle-probe/entry.js',"import{Input,CustomSource,MP4,WEBM,VideoSampleSink,EncodedPacketSink}from'mediabunny';globalThis.__videoInputSymbols={Input,CustomSource,MP4,WEBM,VideoSampleSink,EncodedPacketSink};")
await build({configFile:false,publicDir:false,build:{outDir:root+'/bundle-probe/dist',emptyOutDir:true,minify:true,
  rollupOptions:{input:root+'/bundle-probe/entry.js',output:{entryFileNames:'mediabunny-input.js'}}}})
const size=async path=>{const b=await readFile(path);return{path,bytes:b.length,gzipBytes:gzipSync(b).length}}
const ordinaryHtml=await readFile('dist/index.html','utf8'),entry=ordinaryHtml.match(/src="([^"]+\.js)"/)[1]
const normalNames=await readdir('dist/assets')
assert(!normalNames.some(x=>/source\.worker|verify\.worker/.test(x)),'ordinary build must exclude 8D engineering/source workers')
const harnessNames=await readdir('.tools/video-source-site/assets')
const report={ordinaryEntry:await size('dist/'+entry.replace('/AniView/','')),
  harnessEntry:await size('.tools/video-source-site/assets/'+harnessNames.find(x=>/^index-.*\.js$/.test(x))),
  videoSourceWorker:await size('.tools/video-source-site/assets/'+harnessNames.find(x=>/^source\.worker-/.test(x))),
  standaloneMediabunnyInputProbe:await size(root+'/bundle-probe/dist/mediabunny-input.js'),
  ordinaryIncludesVideoSourceWorker:false,attribution:'Standalone probe is same-public-symbol minification; not exact additive/shared attribution.'}
try{
  const raw=await readFile('.tools/mp4-product/frozen-build-report.log')
  const log=raw.toString(raw[0]===255&&raw[1]===254?'utf16le':'utf8'),start=log.search(/\{\r?\n\s*"version"/),baseline=JSON.parse(log.slice(start))
  report.baseline8C2Entry=baseline.assets.find(x=>/^assets\/index-.*\.js$/.test(x.path))
  report.ordinaryEntryDeltaBytes=report.ordinaryEntry.bytes-report.baseline8C2Entry.bytes
}catch{report.baseline8C2Entry=null}
await writeFile(root+'/bundle.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
