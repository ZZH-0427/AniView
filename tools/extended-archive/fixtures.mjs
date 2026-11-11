// Development-only public fixtures. Never imported by the application/build.
// RAR5 uses the official evaluation Rar.exe; RAR4 below is STORE metadata only,
// not a compression implementation. No decompressor source is used to create it.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

const root = resolve('.tools/m10c3'), out = join(root, 'fixtures'), input = join(root, 'fixture-input')
await mkdir(out, { recursive: true }); await mkdir(input, { recursive: true })
const seven = process.env.SEVENZIP_EXE ?? 'C:/Program Files/7-Zip/7z.exe'
const rar = process.env.RAR_EXE ?? join(root, 'rar-tool/Rar.exe')
const sha = value => createHash('sha256').update(value).digest('hex')
const crc = data => {
  let n = 0xffffffff
  for (const byte of data) { n ^= byte; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0) }
  return (n ^ 0xffffffff) >>> 0
}
const media = [
  ['01-animation.gif', 'tests/fixtures/gif/previous.gif'],
  ['02-animation.webp', 'tests/fixtures/zip/original-two-frame.webp'],
  ['03-animation.png', 'tests/fixtures/apng/full-infinite.png'],
  ['04-static.jpg', 'tests/fixtures/static/quadrants.jpg'],
  ['05-static.png', 'tests/fixtures/static/quadrants.png'],
  ['06-static.webp', 'tests/fixtures/static/quadrants.webp'],
]
const base = []
for (const [name, from] of media) {
  const b = await readFile(from); await writeFile(join(input, name), b)
  base.push({ path: name, bytes: b.length, sha256: sha(b) })
}
for (const name of ['目录 中文.txt', '日本語.txt', 'emoji-😀 = .txt']) {
  const b = Buffer.from('AniView original test content ' + name)
  await writeFile(join(input, name), b); base.push({ path: name, bytes: b.length, sha256: sha(b) })
}
const rows = []
async function record(name, expected, password = undefined, note = '') {
  const path = join(out, name), bytes = await readFile(path)
  for (const item of expected) {
    const actual = execFileSync(seven, ['e', '-so', '-p' + (password ?? '-'), path, '--', item.path], { windowsHide: true, maxBuffer: 16 * 1024 ** 2, stdio: ['ignore', 'pipe', 'pipe'] })
    if (sha(actual) !== item.sha256) throw Error('Independent native fixture verification failed: ' + name + '/' + item.path)
  }
  rows.push({ name, bytes: bytes.length, sha256: sha(bytes), expected, ...(password ? { publicTestPassword: password } : {}), note })
}
async function sevenArchive(name, args, expected = base, cwd = input) {
  execFileSync(seven, ['a', '-t7z', '-y', '-mmt=1', ...args, join(out, name), ...expected.map(x => x.path)], { cwd, windowsHide: true, stdio: 'ignore' })
  await record(name, expected, name.includes('password') || name.includes('headers') ? 'aniview-test' : undefined)
}
async function rarArchive(name, args, expected = base, cwd = input) {
  execFileSync(rar, ['a', '-y', '-idq', '-ep1', '-md4m', ...args, join(out, name), ...expected.map(x => x.path)], { cwd, windowsHide: true, stdio: 'ignore' })
  await record(name, expected, name.includes('password') || name.includes('headers') ? 'aniview-test' : undefined)
}
await sevenArchive('normal.7z', ['-ms=off', '-m0=LZMA2', '-md4m'])
await sevenArchive('solid.7z', ['-ms=on', '-m0=LZMA2', '-md4m'])
await sevenArchive('password.7z', ['-ms=on', '-md4m', '-paniview-test', '-mhe=off'])
await sevenArchive('headers.7z', ['-ms=on', '-md4m', '-paniview-test', '-mhe=on'])
for (const method of ['Copy', 'LZMA', 'LZMA2', 'Deflate', 'BZip2', 'PPMd'])
  await sevenArchive('codec-' + method.toLowerCase() + '.7z', ['-ms=on', '-m0=' + method, ...(method.startsWith('LZMA') ? ['-md4m'] : [])])
for (const method of ['BCJ', 'BCJ2', 'Delta'])
  await sevenArchive('filter-' + method.toLowerCase() + '.7z', ['-ms=on', '-m0=' + method, '-m1=LZMA2', '-m1d=4m'])
await rarArchive('normal-rar5.rar', ['-s-'])
await rarArchive('solid-rar5.rar', ['-s'])
await rarArchive('password-rar5.rar', ['-s', '-paniview-test'])
await rarArchive('headers-rar5.rar', ['-s', '-hpaniview-test'])

