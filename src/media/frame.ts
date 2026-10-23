/** A fully composited canvas-sized frame; codec blend/disposal stays in the adapter. */
export interface DecodedFrame {
  readonly index: number
  readonly width: number
  readonly height: number
  readonly durationMs: number
  readonly byteLength: number
  readonly image: ImageBitmap | ImageData | null
  /** The consumer owns this frame and releases it on eviction; must be idempotent. */
  dispose(): void
}
