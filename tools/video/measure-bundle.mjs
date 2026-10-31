// Same-symbol standalone minified probe, not an exact allocation of shared minifier bytes.
import {build} from 'vite'
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'
await mkdir('.tools/video/bundle-probe',{recursive:true})
await writeFile('.tools/video/bundle-probe/entry.js',"import {BufferSource,BufferTarget,EncodedPacket,EncodedVideoPacketSource,Input,MP4,Mp4OutputFormat,Output,VideoSampleSink} from 'mediabunny';globalThis.__mediabunnySymbols={BufferSource,BufferTarget,EncodedPacket,EncodedVideoPacketSource,Input,MP4,Mp4OutputFormat,Output,VideoSampleSink};\n")
await build({configFile:false,publicDir:false,build:{outDir:'.tools/video/bundle-probe/dist',emptyOutDir:true,minify:true,rollupOptions:{input:'.tools/video/bundle-probe/entry.js',output:{entryFileNames:'mediabunny-probe.js'}}}})
const file=(await readdir('.tools/video/bundle-probe/dist')).find(x=>x.endsWith('.js')),data=await readFile('.tools/video/bundle-probe/dist/'+file)
const report={scope:'Same public symbols in a standalone minified entry; shared-minifier effects prevent exact additive attribution',bytes:data.length,gzipBytes:gzipSync(data).length}
await writeFile('.tools/video/mediabunny-bundle.json',JSON.stringify(report,null,2));console.log(report)
