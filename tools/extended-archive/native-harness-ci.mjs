// One-time developer/CI helper. It never builds or replaces the product runtime.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { applyNativePatches, hashBuildInputs, nativePatches, securityBackport } from './apply-native-patches.mjs'
import { inspectMemory, verifyRuntime } from './verify-runtime.mjs'

const product = 'public/vendor/sevenzip'
const sourceRoot = '.tools/m10e-s2/ci-source'
const identityFile = '.tools/m10e-s2/ci-source-identity.json'
const frozenManifestSha256 = '31939431ab44698093db1a496f560874c179436d991dd4021d662e3619fa7528'
const harnessFile = 'tools/extended-archive/native-error-harness.cpp'
// Exact bytes at the reviewed Windows candidate, d31abd8dbc4ab9e8b0bcf032b760c719f478ab6f.
const harnessSha256 = '299df348faa5a3ff67a2ea509c583020c3b39477a344dc67095554b6bcfabbb9'
const sourceArchiveSha256 = 'd06cf3c4b4cb085f9a9a5c385b80e46d9ab47849860a4e2c00e1882409c7f830'
const supportingFiles = [
  'CPP/7zip/Common/InBuffer.cpp', 'CPP/7zip/Common/StreamUtils.cpp', 'CPP/7zip/Compress/Rar3Vm.cpp',
  'C/Alloc.c', 'C/Ppmd7.c', 'C/Ppmd7aDec.c', 'C/7zCrc.c', 'C/7zCrcOpt.c', 'C/CpuArch.c',
]
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const slash = value => value.replaceAll('\\', '/')

export const testGroups = [
  { name: 'RAR3 callback exception handling', names: ['read-byte', 'read-aligned-byte'].flatMap(callback =>
    [0, 1, 2].map(index => `${callback}-captures-hresult-${index}-and-stops-refill`)) },
  { name: 'Recovery / EOF handling', names: ['read-byte', 'read-aligned-byte'].flatMap(callback =>
    [0, 1, 2].map(index => `${callback}-init-recovery-and-normal-eof-${index}`)) },
  { name: 'Shared InBuffer behavior', names: [
    'shared-buffer-throws-original-hresult-after-buffered-input',
    'failed-input-read-byte-lookahead-read-bytes-skip-never-refill',
    'shared-buffer-init-recovery-normal-eof-and-processed-size',
  ] },
  { name: 'Decoder Code status propagation', names: [0, 1, 2, 3].map(index =>
    `code-clears-stale-status-and-propagates-captured-hresult-${index}`) },
  { name: 'Solid guard', names: ['failed-code-does-not-admit-solid-continuation'] },
]

