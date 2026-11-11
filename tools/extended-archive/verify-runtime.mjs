import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { nativeBuildInputs, nativePatches, securityBackport } from './apply-native-patches.mjs'

export const engineDescription = '7-Zip 26.05 + selected 26.06 Rar3/InBuffer security/error-handling backport + AniView RAR4 filename patch'
export const distributionFiles = ['prepare-runtime.mjs', 'package-runtime.mjs', 'verify-runtime.mjs', 'README.md',
  'distribution/README.md', 'distribution/THIRD_PARTY_NOTICES.md', 'distribution/CHANGES.md']
export const pinnedSourceArchives = [
  { file: '7zip-b88c6bc.tar.gz', source: '.tools/m10c3/7zip.tar.gz', sha256: 'd06cf3c4b4cb085f9a9a5c385b80e46d9ab47849860a4e2c00e1882409c7f830' },
  { file: 'wrapper-7b53d4a.tar.gz', source: '.tools/m10c3/wrapper.tar.gz', sha256: '6b0caee34dca8d9dffcc53ab26e9c95a8c6ae5ff5f15f309ad8b73f009487ba8' },
]
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const memoryPolicy = { initial: 16777216, maximum: 67108864, shared: false, growth: true }
const binaryFiles = ['bounded-sevenzip.js', 'bounded-sevenzip.wasm']
const patchFiles = ['system-emscripten.patch', 'rar4-filename.patch', 'rar3-inbuffer-2606-backport.patch']

/** Build provenance is checked against the current receipt, never an old binary hash. */
export function verifyBuildReceipt(receipt) {
  assert.equal(receipt.schema, 2, 'A complete security-backport rebuild receipt is required')
  assert.equal(receipt.emscripten, '6.0.13')
  assert.equal(receipt.node, 'v24.22.1')
  assert.equal(receipt.sourceRevision, securityBackport.baseRevision)
  assert.deepEqual(receipt.securityBackport, securityBackport)
  assert.deepEqual(receipt.memory, memoryPolicy)
  assert.deepEqual(nativePatches, patchFiles, 'Unreviewed native patch order')
  assert.deepEqual(receipt.inputs.map(item => item.file), nativeBuildInputs.map(file => 'tools/extended-archive/' + file))
  assert.deepEqual(receipt.artifacts.map(item => item.file), binaryFiles)
  assert.deepEqual(receipt.patchApplications.map(item => item.file), patchFiles)
  for (const item of receipt.patchApplications)
    assert(['applied', 'already-applied-reverse-checked'].includes(item.status), 'Unverified native patch: ' + item.file)
  for (const item of [...receipt.inputs, ...receipt.artifacts]) assert.match(item.sha256, /^[a-f0-9]{64}$/)
  assert.equal(receipt.compilationUnits.length, 189, 'The full approved native object set must be rebuilt')
  assert.equal(new Set(receipt.compilationUnits.map(item => item.name)).size, 189, 'Duplicate native compilation unit')
  assert.deepEqual(receipt.linkObjects, receipt.compilationUnits.map(item => item.name + '.o'))
  assert.deepEqual(receipt.flags, ['-Oz', '-DZ7_ST', '-DZ7_EXTRACT_ONLY', '-D_FILE_OFFSET_BITS=64', '-fexceptions'])
  for (const item of receipt.compilationUnits) {
    assert.match(item.sourceSha256, /^[a-f0-9]{64}$/)
    assert.match(item.objectSha256, /^[a-f0-9]{64}$/)
  }
  for (const name of ['Rar3Decoder', 'InBuffer', 'RarCodecsRegister', 'aniview_bridge'])
    assert(receipt.compilationUnits.some(item => item.name === name), 'Missing rebuilt native unit: ' + name)
  for (const item of securityBackport.files.filter(item => item.file.endsWith('.cpp')))
    assert.equal(receipt.compilationUnits.find(unit => unit.file === item.file)?.sourceSha256, item.sha256,
      'Backported translation unit was not compiled: ' + item.file)
  assert.equal(receipt.compilationUnits.find(item => item.name === 'aniview_bridge').sourceSha256,
    receipt.inputs.find(item => item.file === 'tools/extended-archive/native/bridge.cpp').sha256)
}

export function inspectMemory(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '0061736d01000000', 'Expected wasm32 binary')
  let at = 8
  const leb = () => {
    let value = 0, shift = 0, next
    do { assert(at < bytes.length && shift < 35, 'Malformed WASM length'); next = bytes[at++]; value += (next & 127) * 2 ** shift; shift += 7 } while (next & 128)
    return value
  }
  while (at < bytes.length) {
    const type = bytes[at++], length = leb(), end = at + length
    assert(end <= bytes.length, 'Truncated WASM section')
    if (type === 5) {
      const count = leb(), flags = leb(), initial = leb(), maximum = flags & 1 ? leb() : null
      assert.equal(at, end, 'Unexpected extra memory declarations')
      return { count, flags, initial: initial * 65536, maximum: maximum === null ? null : maximum * 65536 }
    }
    at = end
  }
  throw Error('No defined linear memory')
}

