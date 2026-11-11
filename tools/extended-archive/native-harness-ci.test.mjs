import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessResults, inspectHarnessArtifacts, testGroups } from './native-harness-ci.mjs'

// Synthetic result-contract fixtures only: these tests do not execute native code
// and their pass does not establish the 20 native assertions passed.
function fixture() {
  const tests = testGroups.flatMap(group => group.names.map(name => ({ name, passed: true })))
  const summary = { summary: true, cases: 20, failed: 0 }
  return { report: { schema: 1, passed: true, status: 'passed', tests, summary,
    toolchain: { node: 'v24.22.1', emscripten: '6.0.13' } },
  rows: [...structuredClone(tests), structuredClone(summary)] }
}
const stdout = rows => rows.map(row => JSON.stringify(row)).join('\n') + '\n'

test('accepts exactly 20 unique expected executions and reports the 6/6/3/4/1 matrix', () => {
  const { report, rows } = fixture()
  const result = assessResults(report, stdout(rows))
  assert.equal(result.passed, true)
  assert.equal(result.executed, 20)
  assert.equal(result.passedCount, 20)
  assert.equal(result.failed, 0)
  assert.equal(result.skipped, 0)
  assert.deepEqual(result.groups.map(group => group.expected), [6, 6, 3, 4, 1])
})

test('does not accept a successful compilation or discovery without executed stdout', () => {
  const { report } = fixture()
  for (const output of [undefined, '', '\n']) {
    const result = assessResults(report, output)
    assert.equal(result.passed, false)
    assert.equal(result.executed, 0)
    assert.equal(result.skipped, 20)
  }
})

test('rejects every omitted assertion even with a matching report and optimistic summary', () => {
  for (let index = 0; index < 20; index++) {
    const { report, rows } = fixture()
    rows.splice(index, 1)
    report.tests.splice(index, 1)
    const result = assessResults(report, stdout(rows))
    assert.equal(result.passed, false)
    assert.equal(result.executed, 19)
    assert.equal(result.skipped, 1)
    assert(result.errors.some(error => error.startsWith('Missing expected tests:')))
  }
})

test('rejects duplicate and unexpected names even when 20 rows report passed', () => {
  for (const name of [testGroups[0].names[0], 'unreviewed-test']) {
    const { report, rows } = fixture()
    rows[1].name = name
    report.tests[1].name = name
    assert.equal(assessResults(report, stdout(rows)).passed, false)
  }
})

test('rejects failed, skipped and nonboolean outcomes without concealing them', () => {
  for (const change of [{ passed: false }, { skipped: true }, { passed: 'true' }]) {
    const { report, rows } = fixture()
    Object.assign(rows[0], change)
    Object.assign(report.tests[0], change)
    const result = assessResults(report, stdout(rows))
    assert.equal(result.passed, false)
    assert.equal(result.passedCount, 19)
    if (change.passed === false) assert.equal(result.failed, 1)
    if (change.skipped) assert.equal(result.skipped, 1)
    assert.equal(result.groups[0].status, 'FAIL')
  }
})

test('requires exactly one terminal summary and rejects contradictory counters', () => {
  const changes = [
    rows => rows.pop(),
    rows => rows.push({ summary: true, cases: 20, failed: 0 }),
    rows => rows.unshift(rows.pop()),
    rows => { rows.at(-1).cases = 19 },
    rows => { rows.at(-1).failed = 1 },
    rows => { rows.at(-1).executed = 0 },
    rows => { rows.at(-1).passed = 19 },
    rows => { rows.at(-1).skipped = 1 },
  ]
  for (const change of changes) {
    const { report, rows } = fixture()
    change(rows)
    assert.equal(assessResults(report, stdout(rows)).passed, false)
  }
})

test('rejects malformed JSON, extra stdout, missing report and mismatched report', () => {
  const { report, rows } = fixture()
  for (const output of [stdout(rows) + 'compiler succeeded\n', 'null\n', '{}\n', '[1]\n'])
    assert.equal(assessResults(report, output).passed, false)
  assert.equal(assessResults(undefined, stdout(rows)).passed, false)
  report.tests[0].passed = false
  assert.equal(assessResults(report, stdout(rows)).passed, false)
})

test('requires a completed passing report and the pinned compiler/runtime', () => {
  const changes = [
    report => { report.passed = false },
    report => { report.status = 'blocked' },
    report => { report.toolchain.emscripten = 'latest' },
    report => { report.toolchain.node = 'v24.0.0' },
  ]
  for (const change of changes) {
    const { report, rows } = fixture()
    change(report)
    assert.equal(assessResults(report, stdout(rows)).passed, false)
  }
})

test('summary still writes an explicit failure and machine result when evidence is absent', async () => {
  const work = await mkdtemp(join(tmpdir(), 'aniview-native-summary-'))
  const summary = join(work, 'summary.md')
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./native-harness-ci.mjs', import.meta.url)),
    'summary', '--source-commit', '0'.repeat(40), '--report', join(work, 'missing-report.json'),
    '--stdout', join(work, 'missing-stdout.jsonl')],
  { encoding: 'utf8', windowsHide: true, env: { ...process.env, GITHUB_STEP_SUMMARY: summary } })
  assert.equal(run.status, 1)
  const text = await readFile(summary, 'utf8')
  assert(text.includes('**Final: FAIL**'))
  assert(text.includes('executed: 0; passed: 0; failed: 0; skipped / not executed: 20'))
  assert(!text.includes('| PASS |'))
  const machine = run.stdout.split(/\r?\n/).find(line => line.startsWith('NATIVE_HARNESS_RESULT:'))
  assert.equal(JSON.parse(machine.slice('NATIVE_HARNESS_RESULT:'.length)).result, 'FAIL')
})

test('independent artifact trace checks both actual hashes and the bounded nonshared memory declaration', async () => {
  const work = await mkdtemp(join(tmpdir(), 'aniview-native-artifacts-'))
  const javascript = Buffer.from('// Synthetic trace contract fixture; never executed.\n')
  // Minimal WASM header + memory declaration only; this is not a native build.
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 5, 6, 1, 1, 128, 2, 128, 8])
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const report = { artifacts: [{ file: 'native-error-harness.cjs', sha256: hash(javascript) },
    { file: 'native-error-harness.wasm', sha256: hash(wasm) }] }
  await writeFile(join(work, 'native-error-harness.cjs'), javascript)
  await writeFile(join(work, 'native-error-harness.wasm'), wasm)
  const result = await inspectHarnessArtifacts(report, join(work, 'report.json'))
  assert.deepEqual(result.artifacts, report.artifacts)
  assert.deepEqual(result.memory, { count: 1, flags: 1, initial: 16777216, maximum: 67108864 })
  await assert.rejects(inspectHarnessArtifacts({ artifacts: report.artifacts.slice(0, 1) }, join(work, 'report.json')),
    /Missing or unexpected/)
  await writeFile(join(work, 'native-error-harness.cjs'), javascript + 'changed')
  await assert.rejects(inspectHarnessArtifacts(report, join(work, 'report.json')), /artifact hash mismatch/)
  await writeFile(join(work, 'native-error-harness.cjs'), javascript)
  wasm[11] = 3
  report.artifacts[1].sha256 = hash(wasm)
  await writeFile(join(work, 'native-error-harness.wasm'), wasm)
  await assert.rejects(inspectHarnessArtifacts(report, join(work, 'report.json')), /nonshared 16 MiB/)
})
