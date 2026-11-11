// Independent developer-only regression build. Never patches source or writes
// product outputs. No archive input, download, compressor or exploit is involved.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const options = process.argv.slice(2)
function option(name, fallback) {
  const index = options.indexOf(name)
  if (index === -1) return fallback
  const value = options[index + 1]
  if (!value || value.startsWith('--')) throw Error(`Missing value for ${name}`)
  return value
}
for (let index = 0; index < options.length; index += 2)
  if (!['--source', '--label'].includes(options[index])) throw Error(`Unknown option: ${options[index]}`)
const label = option('--label', 'patched-source')
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Label must use lowercase letters, numbers and hyphens')
const source = resolve(option('--source', process.env.SEVENZIP_SOURCE ?? '.tools/m10e-s2/source-lf'))
const work = resolve('.tools/m10e-s2/error-harness', label)
const sdk = resolve(process.env.EMSDK ?? '.tools/emsdk')
// Only the compiler launcher filename differs; the source and flags below are
// identical on Windows and Linux. Never invoke Windows executables via interop.
const compilerSuffix = process.platform === 'win32' ? '.exe' : ''
const compilerVersion = JSON.parse((await readFile(resolve(sdk, 'upstream/emscripten/emscripten-version.txt'), 'utf8')).trim())
if (process.version !== 'v24.22.1') throw Error('Harness requires pinned Node.js 24.22.1')
if (compilerVersion !== '6.0.13') throw Error('Harness requires pinned Emscripten 6.0.13')

