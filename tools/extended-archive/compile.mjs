import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const [file, out, commandFile = '.tools/m10c3/native-build/commands.json'] = process.argv.slice(2)
const c = JSON.parse(readFileSync(resolve(commandFile)))
const args = file === 'LINK' ? c.link : [...c.flags, '-I' + c.source, '-c', file, '-o', out]
const exe = c.sdk + '/upstream/emscripten/' + (file.endsWith('.c') ? 'emcc.exe' : 'em++.exe')
const p = spawnSync(exe, args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, EM_CONFIG: c.config, EMSDK_NODE: process.execPath } })
process.exitCode = p.status ?? 1
