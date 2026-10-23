import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VirtualFile } from '../input/virtual-file'
import type { AnimationSequence } from '../media/animation'
import { MediaError } from '../media/errors'
import type { DecodeOptions } from './animation-decoder'
import type { DetectedFormat } from './detector'
import { apngFixture } from './apng/apng-fixtures.test-support'
import gifFixture from '../../tests/fixtures/gif/finite.gif?inline'
import { openAnimation } from './open-animation'

const decoders = vi.hoisted(() => ({
  construct: vi.fn(),
  webp: vi.fn<(file: VirtualFile, options?: DecodeOptions) => Promise<AnimationSequence>>(),
  apng: vi.fn<(file: VirtualFile, options?: DecodeOptions) => Promise<AnimationSequence>>(),
  gif: vi.fn<(file: VirtualFile, options?: DecodeOptions) => Promise<AnimationSequence>>(),
}))

vi.mock('./webp/webp-animation-decoder', () => ({ WebPAnimationDecoder: class {
  constructor() { decoders.construct('webp') }
  canDecode(format: DetectedFormat) { return format.kind === 'webp' }
  decode = decoders.webp
} }))
vi.mock('./apng/apng-animation-decoder', () => ({ APNGAnimationDecoder: class {
  constructor() { decoders.construct('apng') }
  canDecode(format: DetectedFormat) { return format.kind === 'apng' }
  decode = decoders.apng
} }))
vi.mock('./gif/gif-animation-decoder', () => ({ GIFAnimationDecoder: class {
  constructor() { decoders.construct('gif') }
  canDecode(format: DetectedFormat) { return format.kind === 'gif' }
  decode = decoders.gif
} }))

afterEach(() => { vi.resetAllMocks() })

const text = new TextEncoder()
const staticMessage = 'This file is a static image. Static-image viewing is not available in this milestone.'

function file(bytes: Uint8Array, name = 'misleading.gif', mimeType = 'image/gif'): VirtualFile {
  return { name, mimeType, size: bytes.length, source: 'file',
    read: async (start = 0, end = bytes.length) => bytes.slice(start, end).buffer }
}

/** Only the detector header is relevant: codec output is mocked at its boundary. */
function webp(animated: boolean, extended = true) {
  const bytes = new Uint8Array(extended ? 30 : 20)
  bytes.set(text.encode('RIFF'), 0)
  bytes.set(text.encode(extended ? 'WEBPVP8X' : 'WEBPVP8 '), 8)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, bytes.length - 8, true)
  view.setUint32(16, extended ? 10 : 0, true)
  if (extended) bytes[20] = animated ? 2 : 0
  return bytes
}

const animationInputs = [
  { kind: 'webp', bytes: webp(true) },
  { kind: 'apng', bytes: new Uint8Array(apngFixture('full-infinite.png')) },
  { kind: 'gif', bytes: Uint8Array.from(atob(gifFixture.split(',')[1]!), character => character.charCodeAt(0)) },
] as const

describe('current-file animation selection', () => {
  it.each(animationInputs)('selects $kind using binary evidence despite extension and MIME hints', async ({ kind, bytes }) => {
    const sequence: AnimationSequence = {
      width: 2, height: 2, frameCount: 2,
      frames: async function* () { yield* [] },
      dispose: async () => {},
    }
    decoders[kind].mockResolvedValue(sequence)
    const options = { signal: new AbortController().signal }
    for (const [name, mimeType] of [
      ['wrong-extension.jpg', 'image/jpeg'],
      ['without-extension', ''],
      ['wrong-extension.bmp', 'application/octet-stream'],
    ]) {
      const input = file(bytes, name, mimeType)
      await expect(openAnimation(input, options)).resolves.toEqual({ format: kind, sequence })
      expect(decoders[kind]).toHaveBeenLastCalledWith(input, options)
    }
    for (const other of ['webp', 'apng', 'gif'] as const) {
      expect(decoders[other]).toHaveBeenCalledTimes(other === kind ? 3 : 0)
    }
  })

  it.each([
    { label: 'static PNG', bytes: new Uint8Array(apngFixture('static.png')), code: 'STATIC_PNG_NOT_ANIMATED' },
    { label: 'JPEG', bytes: new Uint8Array([255, 216, 255, 224]), code: 'STATIC_IMAGE_NOT_AVAILABLE' },
    { label: 'extended static WebP', bytes: webp(false), code: 'STATIC_IMAGE_NOT_AVAILABLE' },
    { label: 'simple static WebP', bytes: webp(false, false), code: 'STATIC_IMAGE_NOT_AVAILABLE' },
  ])('explains $label before constructing a decoder or Worker', async ({ bytes, code }) => {
    await expect(openAnimation(file(bytes))).rejects.toMatchObject({ code, message: staticMessage })
    expect(decoders.construct).not.toHaveBeenCalled()
    for (const decode of [decoders.webp, decoders.apng, decoders.gif]) expect(decode).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'random binary', bytes: new Uint8Array([1, 2, 3, 4]) },
    { label: 'text renamed .gif', bytes: text.encode('This is not a GIF image.') },
    { label: 'unsupported SVG image', bytes: text.encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
    { label: 'ZIP before archive support', bytes: new Uint8Array([80, 75, 3, 4]) },
  ])('distinguishes $label from recognized static and corrupted input', async ({ bytes }) => {
    await expect(openAnimation(file(bytes))).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT', message: 'Unsupported image format.' })
    for (const decode of [decoders.webp, decoders.apng, decoders.gif]) expect(decode).not.toHaveBeenCalled()
  })

  it('preserves corrupt-container detection without attempting decode', async () => {
    const png = new Uint8Array(apngFixture('static.png')).slice(0, -2)
    const riff = webp(true)
    new DataView(riff.buffer).setUint32(4, 0xffff, true)
    for (const bytes of [png, riff]) {
      await expect(openAnimation(file(bytes))).rejects.toMatchObject({ code: 'CORRUPTED_FILE', message: 'This file appears to be damaged.' })
    }
    expect(decoders.construct).not.toHaveBeenCalled()
  })

  it.each(animationInputs)('preserves the $kind decoder corruption category', async ({ kind, bytes }) => {
    const failure = new MediaError('CORRUPTED_FILE')
    decoders[kind].mockRejectedValue(failure)
    await expect(openAnimation(file(bytes))).rejects.toBe(failure)
  })

  it('stops aborted and failed reads before creating decoder resources', async () => {
    const input = file(animationInputs[0].bytes)
    const abort = new AbortController()
    abort.abort()
    await expect(openAnimation(input, { signal: abort.signal })).rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
    await expect(openAnimation({ ...input, read: async () => { throw new Error('File no longer readable') } }))
      .rejects.toMatchObject({ code: 'FILE_READ_FAILED' })
    expect(decoders.construct).not.toHaveBeenCalled()
  })
})
