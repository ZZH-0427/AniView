// Observes a local production build, including Worker network requests. No uploads.
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { launchBrowser } from './browser.mjs'
const base=process.env.ANIVIEW_CREATION_AUDIT_URL??'http://127.0.0.1:4274/AniView/'
const out=resolve('.tools/m10a2'), q=id=>`[data-testid="${id}"]`, report={targets:[]}
await mkdir(out,{recursive:true})
for(const target of ['gif','apng','webp']){
 const b=await launchBrowser(join(out,'runtime-'+target))
 try{
  await b.navigate(base);await b.waitFor('!!document.querySelector(".home")')
  const home=[...b.assets];assert(!home.some(x=>/CreatorWorkspace|encoder.worker|static-source.worker|\.wasm/.test(x.url)))
  await b.click(q('create-gif-entry'));await b.waitFor(`!!document.querySelector('${q('creation-input')}')`)
  const entering=[...b.assets];assert(!entering.some(x=>/encoder.worker|static-source.worker|\.wasm/.test(x.url)));assert.equal(await b.evaluate('window.__creationProbe.workersCreated'),0)
  assert.equal(await b.evaluate('!!document.querySelector("[data-testid=creation-debug]")'),false)
  await b.click(`input[name="creation-target"][value="${target}"]`)
  await b.inputFiles(q('creation-input'),['jpg','png','webp'].map(ext=>resolve('tests/fixtures/static/quadrants.'+ext)))
  await b.waitFor(`document.querySelectorAll('${q('creation-source-row')}').length===3&&!document.querySelector('${q('creation-input')}').disabled`)
  await b.click(q('creation-generate'));await b.waitFor(`!!document.querySelector('${q('creation-result')}')`,60000)
  const assets=[...new Map(b.assets.map(x=>[x.url,x])).values()]
  assert.equal(assets.some(x=>x.url.endsWith('.wasm')),target==='webp')
  assert(assets.some(x=>x.url.includes('static-source.worker-')));assert(assets.some(x=>x.url.includes('encoder.worker-Btvfz7ZV')))
  await b.click(q('creation-back'));await b.waitFor('!!document.querySelector(".home")&&window.__creationProbe.activeWorkers===0')
  assert.deepEqual(b.errors,[])
  report.targets.push({target,homeAssets:home,creatorEntryAssets:entering,allAssets:assets,workers:await b.evaluate('window.__creationProbe.workersCreated'),ordinaryDiagnosticsAbsent:true})
 }finally{await b.close()}
}
const names=await readdir('dist/assets'),baseline=JSON.parse(await readFile('docs/research/v0.2-rc-build-manifest.json','utf8'))
report.bundle=[]
for(const prefix of ['index-','CreatorWorkspace-','static-source.worker-','encoder.worker-','aniview-webp-'])for(const name of names.filter(n=>n.startsWith(prefix))){
 const data=await readFile('dist/assets/'+name);const old=baseline.assets.find(a=>a.path==='assets/'+name)
 const sha256=createHash('sha256').update(data).digest('hex')
 report.bundle.push({path:'assets/'+name,bytes:data.length,gzipBytes:gzipSync(data).length,sha256,identicalV02Asset:!!old&&old.sha256===sha256})
}
await writeFile(join(out,'runtime-audit.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({passed:true,targets:report.targets.map(x=>({target:x.target,wasm:x.allAssets.filter(a=>a.url.endsWith('.wasm')).length})),bundle:report.bundle}))