// Published RAR4 record layout, method 0x30 (STORE). ASCII names avoid inventing
// the legacy Unicode-name transform; real RAR4 Unicode/password samples remain
// the pinned libarchive fixtures from M10C2.
const header = (type, flags, body = Buffer.alloc(0)) => {
  const b = Buffer.alloc(7 + body.length)
  b[2] = type; b.writeUInt16LE(flags, 3); b.writeUInt16LE(b.length, 5); body.copy(b, 7)
  b.writeUInt16LE(crc(b.subarray(2)) & 0xffff, 0); return b
}
const rar4 = [Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0]), header(0x73, 0, Buffer.alloc(6))]
for (const row of base.slice(0, 6)) {
  const data = await readFile(join(input, row.path)), name = Buffer.from(row.path)
  const body = Buffer.alloc(25 + name.length)
  body.writeUInt32LE(data.length, 0); body.writeUInt32LE(data.length, 4); body[8] = 2
  body.writeUInt32LE(crc(data), 9); body[17] = 20; body[18] = 0x30
  body.writeUInt16LE(name.length, 19); body.writeUInt32LE(0x20, 21); name.copy(body, 25)
  rar4.push(header(0x74, 0x8000, body), data)
}
rar4.push(header(0x7b, 0x4000))
await writeFile(join(out, 'normal-rar4.rar'), Buffer.concat(rar4))
await record('normal-rar4.rar', base.slice(0, 6), undefined, 'Original media in minimal STORE-only RAR4 metadata, independently extracted by installed 7-Zip.')

// Keep hostile names out of command-line arguments and ordinary positive-fixture
// loops. This raw length-delimited RAR4 name checks the native BSTR boundary;
// rejection must occur before any truncated name is published to the UI.
const negativeRows = []
for (const [file, rawName] of [['nul-name-rar4.rar', 'safe\0hidden.gif'], ['control-name-rar4.rar', 'line\nbreak.gif']]) {
  const data = await readFile(join(input, base[0].path)), name = Buffer.from(rawName)
  const body = Buffer.alloc(25 + name.length)
  body.writeUInt32LE(data.length, 0); body.writeUInt32LE(data.length, 4); body[8] = 2
  body.writeUInt32LE(crc(data), 9); body[17] = 20; body[18] = 0x30
  body.writeUInt16LE(name.length, 19); body.writeUInt32LE(0x20, 21); name.copy(body, 25)
  const bytes = Buffer.concat([Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0]),
    header(0x73, 0, Buffer.alloc(6)), header(0x74, 0x8000, body), data, header(0x7b, 0x4000)])
  await writeFile(join(out, file), bytes)
  negativeRows.push({ name: file, bytes: bytes.length, sha256: sha(bytes), expectedError: 'ARCHIVE_UNSUPPORTED' })
}

// Existing pinned upstream binary/header/solid RAR4 fixtures retain their own
// original public password, not the common password of newly generated media.
const old = '.tools/m10c2/fixtures/'
const upstream = JSON.parse(await readFile(old + 'manifest.json', 'utf8'))
for (const row of upstream.filter(x => x.name.includes('rar4'))) {
  await copyFile(old + row.name, join(out, row.name)); await record(row.name, row.expected, 'password', row.url ?? 'Pinned libarchive regression fixture.')
}

function png(width, height) {
  const rows = Buffer.alloc(height * (1 + width * 4)); let seed = 0x67523041
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (1 + width * 4) + 1 + x * 4
    for (let c = 0; c < 4; c++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; rows[at + c] = seed & 255 }
  }
  const chunk = (type, b) => { const h = Buffer.alloc(8), t = Buffer.alloc(4); h.writeUInt32BE(b.length); h.write(type, 4); t.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), b]))); return Buffer.concat([h, b, t]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 0 })), chunk('IEND', Buffer.alloc(0))])
}
const stress = join(input, 'bounded-medium'); await mkdir(stress, { recursive: true })
const noisy = png(1000, 1000)
await writeFile(join(stress, '01-large-static.png'), noisy)
const expected = [{ path: '01-large-static.png', bytes: noisy.length, sha256: sha(noisy) }]
for (let k = 0; k < 2; k++) {
  const b = Buffer.alloc(3 * 1024 ** 2); let seed = 0x67523041 + k
  for (let i = 0; i < b.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; b[i] = seed & 255 }
  const name = 'padding-' + k + '.bin'; await writeFile(join(stress, name), b); expected.push({ path: name, bytes: b.length, sha256: sha(b) })
}
await sevenArchive('medium-solid.7z', ['-ms=on', '-m0=LZMA2', '-md4m', '-mx=1'], expected, stress)
await rarArchive('medium-solid-rar5.rar', ['-s', '-m1'], expected, stress)

await writeFile(join(out, 'manifest.json'), JSON.stringify({ schema: 1, publicTestOnly: true, generatedBy: { sevenzip: 'installed 26.03', rar: 'RARLAB RAR 7.23 trial (fixture generation only, not distributed)' }, rows, negativeRows }, null, 2) + '\n')
await writeFile(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>AniView public archive fixtures</title><h1>Public archive fixtures</h1><p>Generated media passwords: aniview-test. Historical test_read_format_rar4 fixtures: password. Download then open in AniView. No personal files are used.</p><ul>' + rows.map(x => '<li><a href="' + encodeURIComponent(x.name) + '">' + x.name + '</a> (' + x.bytes + ' bytes)</li>').join('') + '</ul>')
console.log(JSON.stringify(rows.map(x => ({ name: x.name, bytes: x.bytes })), null, 2))