export async function verifyRuntime(directory = 'public/vendor/sevenzip') {
  const manifest = JSON.parse(await readFile(directory + '/manifest.json', 'utf8'))
  assert.equal(manifest.schema, 2)
  assert.equal(new Set(manifest.assets.map(item => item.file)).size, manifest.assets.length, 'Duplicate distribution asset')
  for (const item of manifest.assets) {
    assert(!item.file.startsWith('/') && !item.file.includes('\\') && !item.file.split('/').some(part => part === '..' || part === ''), 'Invalid distribution path')
    const bytes = await readFile(directory + '/' + item.file)
    assert.equal(bytes.length, item.bytes, 'Component size drift: ' + item.file)
    assert.equal(sha(bytes), item.sha256, 'Component hash drift: ' + item.file)
  }
  const wasm = await readFile(directory + '/bounded-sevenzip.wasm'), glue = await readFile(directory + '/bounded-sevenzip.js', 'utf8')
  const memory = inspectMemory(wasm)
  assert.deepEqual(memory, { count: 1, flags: 1, initial: 16777216, maximum: 67108864 }, 'Product component must retain its nonshared 64 MiB compiled maximum')
  assert(!glue.includes('av_probe'), 'Native allocation probes must not be exposed in product glue')
  assert(!/\beval\s*\(|new\s+Function\s*\(/.test(glue), 'Product component must not require script unsafe-eval')
  for (const name of [...binaryFiles, 'THIRD_PARTY_NOTICES.md', 'README.md', 'CHANGES.md', 'corresponding-source.tar.gz', 'native-build-receipt.json',
    'licenses/7zip-License.txt', 'licenses/LGPL-2.1.txt', 'licenses/unRarLicense.txt',
    'licenses/sevenzip-wasm-LICENSE.txt', 'licenses/emscripten-LICENSE.txt',
    'licenses/compiler-rt-LICENSE.txt', 'licenses/libcxx-LICENSE.txt', 'licenses/libcxxabi-LICENSE.txt',
    'licenses/libunwind-LICENSE.txt', 'licenses/musl-COPYRIGHT.txt']) {
    assert(manifest.assets.some(item => item.file === name), 'Untracked distribution material: ' + name)
    assert((await readFile(directory + '/' + name)).length > 0, 'Missing distribution material: ' + name)
  }
  assert.equal(manifest.engine, engineDescription)
  assert.equal(manifest.engineRevision, securityBackport.baseRevision)
  assert.deepEqual(manifest.securityBackport, securityBackport)
  assert.equal(manifest.abi.extractArguments, 3)
  assert.equal(manifest.abi.probeCommands, false)
  assert.deepEqual(manifest.abi.formatHandlers, ['RAR4', 'RAR5', '7z'])
  assert.equal(manifest.abi.writesArchives, false)
  assert.equal(manifest.emscripten, '6.0.13')
  assert.equal(manifest.nativeOutputMaximum, 4194304)
  assert.deepEqual(manifest.memory, { ...memoryPolicy, binary: memory })
  assert.deepEqual(manifest.sourceArchives, pinnedSourceArchives)
  assert.deepEqual(manifest.distributionInputs.map(item => item.file), distributionFiles.map(file => 'tools/extended-archive/' + file))
  assert.deepEqual(manifest.patches.map(item => item.file),
    patchFiles.map(name => 'patches/' + name))
  for (const item of manifest.patches) {
    const bytes = await readFile(directory + '/' + item.file)
    assert.equal(sha(bytes), item.sha256, 'Native patch drift: ' + item.file)
    const input = manifest.buildInputs.find(input => input.file === 'tools/extended-archive/' + item.file.slice('patches/'.length))
    assert.equal(input?.sha256, item.sha256, 'Native patch/build provenance mismatch')
    assert(manifest.assets.some(asset => asset.file === item.file && asset.sha256 === item.sha256))
  }
  const receipt = JSON.parse(await readFile(directory + '/native-build-receipt.json', 'utf8'))
  verifyBuildReceipt(receipt)
  assert.equal(manifest.node, receipt.node)
  assert.deepEqual(manifest.buildInputs, receipt.inputs)
  for (const item of receipt.artifacts)
    assert.equal(manifest.assets.find(asset => asset.file === item.file)?.sha256, item.sha256, 'Manifest/native build receipt mismatch: ' + item.file)
  // Validate the actual downloadable source, including the receipt, recipe and
  // original archives; checking only the outer tar hash misses a mismatched package.
  const sourceFile = resolve(directory, 'corresponding-source.tar.gz')
  const sourceMember = file => execFileSync('tar', ['-xOf', sourceFile, './' + file], { windowsHide: true, maxBuffer: 16777216 })
  const sourceManifest = JSON.parse(sourceMember('manifest.json').toString('utf8'))
  assert.deepEqual(sourceManifest, { ...manifest, assets: manifest.assets.filter(item => binaryFiles.includes(item.file)) }, 'Corresponding-source manifest mismatch')
  assert.deepEqual(JSON.parse(sourceMember('native-build-receipt.json').toString('utf8')), receipt)
  for (const item of [...manifest.buildInputs, ...manifest.distributionInputs])
    assert.equal(sha(sourceMember(item.file)), item.sha256, 'Corresponding-source build input drift: ' + item.file)
  for (const item of manifest.sourceArchives)
    assert.equal(sha(sourceMember('upstream/' + item.file)), item.sha256, 'Corresponding-source upstream archive drift: ' + item.file)
  for (const item of manifest.assets.filter(item => /^(?:licenses\/|(?:README|CHANGES|THIRD_PARTY_NOTICES)\.md$)/.test(item.file)))
    assert.equal(sha(sourceMember('public/vendor/sevenzip/' + item.file)), item.sha256, 'Corresponding-source notice drift: ' + item.file)
  return { memory, files: manifest.assets.length, wasmSha256: sha(wasm) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await verifyRuntime(process.argv[2]), null, 2))
