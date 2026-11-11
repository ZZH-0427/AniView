// Original public STORE-only RAR4 regression records. No archive-writing API is
// shipped by AniView. This constructs filename metadata, not a compression codec.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { crc32 } from 'node:zlib'
import { fileURLToPath } from 'node:url'

export const filenameFixtureRoot = resolve('.tools/m10c3/nul-fix/filename-fixtures')
const sha = value => createHash('sha256').update(value).digest('hex')
// Keep construction and validation CRC implementations independent.
const fixtureCrc = data => {
  let result = 0xffffffff
  for (const byte of data) {
    result ^= byte
    for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0)
  }
  return (result ^ 0xffffffff) >>> 0
}
const signature = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0])
const header = (type, flags, body = Buffer.alloc(0)) => {
  const bytes = Buffer.alloc(7 + body.length)
  bytes[2] = type; bytes.writeUInt16LE(flags, 3); bytes.writeUInt16LE(bytes.length, 5); body.copy(bytes, 7)
  bytes.writeUInt16LE(fixtureCrc(bytes.subarray(2)) & 0xffff)
  return bytes
}
function store(rawName, unicode, data) {
  assert(rawName.length <= 65535)
  const body = Buffer.alloc(25 + rawName.length)
  body.writeUInt32LE(data.length, 0); body.writeUInt32LE(data.length, 4); body[8] = 2
  body.writeUInt32LE(fixtureCrc(data), 9); body[17] = 20; body[18] = 0x30
  body.writeUInt16LE(rawName.length, 19); body.writeUInt32LE(0x20, 21); rawName.copy(body, 25)
  return Buffer.concat([signature, header(0x73, 0, Buffer.alloc(6)), header(0x74, 0x8000 | (unicode ? 0x0200 : 0), body), data, header(0x7b, 0x4000)])
}

/** Independently validate framing, declared NAME_SIZE, every header CRC and data CRC. */
export function inspectFilenameFixture(bytes) {
  assert(bytes.subarray(0, 7).equals(signature), 'RAR4 marker')
  let at = 7, file
  const headers = []
  while (at < bytes.length) {
    assert(at + 7 <= bytes.length, 'Truncated header')
    const size = bytes.readUInt16LE(at + 5), type = bytes[at + 2], flags = bytes.readUInt16LE(at + 3)
    assert(size >= 7 && at + size <= bytes.length, 'Declared HEAD_SIZE')
    assert.equal(bytes.readUInt16LE(at), crc32(bytes.subarray(at + 2, at + size)) & 0xffff, 'Header CRC')
    headers.push({ offset: at, type, flags, size })
    if (type === 0x74) {
      assert.equal(file, undefined, 'Exactly one file record')
      assert(size >= 32)
      const packed = bytes.readUInt32LE(at + 7), unpacked = bytes.readUInt32LE(at + 11)
      const nameSize = bytes.readUInt16LE(at + 26), rawName = bytes.subarray(at + 32, at + size)
      assert.equal(rawName.length, nameSize, 'NAME_SIZE spans the complete raw field')
      assert.equal(size, 32 + nameSize); assert.equal(packed, unpacked)
      assert.equal(bytes[at + 25], 0x30, 'STORE method')
      assert(at + size + packed <= bytes.length)
      const data = bytes.subarray(at + size, at + size + packed)
      assert.equal(bytes.readUInt32LE(at + 16), crc32(data), 'Stored file CRC')
      file = { headerOffset: at, headerSize: size, declaredNameSize: nameSize,
        rawNameHex: rawName.toString('hex'), unicodeFlag: !!(flags & 0x0200),
        dataBytes: data.length, dataSha256: sha(data), allHeaderCrcsValid: true, fileCrcValid: true }
      at += size + packed
    } else at += size
  }
  assert.equal(at, bytes.length); assert(file)
  assert.deepEqual(headers.map(h => h.type), [0x73, 0x74, 0x7b])
  return { ...file, headers }
}

