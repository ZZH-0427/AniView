import { resolve, dirname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

export const nativePatches = ['system-emscripten.patch', 'rar4-filename.patch']
export const nativeBuildInputs = ['build-runtime.mjs', 'compile.mjs', 'apply-native-patches.mjs',
  'native/bridge.cpp', ...nativePatches]

export async function hashBuildInputs() {
  return Promise.all(nativeBuildInputs.map(async file => ({ file: 'tools/extended-archive/' + file,
    sha256: createHash('sha256').update(await readFile('tools/extended-archive/' + file)).digest('hex') })))
}

/** Apply only exact, reviewed patches; reverse-check permits a repeat build. */
export function applyNativePatches(source) {
  // Prevent parent-repository discovery so paths in the upstream patch stay
  // relative to this extracted source, including a standalone source rebuild.
  const options = { cwd: source, windowsHide: true, encoding: 'utf8',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(source) } }
  for (const name of nativePatches) {
    const patch = resolve('tools/extended-archive', name)
    const forward = spawnSync('git', ['apply', '--check', patch], options)
    if (forward.error) throw forward.error
    if (forward.status === 0) {
      const applied = spawnSync('git', ['apply', patch], options)
      if (applied.error) throw applied.error
      if (applied.status !== 0) throw Error('Native patch application failed: ' + name + '\n' + applied.stderr)
    } else {
      const reverse = spawnSync('git', ['apply', '--check', '--reverse', patch], options)
      if (reverse.status !== 0) throw Error('Native source does not match reviewed patch: ' + name + '\n' + forward.stderr)
    }
  }
}
