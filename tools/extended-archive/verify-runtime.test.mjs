import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeBuildInputs, nativePatches, securityBackport } from './apply-native-patches.mjs'
import { verifyBuildReceipt, verifyRuntime } from './verify-runtime.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')

// Synthetic receipts test packaging contracts only. They do not claim to be
// compiler evidence or execute an archive/decoder.
function receiptFixture() {
  const inputs = nativeBuildInputs.map(file => ({ file: 'tools/extended-archive/' + file, sha256: sha(file) }))
  const units = ['Rar3Decoder', 'InBuffer', 'RarCodecsRegister', 'aniview_bridge',
    ...Array.from({ length: 185 }, (_, i) => 'unit' + i)].map(name => {
    const source = securityBackport.files.find(item => item.file.endsWith('/' + name + '.cpp'))
    return { name, file: source?.file ?? (name === 'aniview_bridge' ? 'tools/extended-archive/native/bridge.cpp' : 'CPP/' + name + '.cpp'),
      sourceSha256: source?.sha256 ?? (name === 'aniview_bridge' ? sha('native/bridge.cpp') : sha(name)), objectSha256: sha(name + '.o') }
  })
  return { schema: 2, emscripten: '6.0.13', node: 'v24.22.1', sourceRevision: securityBackport.baseRevision,
    securityBackport: structuredClone(securityBackport), inputs,
    artifacts: ['bounded-sevenzip.js', 'bounded-sevenzip.wasm'].map(file => ({ file, sha256: sha(file) })),
    patchApplications: nativePatches.map(file => ({ file, status: 'applied' })),
    compilationUnits: units, linkObjects: units.map(item => item.name + '.o'),
    flags: ['-Oz', '-DZ7_ST', '-DZ7_EXTRACT_ONLY', '-D_FILE_OFFSET_BITS=64', '-fexceptions'],
    memory: { initial: 16777216, maximum: 67108864, shared: false, growth: true } }
}

test('accepts the complete current receipt and reverse-verified patch repeats', () => {
  const receipt = receiptFixture()
  verifyBuildReceipt(receipt)
  receipt.patchApplications[0].status = 'already-applied-reverse-checked'
  verifyBuildReceipt(receipt)
})

test('rejects an old receipt even when its binary hashes are well formed', () => {
  const receipt = receiptFixture()
  receipt.schema = 1
  assert.throws(() => verifyBuildReceipt(receipt), /complete security-backport rebuild receipt/)
})

test('rejects missing, reordered and unverified native patches', () => {
  for (const mutate of [
    receipt => receipt.patchApplications.pop(),
    receipt => receipt.patchApplications.reverse(),
    receipt => { receipt.patchApplications[2].status = 'assumed-applied' },
  ]) {
    const receipt = receiptFixture()
    mutate(receipt)
    assert.throws(() => verifyBuildReceipt(receipt))
  }
})

test('rejects a partial rebuild and a link list that drops the RAR registry', () => {
  const receipt = receiptFixture()
  receipt.compilationUnits.pop()
  assert.throws(() => verifyBuildReceipt(receipt), /full approved native object set/)
  const missingLink = receiptFixture()
  missingLink.linkObjects = missingLink.linkObjects.filter(file => file !== 'RarCodecsRegister.o')
  assert.throws(() => verifyBuildReceipt(missingLink))
})

test('rejects stale compiled backport bytes and mismatched paired header identity', () => {
  const staleObject = receiptFixture()
  staleObject.compilationUnits.find(item => item.name === 'Rar3Decoder').sourceSha256 = sha('old Rar3Decoder')
  assert.throws(() => verifyBuildReceipt(staleObject), /Backported translation unit was not compiled/)
  const staleHeader = receiptFixture()
  staleHeader.securityBackport.files.find(item => item.file.endsWith('.h')).sha256 = sha('old header')
  assert.throws(() => verifyBuildReceipt(staleHeader))
})

test('rejects relaxed native memory and changes to the approved compiler flags', () => {
  const receipt = receiptFixture()
  receipt.memory.maximum *= 2
  assert.throws(() => verifyBuildReceipt(receipt))
  const changedFlags = receiptFixture()
  changedFlags.flags.push('-DZ7_EXTERNAL_CODECS')
  assert.throws(() => verifyBuildReceipt(changedFlags))
})

test('rejects stale asset hashes before accepting any downloaded source identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aniview-distribution-'))
  await writeFile(join(directory, 'bounded-sevenzip.js'), 'changed glue')
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schema: 2,
    assets: [{ file: 'bounded-sevenzip.js', bytes: 12, sha256: sha('original') }] }))
  await assert.rejects(verifyRuntime(directory), /Component hash drift/)
})

test('rejects duplicate or traversing manifest asset names before reading them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aniview-distribution-'))
  for (const assets of [
    [{ file: '../outside' }],
    [{ file: 'bounded-sevenzip.js' }, { file: 'bounded-sevenzip.js' }],
  ]) {
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schema: 2, assets }))
    await assert.rejects(verifyRuntime(directory), /Invalid distribution path|Duplicate distribution asset/)
  }
})
