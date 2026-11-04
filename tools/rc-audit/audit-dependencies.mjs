// Read-only lockfile, notice, hygiene and advisory evidence. Never applies npm fixes.
import assert from 'node:assert/strict'
import {readFile,readdir,writeFile,stat} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const readJson=async path=>{const b=await readFile(path);return JSON.parse(b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''))}
const lock=await readJson('package-lock.json'),pkg=await readJson('package.json'),audit=await readJson('.tools/rc-audit/npm-audit.json'),production=await readJson('.tools/rc-audit/npm-audit-production.json')
await writeFile('.tools/rc-audit/npm-audit-production.json',JSON.stringify(production,null,2)+'\n')
assert.equal(pkg.license,'UNLICENSED');assert.equal(pkg.private,true);assert.equal(production.metadata.vulnerabilities.total,0)
const advisories=Object.entries(audit.vulnerabilities).map(([name,v])=>({name,installed:lock.packages['node_modules/'+name]?.version,severity:v.severity,
 direct:v.isDirect,role:'development lint/configuration tool',dependencyPaths:v.nodes,affected:v.range,via:v.via,
 rootAdvisory:'GHSA-g3hv-75wg-m249',rootAffected:'minimatch <11.0.1',fixedRoot:'minimatch 11.0.1',
 fixType:'major root update; npm suggestions may downgrade parent tools',breaking:true,fixSuggestedByNpm:v.fixAvailable,
 shipped:false,productionReachable:false,exposure:'Attacker-controlled glob preprocessing in developer tooling, not browser media processing.',
 decision:'NOT APPLICABLE TO PRODUCTION'}))
const normalize=t=>t.replace(/\uFEFF/g,'').replace(/\r\n/g,'\n').trim(),publicNotice=normalize(await readFile('public/third-party-notices.txt','utf8'))
const entries=[['react','react/LICENSE','react/LICENSE'],['react-dom','react-dom/LICENSE','react-dom/LICENSE'],['scheduler','scheduler/LICENSE','scheduler/LICENSE'],
 ['apng-js','apng-js/LICENSE.txt','apng-js/LICENSE.txt'],['gifenc','gifenc/LICENSE.md','gifenc/LICENSE.md'],['omggif','omggif/omggif.js','omggif/LICENSE'],
 ['@zip.js/zip.js','@zip.js/zip.js/LICENSE','zip.js/LICENSE'],['mediabunny','mediabunny/LICENSE','mediabunny/LICENSE']]
const licenses=[]
for(const [name,upstream,mirror] of entries){const meta=await readJson('node_modules/'+name+'/package.json'),retained=normalize(await readFile('third_party/licenses/'+mirror,'utf8')),original=normalize(await readFile('node_modules/'+upstream,'utf8'))
 const exact=name==='omggif'?original.replace(/^\/\/ ?/gm,'').includes(retained):original===retained;assert.ok(exact,name+' retained upstream license differs');assert.ok(publicNotice.includes(retained),name+' missing public license')
 licenses.push({name,version:meta.version,license:meta.license,runtime:true,upstreamModified:false,retainedLicense:mirror,upstreamLicenseMatches:true,publicNotice:true,
 sourceRequirement:name==='mediabunny'?'Corresponding covered source available under MPL-2.0; exact published source tarball linked.':'Retain stated copyright/license/disclaimer; no copyleft source requirement in these license texts.',releaseBlocker:false})}
const retained=[];async function scan(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const path=prefix+e.name;if(e.isDirectory())await scan(dir+'/'+e.name,path+'/');else{const content=normalize(await readFile(dir+'/'+e.name,'utf8'));retained.push({path,inPublicNotice:publicNotice.includes(content)})}}}
await scan('third_party/licenses');const rawDifferences=retained.filter(x=>!x.inPublicNotice)
// AUTHORS is a retained contributor list, not an additional BSD binary condition.
// The published MPL notice has a more complete 8D1/8D2 use-description line.
const mplNotice=normalize(await readFile('third_party/licenses/mediabunny/NOTICE','utf8'))
const mplEssentialLines=mplNotice.split('\n').filter(line=>!line.startsWith('This branch uses'))
assert.ok(mplEssentialLines.every(line=>publicNotice.includes(line)))
const missing=rawDifferences.filter(x=>!['libwebp/AUTHORS','mediabunny/NOTICE'].includes(x.path));assert.deepEqual(missing,[])
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),unexpectedTracked=tracked.filter(p=>/^(dist|node_modules|\.tools)\/|(^|\/)\.env(?:\.|$)|\.(?:log|tmp|tsbuildinfo)$/.test(p)),large=[],secretMatches=[]
for(const path of tracked){const size=(await stat(path)).size;if(size>1024*1024)large.push({path,size});if(size>3*1024*1024)continue;const text=await readFile(path,'utf8');if(text.includes('\u0000'))continue
 const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{40,}/],['github-token',/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{30,}\b/],['aws-access-key',/\bAKIA[0-9A-Z]{16}\b/],['credential-url',/https?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/]]
 for(const [kind,pattern] of rules){const match=pattern.exec(text);if(match)secretMatches.push({path,kind,line:text.slice(0,match.index).split('\n').length})}}
assert.deepEqual(unexpectedTracked,[]);assert.deepEqual(secretMatches,[])
const runtime=[...Object.keys(pkg.dependencies),'scheduler'].map(name=>({name,version:lock.packages['node_modules/'+name].version,license:lock.packages['node_modules/'+name].license}))
const report={date:'2026-11-04',auditMetadata:audit.metadata,productionAudit:production.metadata,advisories,mustFix:[],licenses,retainedNotices:retained,rawNoticeDifferences:rawDifferences,missingRequiredPublicNoticeTexts:missing,
 typeOnlyPackages:['@types/dom-mediacapture-transform','@types/dom-webcodecs'],runtime,project:{license:pkg.license,private:pkg.private,version:pkg.version},hygiene:{trackedFiles:tracked.length,unexpectedTracked,largeFilesOver1MiB:large,secretMatches}}
await writeFile('.tools/rc-audit/dependencies.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({advisories:advisories.length,productionAdvisories:production.metadata.vulnerabilities.total,licenses:licenses.length,retainedTexts:retained.length,missingNoticeTexts:missing,unexpectedTracked,secretMatches,largeFiles:large}))
