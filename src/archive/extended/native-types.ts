/** Unsafe vendor access ends here; no Emscripten types escape the adapter. */
export interface SevenZipRuntime {
  readonly FS: {
    mkdir(path: string): void
    mount(type: unknown, options: { blobs: { name: string; data: Blob }[] }, path: string): void
  }
  readonly WORKERFS: unknown
  UTF8ToString(pointer: number): string
  ccall(name: 'av_open' | 'av_extract', result: 'number', types: readonly ('number' | 'string')[], values: readonly (number | string | null)[]): number
  _av_count(): number
  _av_last(): number
  _av_number(index: number, property: number): number
  _av_string(index: number, property: number): number
  _av_output(): number
  _av_length(): number
  _av_release(): void
}
export interface SevenZipFactoryOptions {
  wasmBinary: ArrayBuffer
  print(): void
  printErr(): void
  instantiateWasm(imports: WebAssembly.Imports,
    success: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void): object
}
export type SevenZipFactory = (options: SevenZipFactoryOptions) => Promise<SevenZipRuntime>