// Fixed metadata operands exercise all four RAR4 Unicode filename modes. These
// original test records intentionally include legal zero bytes after the name
// separator; a blanket byte-zero rejection would break valid fixtures.
const literal = (text, mode = 2) => Array.from({ length: text.length }, (_, i) => ({ mode, value: text.charCodeAt(i) }))
const encoded = (high, actions) => {
  const bytes = [high]
  for (let start = 0; start < actions.length; start += 4) {
    const group = actions.slice(start, start + 4)
    bytes.push(group.reduce((flags, action, i) => flags | (action.mode << (6 - 2 * i)), 0))
    for (const action of group) {
      if (action.mode === 2) bytes.push(action.value & 255, action.value >>> 8)
      else if (action.mode === 3) {
        assert(action.count >= 2 && action.count <= 129)
        bytes.push(action.count - 2 | (action.correction === undefined ? 0 : 0x80))
        if (action.correction !== undefined) bytes.push(action.correction)
      } else bytes.push(action.value)
    }
  }
  return Buffer.from(bytes)
}
const unicodeField = (legacy, stream) => Buffer.concat([Buffer.from(legacy, 'ascii'), Buffer.from([0]), stream])
const completeUnicode = (legacy, text) => unicodeField(legacy, encoded(0, literal(text)))