/** Validate execution evidence, never infer a pass from compilation or discovery. */
export function assessResults(report, stdout) {
  const errors = []
  let rows = []
  try {
    assert.equal(typeof stdout, 'string', 'Harness stdout is missing')
    assert(stdout.trim(), 'Harness stdout is empty')
    rows = stdout.trim().split(/\r?\n/).map(line => JSON.parse(line))
    assert(rows.every(row => row && typeof row === 'object' && !Array.isArray(row)), 'Invalid stdout row')
  } catch (error) { errors.push(error.message) }
  const tests = rows.filter(row => typeof row?.name === 'string')
  const expectedNames = testGroups.flatMap(group => group.names)
  const expected = new Set(expectedNames)
  const names = tests.map(row => row.name)
  const summaries = rows.filter(row => row?.summary === true)
  const missing = expectedNames.filter(name => !names.includes(name))
  const failed = tests.filter(row => row.passed === false).length
  const passed = tests.filter(row => row.passed === true && row.skipped !== true).length
  const skipped = missing.length + tests.filter(row => row.skipped === true).length
  const check = (condition, message) => { if (!condition) errors.push(message) }
  check(rows.length === 21, 'Expected exactly 20 test rows and one terminal summary row')
  check(tests.length === 20, `Expected 20 executed tests; observed ${tests.length}`)
  check(new Set(names).size === 20, 'Expected 20 unique test names')
  check(names.every(name => expected.has(name)), 'Unexpected test name')
  check(missing.length === 0, `Missing expected tests: ${missing.join(', ') || 'none'}`)
  check(passed === 20 && failed === 0 && skipped === 0 && tests.every(row => row.passed === true),
    'Required executed=20, passed=20, failed=0, skipped=0')
  check(summaries.length === 1 && rows.at(-1) === summaries[0], 'Missing or nonterminal stdout summary')
  check(summaries[0]?.cases === 20 && summaries[0]?.failed === 0, 'Stdout summary is not 20/20 passing')
  for (const [field, value] of Object.entries({ executed: 20, passed: 20, failed: 0, skipped: 0 }))
    if (summaries[0] && Object.hasOwn(summaries[0], field))
      check(summaries[0][field] === value, `Contradictory stdout summary ${field}`)
  check(report?.schema === 1 && report?.passed === true && report?.status === 'passed', 'Harness report is not a completed pass')
  check(report?.toolchain?.node === 'v24.22.1' && report?.toolchain?.emscripten === '6.0.13', 'Harness toolchain is not pinned')
  try { assert.deepEqual(report?.tests, tests); assert.deepEqual(report?.summary, summaries[0]) }
  catch { errors.push('Harness report and stdout execution evidence differ') }
  return { passed: errors.length === 0, errors, tests, executed: tests.length, passedCount: passed, failed, skipped,
    groups: testGroups.map(group => {
      const groupRows = tests.filter(row => group.names.includes(row.name))
      const complete = groupRows.length === group.names.length && new Set(groupRows.map(row => row.name)).size === group.names.length
      const passed = groupRows.filter(row => row.passed === true && row.skipped !== true).length
      return { name: group.name, expected: group.names.length, executed: groupRows.length, passed,
        failed: groupRows.filter(row => row.passed === false).length,
        skipped: group.names.filter(name => !groupRows.some(row => row.name === name)).length + groupRows.filter(row => row.skipped === true).length,
        status: complete && passed === group.names.length ? 'PASS' : 'FAIL' }
    }) }
}

/** Read the independent runner outputs without loading or executing either one. */
export async function inspectHarnessArtifacts(report, reportFile) {
  const names = ['native-error-harness.cjs', 'native-error-harness.wasm']
  assert.deepEqual(report?.artifacts?.map(item => item.file), names, 'Missing or unexpected independent harness artifacts')
  const artifacts = []
  let memory
  for (const file of names) {
    const bytes = await readFile(resolve(dirname(reportFile), file))
    const actual = sha(bytes)
    assert.equal(actual, report.artifacts.find(item => item.file === file).sha256,
      'Independent harness artifact hash mismatch: ' + file)
    artifacts.push({ file, sha256: actual })
    if (file.endsWith('.wasm')) memory = inspectMemory(bytes)
  }
  assert.deepEqual(memory, { count: 1, flags: 1, initial: 16777216, maximum: 67108864 },
    'Independent harness WASM must retain nonshared 16 MiB initial / 64 MiB maximum memory')
  return { artifacts, memory }
}

async function prepare(sourceCommit) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/, 'A full source commit is required')
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(), sourceCommit,
    'Source commit differs from the checkout')
  const manifestBytes = await readFile(product + '/manifest.json')
  assert.equal(sha(manifestBytes), frozenManifestSha256, 'Frozen Windows manifest changed')
  const manifest = JSON.parse(manifestBytes)
  assert.equal(manifest.assets.length, 20, 'Expected exactly 20 frozen distribution assets')
  await verifyRuntime(product)
  assert.deepEqual(await hashBuildInputs(), manifest.buildInputs, 'Current native build inputs differ from the frozen Windows build')
  assert.deepEqual(nativePatches, ['system-emscripten.patch', 'rar4-filename.patch', 'rar3-inbuffer-2606-backport.patch'])
  assert.equal(sha(await readFile(harnessFile)), harnessSha256, 'C++ test content differs from d31abd8')
  const receipt = JSON.parse(await readFile(product + '/native-build-receipt.json', 'utf8'))
  const packageFile = resolve(product, 'corresponding-source.tar.gz')
  const upstream = execFileSync('tar', ['-xOf', packageFile, './upstream/7zip-b88c6bc.tar.gz'],
    { windowsHide: true, maxBuffer: 16777216 })
  assert.equal(sha(upstream), sourceArchiveSha256, 'The original pinned 26.05 source archive changed')
  await mkdir('.tools/m10e-s2', { recursive: true })
  // No existing source or evidence is overwritten; CI starts with a clean checkout.
  await mkdir(sourceRoot)
  const archive = resolve('.tools/m10e-s2/ci-upstream-7zip.tar.gz')
  await writeFile(archive, upstream, { flag: 'wx' })
  execFileSync('tar', ['-xf', archive, '-C', resolve(sourceRoot), '--strip-components=1'],
    { windowsHide: true, stdio: 'pipe' })
  const patchApplications = applyNativePatches(sourceRoot)
  assert(patchApplications.every(item => item.status === 'applied'), 'A fresh source tree must apply all three patches')
  const supportingSources = []
  for (const file of supportingFiles) {
    const matches = receipt.compilationUnits.filter(unit => unit.file === file)
    assert.equal(matches.length, 1, 'Missing or duplicate Windows source receipt: ' + file)
    const actual = sha(await readFile(resolve(sourceRoot, file)))
    assert.equal(actual, matches[0].sourceSha256, 'Supporting source differs from Windows build: ' + file)
    supportingSources.push({ file, sha256: actual })
  }
  const result = { schema: 1, sourceCommit, sourceRoot: slash(resolve(sourceRoot)),
    frozenManifestSha256, sourceArchiveSha256, harness: { file: harnessFile, sha256: harnessSha256 },
    buildInputs: manifest.buildInputs, patchApplications, securityBackport, supportingSources,
    frozenArtifacts: receipt.artifacts,
    scope: 'Independent Linux source-level harness; does not directly test the frozen Windows WASM binary' }
  await writeFile(identityFile, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(result, null, 2))
}

