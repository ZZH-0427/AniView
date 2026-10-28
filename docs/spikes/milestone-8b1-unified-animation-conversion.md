# Milestone 8B1 — Unified animation frame stream and encoder spikes

Status (2026-10-29): **Milestone 8B1 PASSED**. Desktop engineering gates passed;
fresh Android Edge and Quark acceptance was confirmed by the user.
This is an architecture gate on `feat/v0.2-static-to-gif`, following completed
8A2. It adds no product conversion UI. `main`, the `v0.1.0` tag and production
Pages remain outside this work; their released application baseline is
`4a3dc69542ca2923744904cd10ddbf1a35f36ff9`.

Engineering verdicts are **WebP: ACCEPT WITH LIMITATIONS**,
**APNG: ACCEPT WITH LIMITATIONS**, and **canonical architecture: ACCEPT / Yes**.
Both required Android browsers passed the new production-preview gate.
**Ready for Milestone 8B2 — GIF / WebP / APNG Inter-conversion Productization.**
Milestone 8B2 has not started. WebP's documented identical-frame coalescing
prevents a blanket claim of exact source frame-count retention.

## Reproduce and evidence scope

Use the formally installed Node.js 24/npm environment, currently
`D:\tool\nodejs\node.exe` v24.22.1 and npm 11.19.1. No application validation
uses a downloaded temporary Node installation.

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build

# Separate engineering artifact, never production dist/.
node node_modules/vite/bin/vite.js build --config tools/conversion/vite.config.mjs
node tools/conversion/run-browser.mjs
node tools/conversion/check-canonical.mjs
node tools/conversion/benchmark.mjs
node tools/conversion/benchmark.mjs --sparse
node tools/webp-wasm/encoder-check.mjs

# LAN production-build preview, without the Vite client or HMR.
node tools/conversion/preview.mjs --host 0.0.0.0 --port 4210
```

The preview serves `.tools/conversion-site/` under `/AniView/`. Its experiment
URL is `http://<computer-LAN-IPv4>:4210/AniView/experiments/conversion/?debug=1`.
Use the computer's current address, not an old address from 8A2. This static,
GET/HEAD-only preview has no media upload endpoint and does not deploy Pages.
The engineering page is absent from normal application navigation.

`run-browser.mjs` uses an already installed desktop Edge through CDP and starts
a loopback static preview on port 4211. It downloads no browser. Generated media,
browser profiles and detailed local reports stay ignored under `.tools/`.
The report used below is `.tools/conversion/report.json`, generated
`2026-10-28T16:19:41.961Z`, desktop Edge 156 on Windows. Its final status is
`PASS`: **62 cases comprise 61 successful cases and one expected CANCELLED case**,
with no entries in `errors`. A separate replacement-job test cancels an old job
and successfully completes its successor. This is not Android evidence.

The direct C/WASM report is `.tools/conversion/webp-bridge-report.json`.
Its timings include decode-back and must not be compared with encoder-only
browser timings. The report is useful as a codec oracle and allocation proxy,
not as a browser compatibility or browser-process memory measurement.

### Final repository validation record

The executed suite reported **55 files, 723 tests passed**. This includes the
646-test baseline and 77 new tests. Lint and separate TypeScript checks passed;
the local logs are `.tools/conversion/{lint,typecheck,vitest}.log`. The ordinary
production build passed its release artifact checks. Existing browser regression
passed **7 groups**, and Creator regression passed **19 checks**.

`npm ci` also passed under this formal installation (180 packages, zero audit
vulnerabilities); neither package manifest nor lockfile changed. A further
60-case source-conformance run passed against the same engineering artifact.
The supplemental test tool passed its own syntax and lint checks.

## Canonical contract and architecture

The conversion boundary carries visual animation semantics, independently of
the source or target container:

```ts
interface CanonicalAnimationMetadata {
  width: number
  height: number
  frameCount: number
  playCount: number // total plays; 0 means infinite, 1 means once
}

interface CanonicalAnimationFrame {
  index: number
  durationMs: number
  rgba: ArrayBuffer // full-canvas, composed, straight RGBA8
}
```

