// Explicit developer packaging step, not an npm install hook or runtime fetch.
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { inspectMemory } from './verify-runtime.mjs'
import { nativePatches, hashBuildInputs } from './apply-native-patches.mjs'
import assert from 'node:assert/strict'

const product = 'public/vendor/sevenzip', stage = '.tools/m10c3/corresponding-source'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const receipt = JSON.parse(await readFile('.tools/m10c3/native-build/build-receipt.json', 'utf8'))
assert.equal(receipt.emscripten, '6.0.13')
assert.deepEqual(receipt.inputs, await hashBuildInputs(), 'Native build inputs changed after compilation')
const manifest = {
  schema: 1,
  engine: '7-Zip 26.05', engineRevision: 'b88c6bc09339de32f7d18bbab900686b244f42ba',
  referencePackage: 'sevenzip-wasm 26.5.0', wrapperRevision: '7b53d4abf78da9eb06f9447730ae31eaf9acd7c3',
  emscripten: '6.0.13', emscriptenRevision: 'e13ee988ce3d87a738dd8f3661d02223308c412a', node: process.version,
  abi: { extractArguments: 3, probeCommands: false, formatHandlers: ['RAR4', 'RAR5', '7z'], writesArchives: false },
  memory: { initial: 16777216, maximum: 67108864, shared: false, growth: true },
  nativeOutputMaximum: 4194304,
  buildInputs: receipt.inputs,
  patches: nativePatches.map(name => ({ file: 'patches/' + name,
    sha256: receipt.inputs.find(input => input.file === 'tools/extended-archive/' + name).sha256 })),
  sourceArchives: [
    { file: '7zip-b88c6bc.tar.gz', source: '.tools/m10c3/7zip.tar.gz', sha256: 'd06cf3c4b4cb085f9a9a5c385b80e46d9ab47849860a4e2c00e1882409c7f830' },
    { file: 'wrapper-7b53d4a.tar.gz', source: '.tools/m10c3/wrapper.tar.gz', sha256: '6b0caee34dca8d9dffcc53ab26e9c95a8c6ae5ff5f15f309ad8b73f009487ba8' },
  ],
  assets: [],
}
for (const name of ['bounded-sevenzip.js', 'bounded-sevenzip.wasm']) {
  const bytes = await readFile(product + '/' + name)
  assert.equal(sha(bytes), receipt.artifacts.find(item => item.file === name)?.sha256,
    'Native artifact changed after compilation: ' + name)
  if (name.endsWith('.wasm')) manifest.memory.binary = inspectMemory(bytes)
  manifest.assets.push({ file: name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: sha(bytes) })
}
if (manifest.memory.binary.maximum !== 67108864 || manifest.memory.binary.initial !== 16777216 || manifest.memory.binary.flags !== 1)
  throw Error('Unapproved product WASM memory section')
await mkdir(stage + '/upstream', { recursive: true })
await mkdir(stage + '/tools/extended-archive/native', { recursive: true })
await mkdir(stage + '/public/vendor/sevenzip/licenses', { recursive: true })
for (const item of manifest.sourceArchives) {
  const bytes = await readFile(item.source)
  if (sha(bytes) !== item.sha256) throw Error('Source archive drift: ' + item.file)
  await copyFile(item.source, stage + '/upstream/' + item.file)
}
for (const name of ['prepare-runtime.mjs', 'build-runtime.mjs', 'compile.mjs', 'package-runtime.mjs', 'verify-runtime.mjs', 'apply-native-patches.mjs', ...nativePatches])
  await copyFile('tools/extended-archive/' + name, stage + '/tools/extended-archive/' + name)
await mkdir(product + '/patches', { recursive: true })
for (const name of nativePatches) await copyFile('tools/extended-archive/' + name, product + '/patches/' + name)
await copyFile('tools/extended-archive/native/bridge.cpp', stage + '/tools/extended-archive/native/bridge.cpp')
for (const name of ['README.md', 'THIRD_PARTY_NOTICES.md', 'CHANGES.md']) await copyFile(product + '/' + name, stage + '/public/vendor/sevenzip/' + name)
for (const name of await readdir(product + '/licenses')) await copyFile(product + '/licenses/' + name, stage + '/public/vendor/sevenzip/licenses/' + name)
// Supply the small adapter/loader source as well; never include profiles,
// diagnostics containing selected names, generated fixtures or test tools.
await mkdir(stage + '/adapter', { recursive: true })
try {
  for (const name of await readdir('src/archive/extended'))
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) await copyFile('src/archive/extended/' + name, stage + '/adapter/' + name)
} catch (error) { if (error.code !== 'ENOENT') throw error }
await writeFile(stage + '/README.txt', 'Corresponding source for the separate bounded SevenZip runtime. See public/vendor/sevenzip/README.md for build and replacement instructions. Original upstream archives are in upstream/. Tools are in tools/extended-archive/. Toolchain: exact Emscripten6.0.13 revision in manifest.json. No personal media or secrets are included.\n')
// The internal manifest describes native artifacts before the enclosing tar's
// hash exists. The published manifest adds the source-package hash afterwards.
await writeFile(stage + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n')
execFileSync('tar', ['-czf', resolve(product + '/corresponding-source.tar.gz'), '-C', resolve(stage), '.'], { windowsHide: true })
for (const name of ['corresponding-source.tar.gz', 'README.md', 'THIRD_PARTY_NOTICES.md', 'CHANGES.md', ...nativePatches.map(name => 'patches/' + name), ...await readdir(product + '/licenses').then(names => names.map(name => 'licenses/' + name))]) {
  const bytes = await readFile(product + '/' + name)
  manifest.assets.push({ file: name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: sha(bytes) })
}
await writeFile(product + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ assets: manifest.assets.length, memory: manifest.memory, wasm: manifest.assets[1] }, null, 2))
