export interface WebPModule {
  HEAPU8: Uint8Array<ArrayBuffer>
  _malloc(size: number): number
  _free(pointer: number): void
  _aniview_webp_create(data: number, size: number): number
  _aniview_webp_error(): number
  _aniview_webp_width(context: number): number
  _aniview_webp_height(context: number): number
  _aniview_webp_frame_count(context: number): number
  _aniview_webp_loop_count(context: number): number
  _aniview_webp_has_next(context: number): number
  _aniview_webp_next(context: number): number
  _aniview_webp_frame(context: number): number
  _aniview_webp_timestamp(context: number): number
  _aniview_webp_reset(context: number): void
  _aniview_webp_destroy(context: number): void
  _aniview_webp_encoder_create(width: number, height: number, frames: number, plays: number): number
  _aniview_webp_encoder_destroy(context: number): void
  _aniview_webp_encoder_input(context: number): number
  _aniview_webp_encoder_add(context: number, timestamp: number): number
  _aniview_webp_encoder_finish(context: number, endTimestamp: number): number
  _aniview_webp_encoder_output(context: number): number
  _aniview_webp_encoder_output_size(context: number): number
  _aniview_webp_encoder_count(): number
  _aniview_webp_live_alloc_bytes(): number
}
export default function createModule(options: {
  locateFile(path: string): string
  printErr(text: string): void
}): Promise<WebPModule>
