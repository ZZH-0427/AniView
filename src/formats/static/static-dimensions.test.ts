import { describe, expect, it } from 'vitest'
import { inspectStaticDimensions } from './static-dimensions'
import type { StaticImageFormat } from './static-dimensions'
import { staticFixture } from './static-fixtures.test-support'

const putText = (bytes: Uint8Array, offset: number, text: string) => bytes.set(new TextEncoder().encode(text), offset)

function webp(kind: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number) {
  const payload = kind === 'VP8L' ? 6 : 10
  const data = new ArrayBuffer(20 + payload), bytes = new Uint8Array(data), view = new DataView(data)
  putText(bytes, 0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true)
  putText(bytes, 8, `WEBP${kind}`); view.setUint32(16, kind === 'VP8L' ? 5 : 10, true)
  if (kind === 'VP8L') { bytes[20] = 0x2f; view.setUint32(21, width - 1 + ((height - 1) << 14), true) }
  else if (kind === 'VP8 ') { bytes.set([0x9d, 1, 0x2a], 23); view.setUint16(26, width, true); view.setUint16(28, height, true) }
  else { view.setUint32(24, width - 1, true); bytes.set([height - 1 & 255, (height - 1) >>> 8 & 255, (height - 1) >>> 16], 27) }
  return data
}

function jpeg(width: number, height: number) {
  const data = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0])
  const view = new DataView(data.buffer); view.setUint16(7, height); view.setUint16(9, width)
  return data.buffer
}

describe('static image dimension preflight', () => {
  it.each([['quadrants.jpg', 'jpeg'], ['quadrants.png', 'png'], ['quadrants.webp', 'webp'],
    ['orientation-2.jpg', 'jpeg'], ['orientation-3.jpg', 'jpeg'], ['orientation-6.jpg', 'jpeg'], ['orientation-8.jpg', 'jpeg']] as const)('reads %s container dimensions without applying EXIF itself', (name, format) => {
    expect(inspectStaticDimensions(staticFixture(name), format)).toEqual({ width: 40, height: 20 })
  })
  it.each(['VP8 ', 'VP8L'] as const)('supports %s dimension headers', kind => {
    expect(inspectStaticDimensions(webp(kind, 7, 11), 'webp')).toEqual({ width: 7, height: 11 })
  })
  it.each(['jpeg', 'png', 'webp'] as const)('rejects invalid %s signatures before decode', format => {
    expect(() => inspectStaticDimensions(new ArrayBuffer(40), format)).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })
  it.each([jpeg(50_000, 50_000), jpeg(16_385, 1), jpeg(2049, 2048)])('rejects JPEG SOF dimensions before native allocation', data => {
    expect(() => inspectStaticDimensions(data, 'jpeg')).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }))
  })
  it('rejects huge PNG dimensions before native allocation', () => {
    const data = staticFixture('quadrants.png'); new DataView(data).setUint32(16, 50_000)
    expect(() => inspectStaticDimensions(data, 'png')).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }))
  })
  it.each(['VP8 ', 'VP8L', 'VP8X'] as const)('rejects excessive %s dimensions before native allocation', kind => {
    expect(() => inspectStaticDimensions(webp(kind, 4096, 4096), 'webp')).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }))
  })
  it.each([
    ['truncated SOF', staticFixture('corrupt.jpg'), 'jpeg'],
    ['truncated marker', new Uint8Array([255, 216, 255]).buffer, 'jpeg'],
    ['SOS without SOF', new Uint8Array([255, 216, 255, 218]).buffer, 'jpeg'],
    ['truncated APP segment', new Uint8Array([255, 216, 255, 225, 255, 255]).buffer, 'jpeg'],
    ['zero JPEG width', jpeg(0, 1), 'jpeg'],
    ['truncated PNG IHDR', staticFixture('quadrants.png').slice(0, 24), 'png'],
    ['truncated WebP image', webp('VP8L', 4, 4).slice(0, -1), 'webp'],
    ['missing WebP image', webp('VP8X', 4, 4), 'webp'],
  ] as const)('rejects %s', (_label, data, format) => {
    expect(() => inspectStaticDimensions(data, format)).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })
  it('validates VP8X canvas and inner image agree and do not hide animation', () => {
    const header = new Uint8Array(webp('VP8X', 7, 11)), frame = new Uint8Array(webp('VP8L', 7, 11))
    const data = new Uint8Array(header.length + frame.length - 12)
    data.set(header); data.set(frame.subarray(12), header.length)
    new DataView(data.buffer).setUint32(4, data.length - 8, true)
    expect(inspectStaticDimensions(data.buffer, 'webp')).toEqual({ width: 7, height: 11 })
    data[24] = 8
    expect(() => inspectStaticDimensions(data.buffer, 'webp')).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
    data[24] = 6; data[20] = 2
    expect(() => inspectStaticDimensions(data.buffer, 'webp')).toThrow(expect.objectContaining({ code: 'CORRUPTED_FILE' }))
  })
  it.each(['jpeg', 'png', 'webp'] satisfies StaticImageFormat[])('never trusts filename or MIME during dimension validation: %s', format => {
    expect(() => inspectStaticDimensions(new ArrayBuffer(0), format)).toThrow()
  })
})
