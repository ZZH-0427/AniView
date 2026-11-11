// Pinned read-only product component. This build does not run during npm install.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { applyNativePatches, hashBuildInputs } from './apply-native-patches.mjs'
const source = resolve(process.env.SEVENZIP_SOURCE ?? '.tools/m10c3/source')
const sdk = resolve(process.env.EMSDK ?? '.tools/emsdk')
const out = resolve('public/vendor/sevenzip')
const work = resolve('.tools/m10c3/native-build')
await mkdir(out, { recursive: true }); await mkdir(work, { recursive: true })
if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Build requires Node.js 24')
const compilerVersion = JSON.parse((await readFile(sdk + '/upstream/emscripten/emscripten-version.txt', 'utf8')).trim())
if (compilerVersion !== '6.0.13') throw Error('Pinned component build requires Emscripten 6.0.13')
const config = `LLVM_ROOT = '${sdk.replaceAll('\\', '/')}/upstream/bin'\nBINARYEN_ROOT = '${sdk.replaceAll('\\', '/')}/upstream'\nNODE_JS = '${process.execPath.replaceAll('\\', '/')}'\n`
await writeFile(work + '/emscripten.config', config)
const arc = await readFile(source + '/CPP/7zip/Bundles/Format7zF/Arc_gcc.mak', 'utf8')
const rules = await readFile(source + '/CPP/7zip/7zip_gcc.mak', 'utf8')
applyNativePatches(source)
const groups = ['COMMON_OBJS', 'WIN_OBJS', '7ZIP_COMMON_OBJS', 'AR_COMMON_OBJS', '7Z_OBJS', 'RAR_OBJS', 'COMPRESS_OBJS', 'CRYPTO_OBJS', 'C_OBJS']
const objects = new Set(['MyWindows', 'FileStreams'])
for (const group of groups) for (const m of arc.matchAll(new RegExp('^' + group + ' \\+?= ([\\s\\S]*?)(?=\\n\\s*\\n)', 'gm')))
  for (const name of m[1].matchAll(/\$O\/(\w+)\.o/g)) objects.add(name[1])
// No update/creation handlers or unrelated container registrations. Decoder
// support is kept conservative; unused functions are removed at link time.
for (const name of [...objects]) if (name === '7zRegister' || /^(7zUpdate|7zEncode|7zHandlerOut)$/.test(name)) objects.delete(name)
const map = new Map([...rules.matchAll(/^\$O\/(\w+)\.o:\s+([^\r\n]+\.(?:cpp|c))\b/gm)].map(m => [m[1], resolve(source, 'CPP/7zip/Bundles/Alone2', m[2])]))
const flags = ['-Oz', '-DZ7_ST', '-DZ7_EXTRACT_ONLY', '-D_FILE_OFFSET_BITS=64', '-fexceptions']
const commands = [...objects].map(name => {
  if (!map.has(name)) throw Error('No source mapping: ' + name)
  return { name, file: map.get(name) }
})
commands.push({ name: 'aniview_bridge', file: resolve('tools/extended-archive/native/bridge.cpp') })
const q = s => '"' + s.replaceAll('\\', '/') + '"'
const nf = s => s.replaceAll('\\', '/').replaceAll(':', '$:').replaceAll(' ', '$ ')
let ninja = `builddir = ${nf(work)}\nrule cc\n  command = ${q(process.execPath)} ${q(resolve('tools/extended-archive/compile.mjs'))} $in $out\nrule link\n  command = ${q(process.execPath)} ${q(resolve('tools/extended-archive/compile.mjs'))} LINK $out\n`
for (const c of commands) ninja += `build ${nf(work + '/' + c.name + '.o')}: cc ${nf(c.file)} | ${nf(work + '/commands.json')}\n`
const exports = ['open', 'count', 'string', 'number', 'extract', 'output', 'length', 'release', 'close', 'last'].map(n => '_av_' + n)
const link = [...commands.map(c => work + '/' + c.name + '.o'), '-Oz', '-fexceptions', '--no-entry', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=BoundedSevenZip', '-sENVIRONMENT=worker,node', '-sINITIAL_MEMORY=16777216', '-sMAXIMUM_MEMORY=67108864', '-sALLOW_MEMORY_GROWTH=1', '-sSTACK_SIZE=1048576', '-sABORTING_MALLOC=0', '-sDYNAMIC_EXECUTION=0', '-sEXPORTED_FUNCTIONS=' + JSON.stringify(exports), '-sEXPORTED_RUNTIME_METHODS=["FS","WORKERFS","UTF8ToString","ccall"]', '-lworkerfs.js', '-o', out + '/bounded-sevenzip.js']
await writeFile(work + '/commands.json', JSON.stringify({ sdk, source, flags, link, config: work + '/emscripten.config' }))
ninja += `build ${nf(out + '/bounded-sevenzip.js')}: link ${commands.map(c => nf(work + '/' + c.name + '.o')).join(' ')}\n`
await writeFile(work + '/build.ninja', ninja)
const result = spawnSync(resolve(process.env.NINJA_EXE??'.tools/python-build/bin/ninja.exe'), ['-f', work + '/build.ninja', '-j', '6'], { stdio: 'inherit', env: process.env, windowsHide: true })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
if (result.status === 0) {
  const artifacts = []
  for (const file of ['bounded-sevenzip.js', 'bounded-sevenzip.wasm'])
    artifacts.push({ file, sha256: createHash('sha256').update(await readFile(out + '/' + file)).digest('hex') })
  await writeFile(work + '/build-receipt.json', JSON.stringify({ schema: 1,
    emscripten: compilerVersion, node: process.version, inputs: await hashBuildInputs(), artifacts,
    memory: { initial: 16777216, maximum: 67108864, shared: false, growth: true } }, null, 2) + '\n')
}
const label=process.argv[2]
if(result.status===0&&['rebuild-1','rebuild-2'].includes(label)){
  const hashes=[]
  for(const file of ['bounded-sevenzip.js','bounded-sevenzip.wasm'])hashes.push({Algorithm:'SHA256',Hash:createHash('sha256').update(await readFile(out+'/'+file)).digest('hex').toUpperCase(),Path:out+'/'+file})
  await writeFile('.tools/m10c3/'+label+'-hashes.json',JSON.stringify(hashes,null,2)+'\n')
}
