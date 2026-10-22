# Milestone 1A: libwebp WASM technical spike

This isolates the approved decoder route. It does not implement Milestone 1's
production Player, cache, format detector or input experience. The normal Home
page stays intact. Use `?spike=webp` to load the engineering harness lazily.

## Pinned sources and rebuild

| Component | Pin |
| --- | --- |
| Official libwebp | v1.6.0 |
| Resolved commit | `4fa21912338357f89e4fd51cf2368325b59e9bd9` |
| Annotated tag object | `b7e29b9d75bd31422b00c2a446d49d7af06c328d` |
| Source archive SHA256 | `a1e18776b2bfdf59db4089cefb7453d3207bb6e77c24d649e0757e3a08fdca14` |
| Emscripten | 6.0.13, SDK commit `35659964bc2762fffec0d257997fb61475f765b7` |
| SDK source archive SHA256 | `1965569d3c03bf86d66d4abd6ffdfabca994301c8361ba9233f47454b16cf9d4` |
| Build system | CMake 4.4.4 + Ninja 1.13.2, Windows x64 |

Official upstream: [libwebp](https://chromium.googlesource.com/webm/libwebp/+/v1.6.0/),
[SDK release](https://github.com/emscripten-core/emsdk/tree/6.0.13),
[Emscripten modular output](https://emscripten.org/docs/compiling/Modularized-Output.html).
libwebp uses its BSD-style `COPYING` license and separate `PATENTS` grant; both,
plus `AUTHORS`, are preserved under `third_party/licenses/libwebp/`. Emscripten's
runtime license is also preserved. Published notices are available at
`/AniView/third-party-notices.txt` through a BASE_URL-aware link in the harness.

Bootstrap/rebuild commands and prerequisites are in
[tools/webp-wasm/README.md](../../tools/webp-wasm/README.md). The stdlib Python
scripts pin and verify archives, run emcmake/CMake, and copy the resulting assets.
Ordinary `npm ci`, dev and production builds do not invoke any compiler or SDK.
All upstream sources, compilers, object files and integration outputs are ignored.
There are no new npm dependencies or lockfile changes.

## C bridge and lifecycle

Source: `tools/webp-wasm/bridge/aniview_webp_bridge.c`.
Exports `aniview_webp_create`, `error`, `width`, `height`, `frame_count`,
`loop_count`, `has_next`, `next`, `frame`, `timestamp`, `reset`, `destroy`
(each with the `aniview_webp_` prefix), plus malloc/free.

The caller copies the encoded bytes into a malloc allocation. `create` adopts
that allocation on **every** path, including failure. The C context retains the
input unchanged until destroy. It owns the WebPAnimDecoder and metadata. Destroy
deletes the decoder, frees the encoded bytes, and frees the context.

WebPAnimDecoder uses `MODE_RGBA` and `use_threads=0`; libwebp reconstructs the full
canvas, including blend/disposal. The bridge exposes its borrowed canvas pointer
without freeing it. The Worker copies the canvas out of the WASM heap **before**
another GetNext/Reset/Delete can invalidate it. It transfers the independent JS
ArrayBuffer and drops its own reference. No codec-specific canvas composition is
implemented in React or in TypeScript.

## Worker and main-thread boundary

Requests: `open(data)`, `next`, `reset`, `close`, each with a numeric request id.
Responses: `ready(metadata, timings, heap size)`, `frame(RGBA, index, duration,
timings)`, `end`, `reset`, `closed`, `error(code)`.

`WebPDecoder` is a narrow spike transport, **not** the final AnimationDecoder
adapter. Its input is a VirtualFile, keeping browser File objects out of decoder
code. The harness provides a minimal source adapter for its file input.
File reading returns a fresh ArrayBuffer transferred to the Worker; it is
detached on the main thread. Each next request decodes exactly one frame. Returned
RGBA is transferred back, detaching the Worker-side JS buffer. The main thread
uses Uint8ClampedArray → ImageData → putImageData and retains only numeric frame
diagnostics. Canvas owns its rendered pixels; there is no frame array.

Timestamps are converted to durations in the Worker (current minus previous,
starting at zero). Zero durations remain zero for future Player policy. Reset
calls WebPAnimDecoderReset without rereading the file and resets timestamp/index.
Loop count here is explicitly **raw libwebp metadata**, not yet the normalized
AnimationSequence loop contract. This prevents an untested loop interpretation
from becoming the production model.

The transport allows one in-flight operation and the Worker serializes messages.
Worker failures, message failures and the 15-second operation timeout reject
pending promises. Errors use stable MediaError codes; raw exceptions are not
shown. Idle close explicitly destroys C state and then terminates the Worker.
Closing during pending work or unmounting terminates the instance and settles
pending operations. Generation/alive guards prevent stale React updates.
Corrupt input can be followed by a fresh open without breaking the app session.

## Memory and compatibility bounds

- Encoded input limit: 64 MiB, checked before reading and again in the Worker/C bridge.
- Canvas limit: 8,388,608 pixels (32 MiB RGBA), checked in C before decoder allocation.
- Linear memory starts at 16 MiB, can grow to 256 MiB. Growth is **not** expected to shrink.
- Freeing C allocations enables reuse, not an immediate process RSS reduction.
- Terminating the per-file Worker releases its instance for browser reclamation.
- libwebp has its own bounded compositing buffers; one additional JS frame is in
  transit/being drawn, with no retained collection of frames.
- Single-threaded WASM, no pthread flags, SharedArrayBuffer, cross-origin isolation,
  SIMD requirement, OffscreenCanvas, ImageBitmap or WebCodecs baseline.

Missing Worker/WebAssembly is reported as WASM_UNAVAILABLE; Canvas failures become
DECODE_FAILED. These are engineering messages, not final compatibility UX.

## Runtime integration and sizes

Emscripten flags include O2, MODULARIZE=1, EXPORT_ES6=1, ENVIRONMENT=worker,
ALLOW_MEMORY_GROWTH=1, FILESYSTEM=0 and ASSERTIONS=1. Standard ES-module factory
output is used; no experimental instance/ESM-WASM integration flags.

The Worker imports `.wasm?url` and gives that URL to the factory's `locateFile`.
The transport uses `new Worker(new URL('./webp-decoder.worker.ts', import.meta.url),
{type:'module'})`. Vite emits hashed assets under its `/AniView/` base. No origin
concatenation or hard-coded Worker/WASM URL is used. The same sources serve dev,
preview and Pages.

| Artifact | Bytes | SHA256 / gzip baseline |
| --- | ---: | --- |
| Generated mjs | 29,865 | `39d331735d901e02a0b9e75a7df22711a77bf94eaf267dc8fa2ac6fd7cd3f350` |
| WASM | 138,564 | `30bb0e1ef94546744b2d64d6891eb5d0a8442fba7b21859eddcc526da42467e8` |
| Bundled Worker incl. glue | about 23,550 | observed production output |
| WASM gzip | about 50,260 | local compression estimate, not a wire-size promise |

The upstream static library build includes encoder objects, but only bridge
decoder exports are reachable; linker dead-code elimination drops unused code.
No encoding API or conversion feature is exposed.

## Validation baseline (2026-10-23)

Sample: [official Google animated WebP](https://www.gstatic.com/webp/animated/1.webp),
380,850 bytes, SHA256
`8afc28fef9bba14b5eecbbc6bb8b4379dc96b6ebc3e0845607ced41b7dda337c`.
It is stored only in ignored `.tools/fixtures/`, not redistributed as a fixture.
Observed metadata: 300×225, 100 frames, loop count 0 (infinite).

Windows headless Edge 155, one local dev run: WASM ready 11.9 ms, decoder ready
including input read 27.5 ms, first next request through canvas 4.3 ms. The first
five decode+copy times were 3.7, 1.5, 0.9, 1.0, 1.0 ms (mean 1.62 ms). Dev and
bundled preview both showed changing canvases with durations 100 ms each. Reset
reproduced frame 1's pixel hash; close, corrupt input and reopen all worked.
CDP observed real Worker targets, WASM HTTP 200 and detached buffers in both
directions. Layout was checked at 390 and 1280 pixels, with no page errors.
These are short desktop observations with debugger instrumentation, not Android
benchmarks or statistically controlled performance results.

Vitest tests timestamp normalization and transport concurrency, error delivery,
stale-response rejection and pending-promise cleanup. It does not claim to run
WASM. Real browser validation is separate and reproducible with
`tools/webp-wasm/browser-check.mjs`. Before adopting the route, run that same test
against the deployed Pages query URL and confirm Worker/WASM 200, decode, reset,
close and recovery. The normal Home page must still render independently.

## Limits and next decision

Sequential manual next only; no seek, prefetch, cache, autoplay or formal Player.
Only the WebP spike adapter is present; no additional formats, archive handling,
conversion or production file-input flow. Android performance is unmeasured.
The bounded resource limits are conservative spike defaults, not a complete
mobile memory policy. Fine-grained decoder OOM can be indistinguishable from
corruption in libwebp's create return; preflight limit failures are distinct.
Proceed to the formal Milestone 1 adapter/cache/player only after independent
local, bundled and Pages integration success.
