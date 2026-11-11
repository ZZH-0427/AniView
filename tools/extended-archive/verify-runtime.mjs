import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  for (const item of manifest.assets) {
    const bytes = await readFile(directory + '/' + item.file)
    assert.equal(bytes.length, item.bytes, 'Component size drift: ' + item.file)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, 'Component hash drift: ' + item.file)
  }
  const wasm = await readFile(directory + '/bounded-sevenzip.wasm'), glue = await readFile(directory + '/bounded-sevenzip.js', 'utf8')
  const memory = inspectMemory(wasm)
  assert.deepEqual(memory, { count: 1, flags: 1, initial: 16777216, maximum: 67108864 }, 'Product component must retain its nonshared 64 MiB compiled maximum')
  assert(!glue.includes('av_probe'), 'Native allocation probes must not be exposed in product glue')
  assert(!/\beval\s*\(|new\s+Function\s*\(/.test(glue), 'Product component must not require script unsafe-eval')
  for (const name of ['THIRD_PARTY_NOTICES.md', 'README.md', 'CHANGES.md', 'corresponding-source.tar.gz',
    'licenses/7zip-License.txt', 'licenses/LGPL-2.1.txt', 'licenses/unRarLicense.txt',
    'licenses/sevenzip-wasm-LICENSE.txt', 'licenses/emscripten-LICENSE.txt',
    'licenses/compiler-rt-LICENSE.txt', 'licenses/libcxx-LICENSE.txt', 'licenses/libcxxabi-LICENSE.txt',
    'licenses/libunwind-LICENSE.txt', 'licenses/musl-COPYRIGHT.txt']) {
    assert((await readFile(directory + '/' + name)).length > 0, 'Missing distribution material: ' + name)
  }
  assert.equal(manifest.engineRevision, 'b88c6bc09339de32f7d18bbab900686b244f42ba')
  assert.equal(manifest.abi.extractArguments, 3)
  assert.equal(manifest.abi.probeCommands, false)
  assert.equal(manifest.emscripten, '6.0.13')
  assert.equal(manifest.nativeOutputMaximum, 4194304)
  assert.deepEqual(manifest.patches.map(item => item.file),
    ['patches/system-emscripten.patch', 'patches/rar4-filename.patch'])
  for (const item of manifest.patches) {
    const bytes = await readFile(directory + '/' + item.file)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, 'Native patch drift: ' + item.file)
    const input = manifest.buildInputs.find(input => input.file === 'tools/extended-archive/' + item.file.slice('patches/'.length))
    assert.equal(input?.sha256, item.sha256, 'Native patch/build provenance mismatch')
    assert(manifest.assets.some(asset => asset.file === item.file && asset.sha256 === item.sha256))
  }
  return { memory, files: manifest.assets.length, wasmSha256: createHash('sha256').update(wasm).digest('hex') }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await verifyRuntime(process.argv[2]), null, 2))
