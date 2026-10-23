declare module 'omggif' {
  export interface FrameInfo {
    x: number; y: number; width: number; height: number; delay: number; disposal: number;
    transparent_index: number | null; interlaced: boolean; palette_offset: number; palette_size: number;
    data_offset: number; data_length: number; has_local_palette: boolean;
  }
  export class GifReader {
    constructor(bytes: Uint8Array)
    width: number
    height: number
    numFrames(): number
    loopCount(): number | null
    frameInfo(index: number): FrameInfo
    decodeAndBlitFrameRGBA(index: number, pixels: Uint8Array): void
  }
}