// Exact official 26.06 blobs at d3296e39e1f1f92c7b41c0c3848e65640428d42d.
// Verify before executing: old throw() callbacks must never be exercised here.
const expected = {
  'CPP/7zip/Compress/Rar3Decoder.cpp': 'fee600a4b359a12fc38a4a95f057d075a5f34a1eea9ba545915de9049d006d96',
  'CPP/7zip/Compress/Rar3Decoder.h': '0fa7330795ff6a1faddcf9fbe53497d7c6fb57c3c4111e36856c46f08c8b6086',
  'CPP/7zip/Common/InBuffer.cpp': '4264580db28cb2c563c9b416c119a8f82ddad95da09e6844f450b6a2a4451bbf',
}
const sha256 = data => createHash('sha256').update(data).digest('hex')
const sourceFiles = []
for (const [file, hash] of Object.entries(expected)) {
  const actual = sha256(await readFile(resolve(source, file)))
  if (actual !== hash) throw Error(`Harness requires exact reviewed backport: ${file} (${actual})`)
  sourceFiles.push({ file, sha256: actual })
}
await mkdir(work, { recursive: true })
const config = resolve(work, 'emscripten.config')
const slash = value => value.replaceAll('\\', '/')
await writeFile(config, `LLVM_ROOT = '${slash(sdk)}/upstream/bin'\nBINARYEN_ROOT = '${slash(sdk)}/upstream'\nNODE_JS = '${slash(process.execPath)}'\n`)
const env = { ...process.env, EM_CONFIG: config, EMSDK_NODE: process.execPath }
const commands = []
function run(exe, args, name) {
  commands.push({ name, executable: exe, args })
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, env, timeout: 120000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error || result.status !== 0) throw Object.assign(
    Error(`${name} failed (${result.status ?? 'spawn'}): ${result.error?.message ?? ''}\n${output}`),
    { executionOutput: output, executionExitCode: result.status, executionStage: name })
  return output
}
const flags = ['-Oz', '-DZ7_ST', '-DZ7_EXTRACT_ONLY', '-D_FILE_OFFSET_BITS=64', '-fexceptions', '-I' + source]
const dependencies = [
  'CPP/7zip/Common/InBuffer.cpp',
  'CPP/7zip/Common/StreamUtils.cpp',
  'CPP/7zip/Compress/Rar3Vm.cpp',
  'C/Alloc.c',
  'C/Ppmd7.c',
  'C/Ppmd7aDec.c',
  'C/7zCrc.c',
  'C/7zCrcOpt.c',
  'C/CpuArch.c',
]
const report = {
  schema: 1,
  purpose: 'Controlled native stream error propagation; no archive or exploit execution',
  source,
  upstreamCommit: 'd3296e39e1f1f92c7b41c0c3848e65640428d42d',
  toolchain: { node: process.version, emscripten: compilerVersion },
  sourceFiles,
  compiledInputs: [],
  commands,
  limitations: [
    'Direct unit calls do not establish an admitted archive trigger or exploitability.',
    'Code HRESULT propagation uses a white-box status injection and a bounded LZ-selector/EOF stream; CodeReal is unchanged.',
    'The COM Read contract returns HRESULT; arbitrary exceptions across its noexcept boundary are not injected.',
    'Normal archive, encrypted input and successful solid decoding require separate product regressions.',
  ],
}
try {
  const objects = []
  for (const file of dependencies) {
    const input = resolve(source, file)
    const object = resolve(work, basename(file).replace(/\.(c|cpp)$/, '.o'))
    const compiler = resolve(sdk, 'upstream/emscripten', (file.endsWith('.c') ? 'emcc' : 'em++') + compilerSuffix)
    report.compiledInputs.push({ file, sha256: sha256(await readFile(input)) })
    run(compiler, [...flags, '-c', input, '-o', object], `compile ${file}`)
    objects.push(object)
  }
  const harness = resolve('tools/extended-archive/native-error-harness.cpp')
  const harnessObject = resolve(work, 'native-error-harness.o')
  const compiler = resolve(sdk, 'upstream/emscripten', 'em++' + compilerSuffix)
  report.compiledInputs.push({ file: slash(harness), sha256: sha256(await readFile(harness)) })
  run(compiler, [...flags, '-fno-access-control', '-c', harness, '-o', harnessObject], 'compile harness with actual Rar3Decoder.cpp')
  const executable = resolve(work, 'native-error-harness.cjs')
  run(compiler, [...objects, harnessObject, '-Oz', '-fexceptions', '-sENVIRONMENT=node', '-sEXIT_RUNTIME=1',
    '-sWASM_ASYNC_COMPILATION=0', '-sASSERTIONS=2', '-sSTACK_OVERFLOW_CHECK=2',
    '-sINITIAL_MEMORY=16777216', '-sMAXIMUM_MEMORY=67108864', '-sALLOW_MEMORY_GROWTH=1',
    '-sSTACK_SIZE=1048576', '-sABORTING_MALLOC=0', '-sDYNAMIC_EXECUTION=0', '-o', executable], 'link harness')
  const output = run(process.execPath, [executable], 'run controlled error harness')
  await writeFile(resolve(work, 'stdout.jsonl'), output)
  const rows = output.trim().split(/\r?\n/).map(line => JSON.parse(line))
  const summary = rows.find(row => row.summary === true)
  const tests = rows.filter(row => typeof row.name === 'string')
  report.tests = tests
  report.summary = summary
  if (!summary || summary.cases !== 20 || tests.length !== 20 || summary.failed !== 0 || tests.some(row => row.passed !== true))
    throw Error('Harness did not report all 20 passing results')
  report.artifacts = []
  for (const file of ['native-error-harness.cjs', 'native-error-harness.wasm'])
    report.artifacts.push({ file, sha256: sha256(await readFile(resolve(work, file))) })
  report.passed = true
  report.status = 'passed'
  console.log(`Native error harness: ${summary.cases} passed; report ${slash(resolve(work, 'report.json'))}`)
} catch (error) {
  // Retain real assertion output even when the independent native executable
  // exits nonzero. A compile/link failure must not masquerade as executed tests.
  if (error.executionStage === 'run controlled error harness') {
    await writeFile(resolve(work, 'stdout.jsonl'), error.executionOutput)
    const rows = error.executionOutput.trim().split(/\r?\n/).flatMap(line => {
      try { return [JSON.parse(line)] } catch { return [] }
    })
    report.tests = rows.filter(row => typeof row.name === 'string')
    report.summary = rows.find(row => row.summary === true) ?? null
    report.executionExitCode = error.executionExitCode
  }
  report.passed = false
  report.error = error instanceof Error ? error.message : String(error)
  report.status = report.error.includes('[WinError 4551]') ? 'blocked' : 'failed'
  if (report.status === 'blocked') {
    report.blocker = 'Windows application control denied an existing pinned tool; not a sandbox denial'
    if (report.error.includes('wasm-emscripten-finalize'))
      report.blockedExecutable = resolve(sdk, 'upstream/bin/wasm-emscripten-finalize.exe')
  }
  process.exitCode = 1
  console.error(report.error)
} finally {
  await writeFile(resolve(work, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
