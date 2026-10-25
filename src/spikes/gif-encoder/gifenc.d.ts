declare module 'gifenc' {
  export type Palette = number[][]
  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, options: {
      palette: Palette
      delay: number
      repeat: number
      transparent: boolean
      transparentIndex: number
      dispose: number
    }): void
    finish(): void
    bytesView(): Uint8Array<ArrayBuffer>
    readonly buffer: ArrayBuffer
  }
  export function GIFEncoder(options?: { initialCapacity?: number }): GifEncoderInstance
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format: 'rgb565' }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565'): Uint8Array<ArrayBuffer>
}
