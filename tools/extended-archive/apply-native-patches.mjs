import { resolve, dirname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

export const nativePatches = ['system-emscripten.patch', 'rar4-filename.patch',
  'rar3-inbuffer-2606-backport.patch']
export const securityBackport = {
  baseRevision: 'b88c6bc09339de32f7d18bbab900686b244f42ba',
  upstreamRevision: 'd3296e39e1f1f92c7b41c0c3848e65640428d42d',
  files: [
    { file: 'CPP/7zip/Compress/Rar3Decoder.cpp', sha256: 'fee600a4b359a12fc38a4a95f057d075a5f34a1eea9ba545915de9049d006d96' },
    { file: 'CPP/7zip/Compress/Rar3Decoder.h', sha256: '0fa7330795ff6a1faddcf9fbe53497d7c6fb57c3c4111e36856c46f08c8b6086' },
    { file: 'CPP/7zip/Common/InBuffer.cpp', sha256: '4264580db28cb2c563c9b416c119a8f82ddad95da09e6844f450b6a2a4451bbf' },
  ],
}
export const nativeBuildInputs = ['build-runtime.mjs', 'compile.mjs', 'apply-native-patches.mjs',
  'native/bridge.cpp', ...nativePatches]

export async function hashBuildInputs() {
  return Promise.all(nativeBuildInputs.map(async file => ({ file: 'tools/extended-archive/' + file,
    sha256: createHash('sha256').update(await readFile('tools/extended-archive/' + file)).digest('hex') })))
}

/** Apply only exact, reviewed patches; reverse-check permits a repeat build. */
export function applyNativePatches(source) {
  source = resolve(source)
  // Prevent parent-repository discovery so paths in the upstream patch stay
  // relative to this extracted source, including a standalone source rebuild.
  const options = { cwd: source, windowsHide: true, encoding: 'utf8',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(source) } }
  const records = []
  for (const name of nativePatches) {
    const patch = resolve('tools/extended-archive', name)
    const gitApply = ['-c', 'core.autocrlf=false', 'apply']
    const forward = spawnSync('git', [...gitApply, '--check', patch], options)
    if (forward.error) throw forward.error
    if (forward.status === 0) {
      const applied = spawnSync('git', [...gitApply, patch], options)
      if (applied.error) throw applied.error
      if (applied.status !== 0) throw Error('Native patch application failed: ' + name + '\n' + applied.stderr)
      records.push({ file: name, status: 'applied' })
    } else {
      const reverse = spawnSync('git', [...gitApply, '--check', '--reverse', patch], options)
      if (reverse.status !== 0) throw Error('Native source does not match reviewed patch: ' + name + '\n' + forward.stderr)
      records.push({ file: name, status: 'already-applied-reverse-checked' })
    }
  }
  // Require the complete paired implementation/header, not a mixed source tree
  // which merely contains a patch marker or happens to compile.
  for (const item of securityBackport.files) {
    const actual = createHash('sha256').update(readFileSync(resolve(source, item.file))).digest('hex')
    if (actual !== item.sha256) throw Error('Backport source differs from exact reviewed upstream blob: ' + item.file)
  }
  return records
}
