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
}
export default function createModule(options: {
  locateFile(path: string): string
  printErr(text: string): void
}): Promise<WebPModule>
