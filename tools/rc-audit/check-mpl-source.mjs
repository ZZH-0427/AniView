// Audit one exact corresponding-source archive, not a dependency install or upgrade.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const lock=JSON.parse(await readFile('package-lock.json','utf8')),entry=lock.packages['node_modules/mediabunny']
assert.equal(entry.version,'1.65.0');const url='https://registry.npmjs.org/mediabunny/-/mediabunny-1.65.0.tgz'
const response=await fetch(url,{signal:AbortSignal.timeout(45000)});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer()),[algorithm,expected]=entry.integrity.split('-');assert.equal(createHash(algorithm).update(bytes).digest('base64'),expected)
const archive='.tools/rc-audit/mediabunny-1.65.0.tgz';await writeFile(archive,bytes)
const list=execFileSync('tar',['-tf',archive],{encoding:'utf8'}).trim().split(/\r?\n/),sources=list.filter(p=>p.startsWith('package/src/')&&!p.endsWith('/'))
assert.ok(sources.length>10);const changed=[];for(const path of [...sources,'package/LICENSE']){assert.ok(!path.includes('..'));const original=execFileSync('tar',['-xOf',archive,path],{maxBuffer:8*1024*1024}),installed=await readFile('node_modules/mediabunny/'+path.slice('package/'.length));if(!original.equals(installed))changed.push(path)}
assert.deepEqual(changed,[]);const report={version:entry.version,license:'MPL-2.0',url,archiveBytes:bytes.length,lockfileIntegrityMatches:true,sourceFilesCompared:sources.length,upstreamFilesChanged:changed,licenseMatches:true};await writeFile('.tools/rc-audit/mpl-source.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