function markdown(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('|', '\\|').replaceAll('`', "'")
}

async function summarize(values) {
  const errors = []
  const read = async (path, json = false) => {
    try { assert(path, 'Required evidence path missing'); const bytes = await readFile(path, 'utf8'); return json ? JSON.parse(bytes) : bytes }
    catch (error) { errors.push(`Evidence unavailable: ${path ?? '(path missing)'} (${error.code ?? error.message})`); return undefined }
  }
  const report = await read(values.report, true)
  const stdout = await read(values.stdout)
  const identity = await read(identityFile, true)
  const compilerInfo = values['compiler-info'] ? await read(values['compiler-info']) : undefined
  const result = assessResults(report, stdout)
  errors.push(...result.errors)
  let independentArtifacts = []
  let independentMemory = null
  try {
    const inspected = await inspectHarnessArtifacts(report, values.report)
    independentArtifacts = inspected.artifacts
    independentMemory = inspected.memory
  } catch (error) { errors.push(error.message) }
  let frozenAssetsVerified = false
  try {
    // Re-read after execution: a prepare-time receipt alone cannot prove that
    // the frozen product and the current patch/build inputs stayed unchanged.
    const manifestBytes = await readFile(product + '/manifest.json')
    assert.equal(sha(manifestBytes), frozenManifestSha256, 'Frozen Windows manifest changed after preparation')
    const manifest = JSON.parse(manifestBytes)
    assert.equal(manifest.assets.length, 20, 'Expected exactly 20 frozen distribution assets')
    await verifyRuntime(product)
    const actualInputs = await hashBuildInputs()
    assert.deepEqual(actualInputs, manifest.buildInputs, 'Current build inputs or patches changed after preparation')
    assert.deepEqual(actualInputs, identity?.buildInputs, 'Current build inputs or patches differ from prepared identity')
    assert.equal(sha(await readFile(harnessFile)), harnessSha256, 'C++ test content changed after preparation')
    frozenAssetsVerified = true
  } catch (error) { errors.push(error.message) }
  try {
    assert.match(values['source-commit'] ?? '', /^[a-f0-9]{40}$/, 'A full source commit is required')
    assert.equal(identity?.schema, 1, 'Missing prepared source identity')
    assert.equal(identity?.sourceCommit, values['source-commit'], 'Prepared source commit differs from this run')
    assert.equal(identity?.frozenManifestSha256, frozenManifestSha256)
    assert.equal(identity?.sourceArchiveSha256, sourceArchiveSha256)
    assert.equal(identity?.harness?.sha256, harnessSha256)
    assert.deepEqual(identity?.securityBackport, securityBackport)
    assert.deepEqual(identity?.supportingSources?.map(item => item.file), supportingFiles)
    assert.deepEqual(identity?.patchApplications, nativePatches.map(file => ({ file, status: 'applied' })))
    assert.equal(report?.source, identity?.sourceRoot, 'Harness did not use the prepared source')
    assert.equal(report?.upstreamCommit, securityBackport.upstreamRevision)
    assert.deepEqual(report?.sourceFiles, securityBackport.files, 'Harness backport hashes changed')
    assert.deepEqual(report?.compiledInputs?.filter(item => supportingFiles.includes(item.file)), identity?.supportingSources,
      'Harness supporting sources differ from the verified Windows sources')
    assert.equal(report?.compiledInputs?.length, 10, 'Expected only nine supporting units and the unchanged C++ harness')
    const harnessInputs = report?.compiledInputs?.filter(item => slash(item.file).endsWith('/' + harnessFile))
    assert.equal(harnessInputs?.length, 1, 'Missing C++ harness compilation input')
    assert.equal(harnessInputs[0].sha256, harnessSha256, 'Compiled C++ harness content changed')
    assert(report?.commands?.some(command => command.name === 'run controlled error harness'), 'No harness execution command recorded')
  } catch (error) { errors.push(error.message) }
  const final = errors.length === 0 ? 'PASS' : 'FAIL'
  const lines = ['## M10E-S2 Native Error Harness', '',
    `Source commit: \`${markdown(values['source-commit'] ?? 'unavailable')}\``, '',
    `Emscripten: ${markdown(report?.toolchain?.emscripten ?? 'unavailable')} (required: 6.0.13)`,
    `Node: ${markdown(report?.toolchain?.node ?? 'unavailable')}`, '',
    `Frozen Windows distribution (20 assets), current build inputs and patches: ${frozenAssetsVerified ? 'VERIFIED' : 'FAILED'}.`, '',
    `Total expected: 20; executed: ${result.executed}; passed: ${result.passedCount}; failed: ${result.failed}; skipped / not executed: ${result.skipped}.`, '',
    '| Test group | Expected | Executed | Passed | Failed | Skipped / not executed | Result |',
    '|---|---:|---:|---:|---:|---:|---|',
    ...result.groups.map(group => `| ${group.name} | ${group.expected} | ${group.executed} | ${group.passed} | ${group.failed} | ${group.skipped} | ${group.status} |`), '',
    `**Final: ${final}**`, '',
    'Source identity links this independent Linux harness to the reviewed Windows build inputs. This does not directly test the frozen Windows WASM binary.', '']
  lines.push('Independent harness artifacts (runner local; these are not the frozen product):', '',
    '| Independent artifact | SHA-256 |', '|---|---|',
    ...independentArtifacts.map(item => `| ${item.file} | \`${item.sha256}\` |`), '',
    independentMemory ? `Independent WASM memory: ${independentMemory.initial} bytes initial / ${independentMemory.maximum} bytes maximum; nonshared (flags=${independentMemory.flags}, count=${independentMemory.count}).`
      : 'Independent harness artifact hashes / memory: unavailable or failed verification.', '')
  if (compilerInfo) lines.push('<details><summary>Compiler and runner tool versions</summary>', '', '<pre>', markdown(compilerInfo.trim()), '</pre>', '</details>', '')
  else lines.push('Compiler information: ' + markdown(JSON.stringify(report?.toolchain ?? 'unavailable')), '')
  if (errors.length) lines.push('Validation failures:', '', ...errors.map(error => '- ' + markdown(error)), '')
  const summary = lines.join('\n') + '\n'
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  console.log('NATIVE_HARNESS_RESULT:' + JSON.stringify({ sourceCommit: values['source-commit'] ?? null,
    total: 20, executed: result.executed, passed: result.passedCount, failed: result.failed, skipped: result.skipped,
    groups: result.groups, tests: result.tests, frozenAssetsVerified,
    independentArtifacts, independentMemory, result: final }))
  if (final !== 'PASS') process.exitCode = 1
}

async function main() {
  const command = process.argv[2]
  assert(['prepare', 'summary'].includes(command), 'Usage: native-harness-ci.mjs prepare|summary --source-commit <full SHA> [--report <JSON> --stdout <JSONL> --compiler-info <text>]')
  const { values } = parseArgs({ args: process.argv.slice(3), options: {
    'source-commit': { type: 'string' }, report: { type: 'string' }, stdout: { type: 'string' }, 'compiler-info': { type: 'string' },
  } })
  if (command === 'prepare') await prepare(values['source-commit'])
  else await summarize(values)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
