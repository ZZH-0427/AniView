import { ConversionError } from './model'

/** Encoded bytes only; growth copies existing output, never an RGBA history. */
export class GrowingByteWriter {
  private bytes: Uint8Array<ArrayBuffer>
  private length = 0
  constructor(private readonly maximum: number, initial = 4096) {
    this.bytes = new Uint8Array(Math.min(maximum, initial))
  }
  get byteLength() { return this.length }
  get capacity() { return this.bytes.byteLength }
  view() { return this.bytes }
  ensure(additional: number) {
    const needed = this.length + additional
    if (!Number.isSafeInteger(additional) || additional < 0 || needed > this.maximum) throw new ConversionError('RESOURCE_LIMIT')
    if (needed <= this.capacity) return
    const capacity = Math.min(this.maximum, Math.max(needed, this.capacity * 2))
    const next = new Uint8Array(capacity)
    next.set(this.bytes.subarray(0, this.length))
    this.bytes = next
  }
  uint8(value: number) { this.ensure(1); this.bytes[this.length++] = value }
  uint16(value: number) {
    this.ensure(2)
    this.bytes[this.length++] = value >>> 8
    this.bytes[this.length++] = value
  }
  uint32(value: number) {
    this.ensure(4)
    this.bytes[this.length++] = value >>> 24
    this.bytes[this.length++] = value >>> 16
    this.bytes[this.length++] = value >>> 8
    this.bytes[this.length++] = value
  }
  append(value: Uint8Array) { this.ensure(value.byteLength); this.bytes.set(value, this.length); this.length += value.byteLength }
  /** Transfer the existing capacity allocation; the caller must honor byteLength. */
  take() {
    const result = { data: this.bytes.buffer, byteLength: this.length }
    this.dispose()
    return result
  }
  dispose() { this.bytes = new Uint8Array(0); this.length = 0 }
}
