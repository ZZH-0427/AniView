import {defineConfig} from 'vite'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
const identity=createHash('sha256')
for(const folder of['src/video-source','src/spikes/video-source','src/conversion'])for(const name of readdirSync(folder).sort()){
  if(name.endsWith('.ts')&&!name.endsWith('.test.ts'))identity.update(folder+'/'+name).update(readFileSync(folder+'/'+name))
}
for(const name of['package-lock.json','experiments/video-source/index.html'])identity.update(readFileSync(name))
const buildIdentity='8d1-'+identity.digest('hex').slice(0,12)
export default defineConfig({base:'/AniView/',publicDir:false,define:{__VIDEO_SOURCE_BUILD__:JSON.stringify(buildIdentity)},build:{outDir:'.tools/video-source-site',emptyOutDir:true,
  rollupOptions:{input:resolve('experiments/video-source/index.html')}},plugins:[{
  name:'video-source-notices',async generateBundle(){
    this.emitFile({type:'asset',fileName:'third-party-notices.txt',source:await readFile('public/third-party-notices.txt','utf8')})
  }}]})
