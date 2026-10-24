// Release content checks run after Vite's clean build. No runtime code is added.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const nodeMajor = Number((await readFile('.nvmrc', 'utf8')).trim())
assert.equal(lock.version, pkg.version, 'Lockfile version must match package.json')
assert.equal(lock.packages[''].version, pkg.version, 'Lockfile root version must match')
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'Use one plain semantic version')
assert.equal(pkg.engines.node, `>=${nodeMajor} <${nodeMajor + 1}`, 'Node policy must agree with .nvmrc')

async function files(directory, prefix = '') {
  const result = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + item.name
    if (item.isDirectory()) result.push(...await files(directory + '/' + item.name, path + '/'))
    else result.push(path)
  }
  return result
}

const paths = await files('dist')
assert(!paths.some(path => /(^|\/)(validation|tests|fixtures|node_modules|\.tools)(\/|$)/.test(path)),
  'Development fixtures must not enter the production artifact')
for (const required of ['index.html', 'favicon.svg', 'third-party-notices.txt']) {
  assert(paths.includes(required) && (await stat('dist/' + required)).size > 0, `Missing release asset: ${required}`)
}
const html = await readFile('dist/index.html', 'utf8')
for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert(reference.startsWith('/AniView/'), `Wrong production base: ${reference}`)
  assert(paths.includes(reference.slice('/AniView/'.length)), `Missing HTML asset: ${reference}`)
}
assert(!html.includes('Currently in early development'), 'Use the public product description')

let commit = null, sourceDirty = null
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  sourceDirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== ''
} catch { /* Source archives without .git can build; they do not identify an RC. */ }
const identity = { version: pkg.version, commit, sourceDirty, projectLicense: pkg.license ?? null }
await writeFile('dist/release-candidate.json', JSON.stringify(identity, null, 2) + '\n')
const assets = []
for (const path of [...paths.filter(path => path !== 'release-candidate.json'), 'release-candidate.json']) {
  const content = await readFile('dist/' + path)
  assets.push({ path, bytes: content.length, gzipBytes: gzipSync(content).length })
}
const report = { ...identity, validationAssetCount: 0, assets }
await mkdir('.tools', { recursive: true })
await writeFile('.tools/release-build-report.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