export async function prepareFilenameFixtures() {
  await mkdir(filenameFixtureRoot, { recursive: true })
  const data = await readFile('tests/fixtures/gif/previous.gif'), cases = []
  const add = (name, rawName, unicode, outcome, purpose) => cases.push({ name, rawName: Buffer.from(rawName), unicode,
    ...(outcome.startsWith('ARCHIVE_') ? { expectedError: outcome } : { expectedPath: outcome }), purpose })
  add('ascii-normal.rar', Buffer.from('plain.gif'), false, 'plain.gif', 'Non-Unicode name retains its full declared length')
  add('legacy-utf8-private-use.rar', Buffer.from('\uef80.gif', 'utf8'), false, '\uef80.gif', 'Preserve existing unflagged RAR4 legacy filename serialization')
  add('nul-name-rar4.rar', Buffer.from('safe\0hidden.gif'), false, 'ARCHIVE_UNSUPPORTED', 'Original raw-NUL regression; CRC and framing are valid')
  add('nul-hidden-traversal.rar', Buffer.from('safe\0../../hidden.gif'), false, 'ARCHIVE_UNSUPPORTED', 'NUL must not hide trailing path content')
  add('nul-trailing.rar', Buffer.from('safe.gif\0'), false, 'ARCHIVE_UNSUPPORTED', 'Non-Unicode terminal NUL is not silently trimmed')
  add('control-name.rar', Buffer.from('line\nbreak.gif'), false, 'ARCHIVE_UNSUPPORTED', 'Existing final-name control guard')
  add('traversal-name.rar', Buffer.from('safe/../hidden.gif'), false, 'ARCHIVE_UNSUPPORTED', 'Existing final path traversal guard')
  add('unicode-chinese.rar', completeUnicode('zhongwen.gif', '中文.gif'), true, '中文.gif', 'Legal separator plus mode-2 UTF-16 Chinese')
  add('unicode-japanese.rar', completeUnicode('nihongo.gif', '日本語.gif'), true, '日本語.gif', 'Legal separator plus mode-2 UTF-16 Japanese')
  add('unicode-greek.rar', completeUnicode('greek.gif', 'Ελλάδα.gif'), true, 'Ελλάδα.gif', 'Other Unicode script')
  add('unicode-emoji.rar', completeUnicode('emoji.gif', 'emoji-😀.gif'), true, 'emoji-😀.gif', 'Valid UTF-16 surrogate pair')
  add('unicode-mode2-zero-low.rar', completeUnicode('a.gif', 'Ā.gif'), true, 'Ā.gif', 'A legal mode-2 low byte is zero')
  add('unicode-private-use.rar', completeUnicode('private.gif', '\uef80.gif'), true, '\uef80.gif', 'Valid private-use scalar in compressed Unicode')
  add('utf8-private-use.rar', Buffer.from('\uef80.gif', 'utf8'), true, '\uef80.gif', 'Valid private-use scalar in no-separator UTF-8')
  add('unicode-mode0.rar', unicodeField('cafe.gif', encoded(0, literal('café.gif', 0))), true, 'café.gif', 'Mode 0 direct byte-valued Unicode')
  add('unicode-mode1.rar', unicodeField('zhong.gif', encoded(0x4e, [{ mode: 1, value: 0x2d }, ...literal('.gif', 0)])), true, '中.gif', 'Mode 1 shared high-byte')
  add('unicode-copy.rar', unicodeField('copy-name.gif', encoded(0, [{ mode: 3, count: 13 }])), true, 'copy-name.gif', 'Mode 3 bounded legacy-name copy')
  add('unicode-correction.rar', unicodeField('ABC.gif', encoded(0x30, [{ mode: 3, count: 3, correction: 0x20 }, ...literal('.gif', 0)])), true, 'ちぢっ.gif', 'Mode 3 corrected legacy-name run')
  add('unicode-all-modes.rar', unicodeField('ABCD.gif', encoded(0x4e, [{ mode: 0, value: 0x41 }, { mode: 1, value: 0x2d }, { mode: 2, value: 0x6587 }, { mode: 3, count: 5 }])), true, 'A中文D.gif', 'All four modes in one valid flags byte')
  add('unicode-utf8-no-separator.rar', Buffer.from('中文-日本語-😀.gif', 'utf8'), true, '中文-日本語-😀.gif', 'Supported UTF-8 variant without a separator')
  for (const count of [1023, 1024, 1025]) {
    const name = 'a'.repeat(count - 4) + '.gif'
    add('ascii-length-' + count + '.rar', Buffer.from(name), false, count > 1024 ? 'ARCHIVE_LIMIT_EXCEEDED' : name, 'Existing path-character limit at ' + count)
    add('unicode-length-' + count + '.rar', completeUnicode('legacy.gif', name), true, count > 1024 ? 'ARCHIVE_LIMIT_EXCEEDED' : name, 'Full compressed Unicode decoded length at ' + count)
  }
  const malformed = [
    ['unicode-empty-stream.rar', Buffer.alloc(0), 'Separator has no Unicode stream'],
    ['unicode-high-only.rar', Buffer.from([0]), 'Only shared high-byte; no filename'],
    ['unicode-flags-only.rar', Buffer.from([0, 0]), 'Flags with no operand'],
    ['unicode-truncated-mode2.rar', Buffer.from([0, 0x80, 0x41]), 'Mode 2 lacks its high byte'],
    ['unicode-truncated-mode3.rar', Buffer.from([0, 0xc0]), 'Mode 3 lacks run operand'],
    ['unicode-missing-correction.rar', Buffer.from([0, 0xc0, 0x80]), 'Corrected run lacks correction byte'],
    ['unicode-copy-overrun.rar', Buffer.from([0, 0xc0, 127]), 'Legacy copy exceeds declared legacy prefix'],
    ['unicode-dangling-flags.rar', Buffer.from([0, 0, 97, 98, 99, 100, 0]), 'A second flags byte has no operand'],
    ['unicode-decoded-nul.rar', encoded(0, literal('safe\0hidden.gif')), 'Decoded UTF-16 NUL must be rejected'],
    ['unicode-unpaired-high.rar', encoded(0, literal('safe\ud800.gif')), 'Unpaired UTF-16 high surrogate'],
    ['unicode-unpaired-low.rar', encoded(0, literal('safe\udc00.gif')), 'Unpaired UTF-16 low surrogate'],
    ['unicode-decoded-control.rar', encoded(0, literal('line\nbreak.gif')), 'Final decoded control guard'],
    ['unicode-decoded-traversal.rar', encoded(0, literal('../hidden.gif')), 'Final decoded traversal guard'],
  ]
  for (const [name, stream, purpose] of malformed) add(name, unicodeField('legacy.gif', stream), true, 'ARCHIVE_UNSUPPORTED', purpose)
  for (const [name, bytes] of [
    ['utf8-overlong.rar', [0xc0, 0xaf, 0x2e, 0x67, 0x69, 0x66]],
    ['utf8-truncated.rar', [0xe4, 0xb8]],
    ['utf8-surrogate.rar', [0xed, 0xa0, 0x80]],
    ['utf8-invalid-continuation.rar', [0xe4, 0x41, 0xad]],
  ]) add(name, Buffer.from(bytes), true, 'ARCHIVE_UNSUPPORTED', 'Malformed no-separator UTF-8 must not fall back to legacy bytes')
  const records = []
  for (const item of cases) {
    const bytes = store(item.rawName, item.unicode, data), structural = inspectFilenameFixture(bytes)
    assert.equal(structural.rawNameHex, item.rawName.toString('hex'))
    assert.equal(structural.unicodeFlag, item.unicode)
    const path = join(filenameFixtureRoot, item.name)
    await writeFile(path, bytes)
    let independentlyExtracted = false, installedNameMatches = null
    if (item.expectedPath) {
      const tool = process.env.SEVENZIP_EXE ?? 'C:/Program Files/7-Zip/7z.exe'
      const decoded = execFileSync(tool, ['e', '-so', '-p-', path],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 ** 2 })
      assert.equal(sha(decoded), sha(data), 'Installed 7-Zip extracts valid stored payload: ' + item.name)
      const byName = execFileSync(tool, ['e', '-so', '-p-', path, '--', item.expectedPath],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 ** 2 })
      installedNameMatches = sha(byName) === sha(data)
      // The unpatched upstream decoder truncates compressed Unicode at1,023
      // code units. The product patch deliberately validates the full existing
      // 1,024-character policy boundary rather than silently truncating it.
      // Its private-use escape convention and Windows legacy OEM conversion
      // also differ from the Wasm metadata serialization under test. Their
      // stored payloads are independently verified above; exact names are
      // checked against the preserved/fixed product Workers, not OS code pages.
      if (!['unicode-length-1024.rar', 'unicode-private-use.rar', 'utf8-private-use.rar', 'legacy-utf8-private-use.rar'].includes(item.name)) assert(installedNameMatches, 'Independent expected-name lookup: ' + item.name)
      independentlyExtracted = true
    }
    let originalRegressionBytesMatch = null
    if (item.name === 'nul-name-rar4.rar') {
      try {
        const original = await readFile('.tools/m10c3/fixtures/nul-name-rar4.rar')
        assert(original.equals(bytes), 'Use exactly the original failing NUL fixture bytes')
        originalRegressionBytesMatch = true
      } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    const { rawName, unicode, ...description } = item
    records.push({ ...description, bytes: bytes.length, sha256: sha(bytes), structural, independentlyExtracted, installedNameMatches,
      originalRegressionBytesMatch, expectedOutputBytes: data.length, expectedOutputSha256: sha(data) })
  }
  // Verify that the structural checker actually detects a damaged CRC; malformed
  // filename tests above are never produced by simply corrupting their headers.
  const check = await readFile(join(filenameFixtureRoot, 'nul-name-rar4.rar'))
  const corrupted = Buffer.from(check); corrupted[22] ^= 1
  assert.throws(() => inspectFilenameFixture(corrupted), /Header CRC/)
  const manifest = { schema: 1, publicTestOnly: true, format: 'RAR4 STORE metadata',
    structuralValidator: 'Independent Node zlib.crc32; exact declared NAME_SIZE, HEAD_SIZE, packed/unpacked size, header/file CRC and EOF', cases: records }
  await writeFile(join(filenameFixtureRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareFilenameFixtures()
  console.log(JSON.stringify({ prepared: true, cases: result.cases.length,
    positiveCases: result.cases.filter(item => item.expectedPath).length, manifest: join(filenameFixtureRoot, 'manifest.json') }))
}