`AnimationFrameSource` exposes metadata, metrics, `next`, `acknowledgeFrame`,
`reset` and `close`. Target encoders expose asynchronous `addFrame`/`finish`,
`dispose` and numeric metrics. No palette, source rectangle, source disposal or
source blend operation escapes into an encoder. The same `convertAnimation`
coordinator handles every matrix entry; there are no source/target pair-specific
converters and no duplicate Player or decoder architecture.

Total-play and delay mappings are checked by actual decode-back, alongside the
primary [WebP container specification](https://developers.google.com/speed/webp/docs/riff_container)
and [PNG Third Edition animation chunks](https://www.w3.org/TR/png-3/).

```text
borrowed VirtualFile
  -> existing GIF/APNG/WebP decoder Worker transport
  -> composed full-canvas RGBA, transferred to main
  -> main broker: metadata / progress / cancel / one current buffer
  -> same RGBA ArrayBuffer transferred to a dedicated encoder Worker
  -> target encoder accepts current frame
  -> acknowledge source, then request next frame
  -> finish, transfer encoded capacity buffer + exact byteLength
  -> dispose encoder and close decoder
```

The adapter bypasses Viewer `ImageData`, frame cache, scheduling and rendering
adapters. It reuses their Worker codec transports. Player, MediaSession,
CreationSession ownership and product controls do not participate in conversion.
The caller retains ownership of the `VirtualFile`; conversion never releases it.
Reset seeks the source transport back to its initial frame and requires that
there is no outstanding unacknowledged frame.

`ConversionResult.metadata` describes the **source canonical stream**. It is
not an independent inspection of the encoded target. In particular, after WebP
coalesces identical frames, actual output frame count must come from decode-back
metadata. The harness records requested fixture metadata, source metadata and
decoded target metadata separately.

### Backpressure, transfer and cleanup

The broker awaits `source.next()`, then awaits `encoder.addFrame(frame)` and its
actual `accepted` response. Only after checking that the original main-thread
buffer has `byteLength === 0` does it acknowledge the source and request the
next frame. The adapter additionally refuses a concurrent pull or a pull while
its previous handed-out buffer remains unacknowledged. No prefetch queue exists.

The broker transfers `[frame.rgba]` itself, without `slice`, `ImageData` or a
main-thread copy. A per-encoder pending-request guard and request IDs prevent
overlapping commands and ignore stale responses. Result buffers are transferred
from the encoder Worker; `byteLength` specifies the valid output range even
when the returned allocation has extra capacity.

Cancellation terminates the dedicated encoder Worker and closes or terminates
the source transport, including an in-flight native/WASM operation. The
coordinator cleans up in `finally`; generation checks prevent cancelled jobs
from publishing into replacements. A late caller-owned file read cannot be
made abortable by this interface, but it cannot publish a stale conversion
result. Errors distinguish unsupported source, source decode, unsupported
target, target encoding, resource limits, cancellation and Worker failure.

Observed desktop evidence:

- **1,903 / 1,903** main-to-encoder frame transfers detached the original buffer.
- **2,019 / 2,019** instrumented Worker frame/result posts detached their buffer.
- Successful cases reported logical `peakRgbaFrames = 1`; cancellation after
  one accepted frame returned `CANCELLED`, followed by a successful rerun.
- The replacement-job test discarded the cancelled job. During replacement,
  two active Workers belong to the new job; at final settlement all **378 / 378**
  created Workers were terminated, with active Workers/bitmaps and cleanup errors
  all zero.
- Across completed report cases the largest main-thread heartbeat gap was
  **18.0 ms**. This measures the tested desktop workload, not every future file.

## Memory accounting and experimental limits

The one-frame invariant is **one transport-owned canonical RGBA frame in flight**,
not one pixel allocation in the whole process. Decoder composition storage,
PREVIOUS-disposal region backup, encoder workspaces, native stream internals,
compressed output, allocator capacity and delayed GC are additional allocations.

GIF/APNG fallback decoders have a fixed composition canvas and, where needed,
bounded region backup. The WebP decoder has its own WASM heap and composed-frame
storage. The encoder Worker instantiates a separate heap from the same WebP
binary. WebPAnimEncoder has reusable picture/canvas workspace and bounded
internal frame candidates; its compressed output can grow with encoded content.
These are not a retained canonical RGBA array for all source frames.

`decoderHeapBytes` and `decoderBackupBytes` report source proxies separately.
`wasmPeakHeapBytes` reports committed WebAssembly linear-memory capacity, which
does not shrink after freeing. `wasmPeakLiveAllocBytes` is the maximum observed
`mallinfo().uordblks` at create/add/finalize checkpoints; it can miss transient
native allocations. `wasmLiveAllocBytes` is zero after encoder destruction in
the measured cases. Neither value is browser RSS, JS heap or a true process peak.

The APNG writer reports output capacity, largest delivered compressed chunk,
compressed bytes written per frame, and its one-byte scanline filter marker.
`peakCompressedFrameBytes` is a byte count, **not a retained full compressed-frame
buffer**. CompressionStream owns further native workspace and may retain an
already-written chunk. Stable views of the one current RGBA are therefore fed
without mutating them, while output is drained concurrently.

The conservative spike guard is max 200 frames, max side 2048, max canvas
4,194,304 pixels, and max `width × height × frameCount` 15,360,000 pixel-frames.
Encoded source and output are each limited to 64 MiB. Total plays range 0–65535;
frame durations are finite, nonnegative and at most 655350 ms. These are measured
experimental ceilings, not final conversion-product recommendations. Existing
Viewer or Creator resource policies are not changed.

## WebP encoder

The spike extends the existing pinned **libwebp 1.6.0** bridge and links its
`libwebpmux`; it adds no second WebP runtime. C create/input/add/finish/output/
destroy exports, an active-encoder counter and allocation checkpoint proxy are
added beside unchanged decoder exports. The same binary is instantiated
independently by decoder and encoder Workers.

Fixed settings are lossless, `exact=1`, method 0, no mixed lossy mode and a
transparent animation background. The current canonical frame fills one
reusable WebPPicture allocation, with an in-place RGBA-to-ARGB byte-layout
conversion. Timestamps are rounded cumulative frame starts; finalization
supplies the rounded final end time. There is one exact-range WASM-to-JS output
copy, followed by a Worker transfer.

The direct bridge test decodes through the existing C decoder. It passed alpha
0/1/64/127/128/200/254/255, visible RGB, hidden transparent RGB in the fixtures,
20/27/100/250/500/1000 ms, and total plays 0/1/2/3. Browser small-scene lossless
outputs also matched complete canonical frame hashes and sampled channel data.
These measurements are not a guarantee that every hidden RGB value survives
every upstream frame-rectangle optimization.

### Coalescing and single-frame animation semantics

Upstream WebPAnimEncoder can merge adjacent identical frames before evaluating
keyframe alternatives. Public keyframe options do not preserve arbitrary source
frame boundaries. The direct test deliberately retains this case: six input
frames A,A,B,B,C,C become three output frames with durations **47/350/1500 ms**.
Six identical inputs become one visual frame with the correct **1897 ms** total.
The source frames are never perturbed to evade this optimization.

Upstream also serializes a single visual frame as static WebP, which would lose
animation duration and play count. WebPMuxAssemble applies the same optimization.
The bridge therefore minimally wraps its already encoded VP8L chunk in
VP8X/ANIM/one full-canvas ANMF, with SOURCE/no-blend and NONE disposal. It does
not reimplement VP8L or re-encode pixels. This adds one compressed-container copy
inside WASM only when the assembled result would otherwise be static.
There is still one WASM-to-JS output copy. All **28** combinations of one frame,
plays 0/1/2/3 and duration 0/20/27/100/250/500/1000 ms decode back correctly.

WebP is consequently **ACCEPT WITH LIMITATIONS** for visual/timeline conversion.
Future productization must describe this behavior instead of promising exact
original frame boundaries. That stronger guarantee is not satisfied for
adjacent identical frames, even though timing and loops remain correct in the
measured probes.

### Rebuild, artifacts and payload cost

```powershell
python tools/webp-wasm/build.py
```

The existing isolated Emscripten 6.0.13/CMake/Ninja tooling rebuilds the same
SHA-pinned libwebp source. Its equivalent configure/build invocation is:

```text
emcmake cmake -S tools/webp-wasm -B .tools/webp-wasm-build -G Ninja
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS=-O2
  -DLIBWEBP_SOURCE_DIR=<pinned-local-libwebp-source>
cmake --build .tools/webp-wasm-build --target aniview-webp --parallel 4
```

`tools/webp-wasm/CMakeLists.txt` records the export list and link options:
ES6 modularized Worker runtime, no filesystem, 16 MiB initial memory, growth
enabled and 256 MiB maximum memory. The generated glue/binary and handwritten
`.d.mts` are reviewed together with C/CMake changes. The SDK's isolated compiler
Node is not the Node installation used by npm/application checks.

| Artifact | Decoder-only bytes | Combined bytes | Gzip before / after |
| --- | ---: | ---: | ---: |
| Generated `.mjs` | 29,865 | 33,054 | 9,118 / 9,453 |
| `.wasm` | 138,564 | 394,132 | 49,736 / 159,999 |

The glue baseline above is the Windows working-file size; the previous Git blob
is two bytes smaller due to line endings. The final WASM SHA256 is
`f08dc7922c9df005b72a1e169182c1886e03dcae9ab213d03e58a23cab6ff925`.
Ordinary startup must not eagerly instantiate this runtime. Sharing one artifact
does mean that the first normal WebP decode fetches a larger binary containing
native encoder code; lazy JS orchestration does not eliminate that payload cost.

## APNG writer and precision boundary

The AniView-owned writer uses no new runtime dependency. It emits PNG signature,
RGBA8 IHDR, acTL before IDAT, fcTL for each full-canvas frame, IDAT for the first
animated/default frame, fdAT thereafter, and IEND. fcTL/fdAT sequence numbers are
strictly increasing. Every frame is SOURCE with NONE disposal. No source-specific
rectangles, blends or palettes are needed at this boundary.

Each frame creates a native `CompressionStream('deflate')` zlib stream. The
writer sends a stable zero filter byte and views of each RGBA row; output is
drained concurrently into the growing final byte writer. It creates no
full-canvas filtered scanline image and never retains all frame RGBA arrays.
CRC32 covers chunk type and payload. Growth copies already encoded output only
occasionally; finalization transfers capacity plus valid byte length without
an unconditional shrink copy.

The Worker capability check constructs and drains a deflate stream. Missing or
unsupported compression returns `TARGET_ENCODER_UNSUPPORTED`; no browser-name
check or silent fallback compression dependency is added. This capability must
still be verified on the new Android runs.

The writer preserves straight RGBA bytes, including semi-alpha and alpha-zero
hidden RGB, as proven independently by Node zlib inflation and chunk/CRC
inspection. Native Canvas decode-back can quantize unpremultiplied RGB at
semi-transparent pixels: the initial desktop report observed a WebP-to-APNG
mixed-alpha RGB difference up to 2 despite exact writer bytes. This was not
silently treated as an encoder error or hidden by changing fixture pixels.

A narrow `APNGDecoder({ canonicalRGBA: true })` opt-in is used only by the new
frame-source adapter. The Worker enables direct extraction only if **every**
frame is full-canvas at 0,0, SOURCE and NONE. For those independent frames,
`readFullSourceRGBA` accepts only plain non-interlaced RGBA8 PNG with filter 0
and IHDR/IDAT/IEND chunks. It validates lengths/CRC, feeds native
DecompressionStream, and streams scanline payload into the one output RGBA.
It does not implement general PNG unfiltering or a new DEFLATE codec.

Any ancillary/color-management chunk, other pixel layout, interlace, nonzero
filter or unavailable decompressor falls back to the existing Canvas path.
The all-frame guard prevents a later partial frame from depending on composition
state that was skipped earlier. Full SOURCE/NONE frames remain independent even
when individual frames take different direct/fallback paths. Default Viewer
requests omit the opt-in flag and keep their previous compositor behavior.
Metrics distinguish `directRgbaFrames` and `canvasReadbackFrames`.

Tests cover default versus opt-in requests, straight/hidden RGBA preservation,
stream/chunk/row boundaries, dependent-frame rejection, gamma chunk fallback,
unsupported pixel layouts/filters, malformed lengths, trailing bytes, CRC and
decompressor capability fallback. The final full desktop report's supported
mixed-alpha canonical APNG/WebP streams have identical RGBA hashes, order,
milliseconds and total plays. This does **not** claim stored-RGBA equality for
all general APNG files that use the original Canvas path.

The supplemental `check-canonical.mjs` report contains **60 passed cases**:

- Six original APNG fixtures, each converted to APNG and WebP, match independently
  specified full-canvas RGBA hashes, frame order, timing and plays. They cover
  partial SOURCE, OVER, NONE/BACKGROUND/PREVIOUS, first-frame PREVIOUS and hidden
  default images. Stateful sequences report zero direct reads and Canvas reads
  equal to their frame counts, confirming that the opt-in cannot skip required
  composition history.
- Twenty-six original GIF fixtures converted to APNG, with four also converted
  to WebP, match the installed browser's independent `ImageDecoder` full-canvas
  hashes. Coverage includes transparent/local palettes, disposal, finite/short
  delays, GIF87a and all 17 existing interlaced-height cases.
- The original WebP and a tiny 4×2 partial/blend/disposal WebP made only by
  reusing its original VP8L payloads each pass both targets against native
  `ImageDecoder`. The partial OVER case uses opaque pixels; semi/soft alpha is
  covered separately by the procedural lossless cases.
- All seven procedural scenes have identical canonical source hashes between
  APNG and lossless WebP. GIF source hashes match the independently measured
  WebP-to-GIF quantized result; binary alpha/palette loss is not called exact
  equivalence to the original lossless source.

The supplemental run observed **222 / 222** detached main transfers and **406**
detached Worker posts, with zero native bitmap balances or browser errors. Its
report is `.tools/conversion/canonical-report.json`. Normal Viewer's seven-group
regression and Creator's nineteen-check regression use the default APNG decoder
path and also passed, without changing their controls or ownership.

## Timing, loops and GIF limits

Source adapters use each decoder's existing fully composed frame and normalized
duration. Canonical loop values always mean total plays. Existing GIF repeat
extensions are normalized by its parser to repeats+1; absent extension is once,
zero is forever. APNG num_plays and WebP ANIM loop count already mean total plays.

| Canonical plays | GIF repeat field | WebP loop_count | APNG num_plays |
| ---: | --- | ---: | ---: |
| 0 | 0 | 0 | 0 |
| 1 | omit extension (`-1` writer option) | 1 | 1 |
| N > 1 | N−1 | N | N |

Decode-back loop tests passed 0/1/2/3 for all targets. APNG delays use bounded
16-bit numerator/denominator seconds, reduced when integer milliseconds fit
exactly; other values choose the closest tested representable fraction.
WebP timestamps round cumulative time, avoiding independent per-frame rounding
drift. GIF rounds each duration to centiseconds, retaining its existing palette
and binary-alpha limitations.

| Requested canonical ms | WebP decoded ms | APNG decoded ms | GIF decoded ms |
| ---: | ---: | ---: | ---: |
| 1 | 1 | 1 | 100 |
| 10 | 10 | 10 | 100 |
| 20 | 20 | 20 | 20 |
| 27 | 27 | 27 | 30 |
| 100 | 100 | 100 | 100 |
| 250 | 250 | 250 | 250 |
| 500 | 500 | 500 | 500 |
| 1000 | 1000 | 1000 | 1000 |

For GIF the encoded 1/10 ms requests quantize to 0/10 ms; the existing GIF
decoder's short-delay policy normalizes these to 100 ms. The reported observed
errors are +99/+90 ms, not exact preservation. A 27 ms request becomes 30 ms,
error +3 ms. A GIF source fixture that already quantized 27 to 30 exposes 30 in
its canonical stream; the harness compares against decoded source durations,
not an unattainable pre-encoding request.

GIF reuses the existing gifenc adapter, a 256-entry palette and alpha threshold
127. It does not become a lossless target. In sampled visible RGB channels,
gradient mean/p95/max absolute errors were **1.948 / 6 / 6**, and full-change
errors **4.025 / 11 / 13**. Mixed-alpha's post-threshold visible RGB errors were
**0.085 / 0 / 3**. These are fixture measurements, not a quality guarantee for
all images or an assertion of semi-alpha preservation.

## Desktop round-trip and independent checks

All nine source/target combinations passed: GIF/APNG/WebP to GIF/APNG/WebP,
including same-format re-encoding. Small scenarios cover solid color, transparent
background, semi-alpha, flat color, gradients, sparse animation and full changes.
Small lossless cases compare whole-frame hashes plus 64 sampled pixels per frame.
Large/many-frame cases compare 64 pixel samples per frame and record full pixel
equality as `null`; they must not be described as exhaustively byte-verified.

Ten independent APNG inspections use Node's zlib and a separate bitwise CRC
oracle. They check signature/chunk structure, dimensions, frame count,
sequence numbers, SOURCE/NONE, delay fractions, complete decompressed scanlines
and canonical RGBA hashes. No UPNG or other reference-decoder dependency was
added. Existing application decoders provide a second integration readback;
the direct WebP bridge uses the unchanged mature C decoder for its codec oracle.

For equal 24×20, four-frame scenes, observed encoded sizes were:

| Scene | Lossless WebP bytes | APNG bytes | GIF bytes |
| --- | ---: | ---: | ---: |
| Solid | 244 | 473 | 293 |
| Transparent | 238 | 445 | 297 |
| Mixed alpha | 3,272 | 5,423 | 4,694 |
| Flat | 406 | 557 | 533 |
| Gradient | 672 | 5,687 | 5,481 |
| Sparse | 248 | 469 | 342 |
| Full change | 6,208 | 7,156 | 5,477 |

Full-canvas SOURCE APNG deliberately forgoes rectangle/frame-difference
optimization; its sparse/gradient output can be substantially larger than
WebP. Conversely, no fixed claim that WebP always saves space is made. GIF
may be smaller because it discarded palette/alpha information.

### Conversion benchmarks

The uncontended desktop benchmark report is
`.tools/conversion/benchmark-report.json`, generated
`2026-10-28T16:26:39.477Z`: **14 / 14 cases passed**, with no concurrent AniView
checks. Host CPU: Intel Core Ultra 7 251HX; browser: installed desktop Edge 156;
Node: v24.22.1. Values below are rounded to 0.1 ms. Decode is source decoder work; encode is
encoder calls; total includes Worker startup, transport and orchestration but
excludes procedural source-fixture generation and decode-back validation.
Source fixtures are APNG except the large-frame APNG-target rows, whose source
is WebP. All rows below had canonical RGBA peak **1**, with frame bytes equal
to `width × height × 4`. The workload is synthetic flat color, not arbitrary
photographic or noisy data.

| Source → target | Canvas | Frames | Decode ms | Encode ms | Total ms | Output bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| APNG → WebP | 320×240 | 10 | 30.9 | 10.2 | 74.2 | 2,468 |
| APNG → APNG | 320×240 | 10 | 27.8 | 13.6 | 70.4 | 16,021 |
| APNG → WebP | 320×240 | 50 | 144.5 | 25.3 | 212.7 | 9,210 |
| APNG → APNG | 320×240 | 50 | 129.7 | 63.6 | 229.8 | 79,911 |
| APNG → WebP | 320×240 | 100 | 301.4 | 47.4 | 417.1 | 16,784 |
| APNG → APNG | 320×240 | 100 | 334.5 | 134.0 | 543.3 | 161,729 |
| APNG → WebP | 320×240 | 200 | 647.2 | 98.0 | 844.5 | 30,904 |
| APNG → APNG | 320×240 | 200 | 660.1 | 299.3 | 1,068.2 | 331,656 |
| APNG → WebP | 1024×1024 | 2 | 20.0 | 26.6 | 79.2 | 9,322 |
| WebP → APNG | 1024×1024 | 2 | 7.8 | 26.7 | 67.5 | 21,982 |
| APNG → WebP | 1920×1080 | 2 | 22.7 | 47.4 | 112.3 | 14,894 |
| WebP → APNG | 1920×1080 | 2 | 14.3 | 35.2 | 87.1 | 30,921 |
| APNG → WebP | 2048×2048 | 2 | 40.4 | 89.2 | 177.9 | 36,458 |
| WebP → APNG | 2048×2048 | 2 | 25.5 | 69.3 | 129.4 | 60,297 |

The additional large sparse test (`sparse-report.json`) uses a transparent
2048×2048 canvas, two frames and a 5×5 moving object. Both targets passed:

| Source → target | Decode ms | Encode ms | Total ms | Output bytes |
| --- | ---: | ---: | ---: | ---: |
| APNG → WebP | 45.2 | 105.3 | 201.5 | 146 |
| APNG → APNG | 38.4 | 56.5 | 117.1 | 32,975 |

Both retained one 16,777,216-byte canonical frame in flight, with final active
Workers/bitmaps zero. WebP encoder capacity was 80,740,352 bytes and sampled
live allocation peaked at 67,119,240 bytes, returning to zero. APNG output
capacity was 65,536 bytes, the largest compressed chunk 4,137 bytes and the
largest frame's compressed byte count 16,350; extra filter scratch remained one
byte. Heartbeat maxima were 17.7 / 16.8 ms. Large fidelity remains sampled,
as in the other large cases. This measures the full-frame APNG size cost and
upstream WebP rectangle optimization; it does not rank the formats generally.

### Encoder allocation proxies

The corresponding browser WebP encoder measurements separate native committed
capacity from observed allocator-live checkpoints. Decoder and canonical
transport allocations are additional.

| Canvas / frames | Canonical frame bytes | Encoder WASM capacity | Max sampled live bytes |
| --- | ---: | ---: | ---: |
| 320×240 / 10 | 307,200 | 16,777,216 | 1,242,080 |
| 320×240 / 50 | 307,200 | 16,777,216 | 1,253,664 |
| 320×240 / 100 | 307,200 | 16,777,216 | 1,273,176 |
| 320×240 / 200 | 307,200 | 16,777,216 | 1,310,152 |
| 1024×1024 / 2 | 4,194,304 | 29,097,984 | 16,798,128 |
| 1920×1080 / 2 | 8,294,400 | 57,737,216 | 33,209,656 |
| 2048×2048 / 2 | 16,777,216 | 116,326,400 | 67,184,048 |

The separate direct bridge uses a different pixel pattern and therefore larger
compressed outputs. At 320×240, its 10/50/100/200-frame cases kept capacity at
16,777,216 bytes, while sampled live bytes were 1,281,576 / 1,483,448 / 1,735,960 /
2,240,760 and output grew 24,906 / 124,100 / 248,170 / 496,224 bytes. Encoder
allocator-live returned to zero after every destroy. This distinguishes bounded
pixel workspace plus growing compressed output from retaining RGBA×frameCount.
The direct large cases observed capacities 34,930,688 / 69,337,088 / 139,591,680
bytes for 1024² / 1920×1080 / 2048² respectively. Heap growth depends on content
and allocation order; a desktop flat scene is not a mobile memory ceiling.

Browser APNG measurements:

| Canvas / frames | Final output capacity | Largest compressed chunk | Max bytes compressed for one frame |
| --- | ---: | ---: | ---: |
| 320×240 / 10 | 16,384 | 1,525 | 1,527 |
| 320×240 / 50 | 131,072 | 1,528 | 1,530 |
| 320×240 / 100 | 262,144 | 1,621 | 1,623 |
| 320×240 / 200 | 524,288 | 1,644 | 1,646 |
| 1024×1024 / 2 | 41,872 | 10,352 | 10,879 |
| 1920×1080 / 2 | 32,768 | 7,521 | 15,334 |
| 2048×2048 / 2 | 65,536 | 7,920 | 29,994 |

The writer's additional scanline marker is one byte in all rows; RGBA row views
share the current canonical buffer. The table excludes native deflate workspace
and does not imply that the largest delivered chunk bounds native allocations.

The seven tiny scene cases also include deterministic full-change noise and
gradient content. No large-noise performance or native-memory maximum was
measured; the flat-scene tables above must not be treated as that maximum.

## Regression, bundle and deployment boundaries

Default decoder exports and requests remain compatible. The bridge regression
uses the pre-existing WebP decoder. APNG's exact-RGBA extension is opt-in and
does not route normal Viewer playback through the new helper. Ordinary Viewer
and Creator entry points do not import the conversion coordinator or APNG/WebP
encoder classes. The encoder Worker selects a target via dynamic imports, but
Vite's physical engineering encoder-Worker bundle currently inlines the three
encoder cores. It loads WASM only when WebP is selected; it does not fetch
separate target JS chunks. Existing Creator's GIF encoder remains its separate product
path and must continue to pass its own regression tests.

The engineering artifact uses its own Vite configuration, `/AniView/` base,
Worker-relative URLs and bundled WASM URL. It does not overwrite `dist/` and
copies the existing third-party notice asset. Measured payloads of the current
build, before/gzip, are:

| Artifact | Bytes | Gzip bytes |
| --- | ---: | ---: |
| Ordinary application entry JS | 289,955 | 87,899 |
| Existing Creator GIF Worker | 24,191 | 9,240 |
| Engineering conversion entry JS | 24,044 | 7,236 |
| Engineering combined-target encoder Worker | 45,991 | 16,013 |

The ordinary Worker in this table belongs to the existing Creator; its filename
alone is not evidence of conversion eager loading. Import boundaries and the
separate engineering entry establish that distinction. The actual ordinary
startup network record contains only the application CSS and entry JS, both
HTTP 200; it contains no conversion entry, encoder Worker or WASM request.
There has been no Pages deployment or production
conversion-navigation change for this spike.

## Licensing and privacy

New APNG/container, canonical/coordinator and adapter code is AniView-owned
project code under the current `UNLICENSED` policy. No project license is chosen
on the user's behalf. Existing libwebp 1.6.0/Emscripten license texts, patents
notice and third-party notices remain applicable and unchanged. GIF reuses the
existing gifenc dependency; no new APNG runtime or reference-test dependency is
introduced. Build tooling stays ignored under `.tools/` and is not a production
runtime dependency.

All decoding, encoding and diagnostics are local. The harness records numeric
metadata and local procedural fixtures, with no telemetry or remote media API.
No user filename, media content or archive password is sent to another service.
No ICC/EXIF/XMP metadata, original compression structure, original palette or
source container chunks are promised in converted output.

## Fresh Android gate and remaining decisions

Fresh **Android Edge and Quark** evidence has been received for the production
engineering preview without HMR. The small and medium sets each exercise
GIF→WebP, GIF→APNG, APNG→WebP and WebP→APNG. Quark's small set includes four
complete PASS records; its medium set has overall PASS with a partially pasted
middle. The user reports completing all three Edge portions but cannot provide
the full JSON because of the phone's text limit. No missing measurements are
filled from another browser or inferred as independently executed tests.

The [Android validation record](milestone-8b1-android-validation.md) separates
complete numeric evidence, partial Quark evidence and the Edge user report.
The user subsequently confirmed Edge small/medium PASS, Worker deflate=true
and final activeWorkers/activeBitmaps/cleanupErrors=0. Both browsers' cancel /
small-rerun and stability checks were reported without issues, including no
jank, page reload or crash. This closes the fresh Android gate. Missing Edge
timing/output numbers and missing Quark middle fields remain unreported;
the acceptance is user-reported device evidence, not an independent remote
execution. Earlier 8A1/8A2 evidence was not substituted.

Known limitations remain explicit:

- WebP can coalesce identical frames; exact original frame count is not a
  universal guarantee. Single-visual-frame duration/plays are preserved by the
  small container wrapper.
- General APNG fallback uses existing Canvas composition and may alter straight
  RGB at semi-alpha or hidden RGB. Only the narrow direct path and independent
  writer oracle establish stored-byte precision.
- GIF palette/binary alpha and short-duration normalization are lossy target
  behavior, with errors recorded rather than described as lossless.
- Synthetic desktop timing, 64-pixel large-case sampling and native allocation
  checkpoint proxies are bounded evidence, not whole-file perceptual guarantees
  or exact browser-process memory measurements.
- Full-canvas filter-0 APNG prioritizes correctness and bounded streaming over
  file size; adaptive filtering and rectangle optimization are deferred.

The common canonical frame stream is **suitable as the shared conversion
backbone for GIF/APNG/WebP and future video work**: it separates source
composition, ownership/backpressure and target encoding. This conclusion does
not choose a video codec/muxer or implement video support. The required Android
gate has now passed; later productization must carry the measured WebP
coalescing limitation forward. No 8B2 product work was performed here.
