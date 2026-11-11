// Explicit developer packaging step, not an npm install hook or runtime fetch.
import { mkdir, mkdtemp, readFile, readdir, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { distributionFiles, engineDescription, inspectMemory, pinnedSourceArchives, verifyBuildReceipt, verifyRuntime } from './verify-runtime.mjs'
import { nativePatches, hashBuildInputs, securityBackport } from './apply-native-patches.mjs'
import assert from 'node:assert/strict'

const { values } = parseArgs({ options: { build: { type: 'string' }, stage: { type: 'string' }, product: { type: 'string' } } })
const product = values.product ?? 'public/vendor/sevenzip'
const work = values.build ?? process.env.SEVENZIP_WORK ?? '.tools/m10c3/native-build'
const stageRoot = values.stage ?? '.tools/m10e-s2/corresponding-source'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const receiptBytes = await readFile(work + '/build-receipt.json')
const receipt = JSON.parse(receiptBytes.toString('utf8'))
verifyBuildReceipt(receipt)
assert.deepEqual(receipt.inputs, await hashBuildInputs(), 'Native build inputs changed after compilation')
const manifest = {
  schema: 2,
  engine: engineDescription, engineRevision: securityBackport.baseRevision,
  securityBackport,
  referencePackage: 'sevenzip-wasm 26.5.0', wrapperRevision: '7b53d4abf78da9eb06f9447730ae31eaf9acd7c3',
  emscripten: receipt.emscripten, emscriptenRevision: 'e13ee988ce3d87a738dd8f3661d02223308c412a', node: receipt.node,
  abi: { extractArguments: 3, probeCommands: false, formatHandlers: ['RAR4', 'RAR5', '7z'], writesArchives: false },
  memory: { initial: 16777216, maximum: 67108864, shared: false, growth: true },
  nativeOutputMaximum: 4194304,
  buildInputs: receipt.inputs,
  distributionInputs: await Promise.all(distributionFiles.map(async file => ({ file: 'tools/extended-archive/' + file,
    sha256: sha(await readFile('tools/extended-archive/' + file)) }))),
  patches: nativePatches.map(name => ({ file: 'patches/' + name,
    sha256: receipt.inputs.find(input => input.file === 'tools/extended-archive/' + name).sha256 })),
  sourceArchives: pinnedSourceArchives,
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
// A fresh allowlisted stage prevents stale files from a previous source package
// or unrelated local diagnostics from entering the downloadable archive.
await mkdir(stageRoot, { recursive: true })
const stage = await mkdtemp(resolve(stageRoot) + '/package-')
await mkdir(stage + '/upstream', { recursive: true })
await mkdir(stage + '/tools/extended-archive/native', { recursive: true })
await mkdir(stage + '/tools/extended-archive/distribution', { recursive: true })
await mkdir(stage + '/public/vendor/sevenzip/licenses', { recursive: true })
for (const item of manifest.sourceArchives) {
  const bytes = await readFile(item.source)
  if (sha(bytes) !== item.sha256) throw Error('Source archive drift: ' + item.file)
  await copyFile(item.source, stage + '/upstream/' + item.file)
}
for (const item of [...manifest.buildInputs, ...manifest.distributionInputs])
  await copyFile(item.file, stage + '/' + item.file)
await mkdir(product + '/patches', { recursive: true })
for (const name of nativePatches) await copyFile('tools/extended-archive/' + name, product + '/patches/' + name)
for (const name of ['README.md', 'THIRD_PARTY_NOTICES.md', 'CHANGES.md']) {
  await copyFile('tools/extended-archive/distribution/' + name, product + '/' + name)
  await copyFile(product + '/' + name, stage + '/public/vendor/sevenzip/' + name)
}
await writeFile(product + '/native-build-receipt.json', receiptBytes)
await writeFile(stage + '/native-build-receipt.json', receiptBytes)
for (const name of await readdir(product + '/licenses')) await copyFile(product + '/licenses/' + name, stage + '/public/vendor/sevenzip/licenses/' + name)
// Supply the small adapter/loader source as well; never include profiles,
// diagnostics containing selected names, generated fixtures or test tools.
await mkdir(stage + '/adapter', { recursive: true })
try {
  for (const name of await readdir('src/archive/extended'))
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) await copyFile('src/archive/extended/' + name, stage + '/adapter/' + name)
} catch (error) { if (error.code !== 'ENOENT') throw error }
await writeFile(stage + '/README.txt', 'Corresponding source for ' + engineDescription + '. See public/vendor/sevenzip/README.md for build and replacement instructions. Original 26.05 engine/wrapper archives are in upstream/; all three ordered patches and the complete native build receipt accompany them. Tools and notice templates are in tools/extended-archive/. Toolchain: exact Emscripten 6.0.13 revision in manifest.json. No personal media or secrets are included.\n')
// The internal manifest describes native artifacts before the enclosing tar's
// hash exists. The published manifest adds the source-package hash afterwards.
await writeFile(stage + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n')
execFileSync('tar', ['-czf', resolve(product + '/corresponding-source.tar.gz'), '-C', resolve(stage), '.'], { windowsHide: true })
for (const name of ['corresponding-source.tar.gz', 'README.md', 'THIRD_PARTY_NOTICES.md', 'CHANGES.md', 'native-build-receipt.json', ...nativePatches.map(name => 'patches/' + name), ...await readdir(product + '/licenses').then(names => names.map(name => 'licenses/' + name))]) {
  const bytes = await readFile(product + '/' + name)
  manifest.assets.push({ file: name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: sha(bytes) })
}
await writeFile(product + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ ...await verifyRuntime(product), engine: manifest.engine, buildReceipt: work + '/build-receipt.json', wasm: manifest.assets[1] }, null, 2))
