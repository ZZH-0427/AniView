# Milestone 8A1 — Static frames to GIF encoder spike

Status: **Milestone 8A1 PASSED (2026-10-25)**. Desktop gates and new user-reported
Android Edge/Quark acceptance passed. Encoder verdict: **ACCEPT WITH LIMITATIONS**.
This is an isolated V0.2 experiment, not a creation feature. No M8A2 product work is included. The feature branch is
`feat/v0.2-static-to-gif`; main, the v0.1.0 tag and production Pages stay at
`4a3dc69542ca2923744904cd10ddbf1a35f36ff9`.

## Reproduce locally

Use the installed Node 24/npm environment and an installed Edge browser:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:gif-spike
npm run build:gif-spike
```

The automated engineering harness starts and stops a loopback Vite server and a
fresh installed Edge profile. It downloads no browser. `BROWSER_PATH` can select
an already-installed browser. Results, GIFs, source-versus-output PNG comparisons
and browser profiles are ignored under `.tools/gif-encoder/`.

The experiment is `/AniView/experiments/gif-encoder/?debug=1` on the development
server. It has no link in application navigation. `npm run build` includes no
encoder entry, worker or gifenc chunk. `npm run build:gif-spike` instead writes
the separate `.tools/gif-encoder-site/` artifact, including full third-party
notices; it must not replace production `dist/` or be deployed to production
Pages. No root-hosting assumption is introduced.

## Architecture and ownership

```text
caller-owned VirtualFile[]
  -> StaticGifEncoder (main: source reads on demand, progress, abort, result)
  -> one dedicated module Worker
  -> BinaryFormatDetector -> inspectStaticDimensions
  -> sequential native dimension/orientation scan, close each ImageBitmap
  -> max oriented width x max oriented height, validate combined canvas/work
  -> for each source, in array order:
       native ImageBitmap decode -> draw centered -> bitmap.close()
       -> one Canvas ImageData/RGBA -> quantize -> indexed pixels/palette
       -> GIF writeFrame -> drop frame temporaries
  -> finish -> transfer output capacity buffer + exact valid byteLength
  -> caller can construct Blob(image/gif) over the exact byte range
```

The encoder does not import or modify `MediaSession`, Player, Renderer or the
GIF decoder. It reuses binary detection, static dimension guards, resource
diagnostics and the existing GIF decoder for validation. It deliberately does
not use `StaticImageSource`, whose main-thread Viewer bitmap lifetime is a
different ownership boundary. Both paths request `imageOrientation: 'from-image'`.

Only a current native bitmap, one reusable output Canvas, one full RGBA frame,
one indexed frame, current palette and bounded vendor workspace are needed.
The bitmap is closed **before** `getImageData`, so it does not overlap that
frame's RGBA allocation at the application ownership level. Dimension metadata
is O(frame count); decoded pixel retention is O(output canvas size). The encoded
GIF buffer grows with output; no decoded frame list is retained. Source File/Blob
handles remain caller-owned and are not an encoded-byte cache created by the
encoder.

Source reads transfer their ArrayBuffer into the Worker. Blob construction for
native decode can copy encoded bytes. A dimension scan decodes and closes each
source, then the encoding pass decodes it again to obtain exact oriented sizes
without retaining pixels. `decodeMs` includes **both passes' native decode time**;
reading, signature checks, Canvas drawing and event-loop yields are included
only in `totalMs`.

`peakRgbaFrames`, `peakFrameBytes` and `peakBitmaps` are logical ownership proxies,
not heap, browser RSS or GPU measurements. Even closed/dereferenced resources
can remain allocated until browser GC or native allocator reclamation. Canvas
backing, codec workspace, histogram/heap objects and Blob copies are additional.

## Geometry, palette, alpha and timing

Output dimensions are the independent maximum oriented width/height. Sources
retain native size, with `floor((output - source) / 2)` integer offsets; an odd
padding pixel falls on the right/bottom. No scaling or cropping takes place.
Every frame clears the full dedicated Canvas to transparent black first.

Palette size candidates are 256, 128 and 64 **including** reserved transparent
index zero. First frame supplies the global table; following frames supply local
tables. Full-canvas GIF frames always use disposal 2. Opaque pixels cannot map to
the transparent index, including opaque black. Source alpha <= configurable
threshold (experimental default 127) becomes transparent, otherwise opaque.
Semi-transparent edges therefore become hard alpha edges; GIF cannot preserve
their original blending.

The adapter enforces the alpha mask itself. gifenc's palette-alpha quantization
does not guarantee the original pixel threshold. Transparent RGB is replaced
in place with the first opaque color before RGB565 quantization, then its indexed
mask is restored. This avoids another RGBA compaction buffer but increases that
color's histogram weight for heavily padded images. This is a documented quality
tradeoff. There is no dithering implementation or temporal palette optimization.

gifenc rounds requested delay with `Math.round(ms / 10)` centiseconds. The
experiment admits 20–655350 ms, avoiding AniView's existing <20 ms GIF playback
normalization. Requested 20/100/250/500/1000 ms round-trip exactly in the tests;
27 ms becomes 30 ms. The 500 ms test default is not a permanent product decision.

| AniView request | gifenc repeat | Existing decoder normalized loopCount |
| --- | ---: | ---: |
| Forever | 0 | 0 (unbounded) |
| Once | -1, omit Netscape extension | 1 total play |
| Repeat N extra times | positive N | N + 1 total plays |

## Cancellation and protocol

Messages carry a generation ID: start, source request/response, source-error,
progress, result/error and cancel. Progress includes a phase and current/total
frames, plus global completed/total work across scan and encoding passes. Global
work never decreases; phase-local frame counts stay in range. No filename or
media bytes are transmitted to a remote service.

The Worker yields between scan, decode, quantization and writes to observe cancel.
Native bitmap decode and synchronous vendor quantization cannot be interrupted
mid-call. Cooperative cleanup closes a late bitmap, shrinks Canvas backing and
drops encoder/frame references; a 100 ms cancellation watchdog then terminates
the entire Worker if needed. Ordinary completion/error also terminates it.
JS buffers are dereferenced, not explicitly freed. Worker termination delegates
native allocation cleanup to the browser.

Results from cancelled generations cannot resolve replacement jobs. Because
VirtualFile.read() has no abort contract, a shared read gate drains its one
pending read before a replacement can allocate another source buffer. Cancel
can still return promptly. A broken source adapter whose read never resolves
prevents subsequent source reads; the new Worker fails by its 30 s inactivity
deadline. The encoder never calls caller-owned VirtualFile.release().

Errors distinguish animated input, unsupported static format, read failure,
native decode failure, resource limits, quantization, encoding, cancellation
and Worker/runtime failure. GIF/APNG/animated WebP are explicitly rejected,
including wrong extensions; no implicit first-frame extraction is used.

## Safety ceilings versus product recommendations

The spike reuses the existing 64 MiB encoded-per-source, 4,194,304-pixel and
16,384-side static safety ceilings. Combined output dimensions are checked even
when each source individually fits. It also keeps output <=64 MiB, metadata
<=10,000 frames and full-canvas frame work <=1 GiB RGBA, matching the existing
GIF reader's round-trip admission. These are engineering ceilings, not measured
phone capacity or recommended M8A2 defaults. A check after a synchronous write
cannot preclude a final-frame overshoot allocation; output buffer growth and
workspace remain part of the risk budget.

## Android acceptance procedure (new results required)

Nothing is deployed to the production website. On the Windows computer, use:

```powershell
npm run spike:gif -- --host 0.0.0.0
```

Connect the phone to the same trusted Wi-Fi and open
`http://<computer-LAN-IPv4>:4198/AniView/experiments/gif-encoder/?debug=1` in
**Android Edge and Quark**. The OS firewall must allow this temporary development
server on the private network. This is local testing, not a public hosting change.
If the phone cannot reach the computer or reports a missing Worker/Canvas/bitmap
capability, record the actual error; do not infer a phone pass from desktop.

In each browser, first run **40 small frames**, then **10 × 1024²** only if the
smaller job succeeds. Sources are generated locally and no media upload occurs.
Observe the live heartbeat/cancel controls; report success, wall time, tab
responsiveness, any reload/crash/memory-pressure behavior and copy each result
JSON. Test Cancel once, then rerun the small job. Stop escalating if the browser
or OS reloads the tab. There is no product Download, reorder, duration editor,
conversion or preview workflow. The old v0.1 Android results do not cover this
new encoding path.

## Evidence and decision

The executable desktop suite produces `.tools/gif-encoder/report.json` and
comparison artifacts. The new real-device Android Edge and Quark gate passed by
user report on 2026-10-25. The Android evidence below is specific to this spike;
it does not reuse the earlier v0.1 Viewer acceptance.

Dependency provenance and full license retention are documented in
[the gifenc spike licensing audit](gif-encoder-licensing.md). AniView itself stays
`UNLICENSED`, private npm metadata stays true, and the package version stays 0.1.0.

## Desktop evidence (2026-10-25)

Installed Windows Node **v24.22.1**, npm **11.19.1** under `D:\tool\nodejs` were
used throughout. Clean `npm ci`, lint, typecheck, **43 files / 552 tests** and the
normal production build passed. This retains the existing 494 tests and adds
58. A workspace-local npm cache initially stalled downloading dependencies;
the completed clean installation used the established npm cache with
`--prefer-offline --fetch-retries=0 --fetch-timeout=30000`. No temporary Node was
used, no package-manager switch occurred and no tests/rules were disabled.

Installed **Edge 156** passed **23** core browser groups, **nine** quality cases
and **eight** benchmark workloads. The generated GIF opened in the unchanged
real Viewer: Play, Pause, Previous/Next Frame and repeated loop transitions all
worked. No observed page errors or runtime resource 404s occurred. JPEG, PNG,
static WebP, mixed formats, wrong extension, EXIF orientation 6, transparent and
semi-transparent PNG/WebP, exact geometry/order/timing/loop metadata, animation
rejection, corrupt JPEG and cancel/recovery were exercised. Unit tests additionally
cover stale results, source-read serialization, source/canvas guards, missing
capabilities, Worker failures and late native bitmap cleanup.

Native Worker instrumentation recorded one live bitmap maximum and zero after
completion/error, with all created bitmaps closed. All successful result buffers
were detached after transfer. The main-thread Worker probe recorded **75 created /
75 terminated / active 0 / peak 1**, and **892 / 892** source transfers detached.
Main-thread RuntimeDiagnostics bitmaps stay zero because encoder bitmaps are
Worker-owned; their independent instrumentation, not that zero main-thread count,
is the bitmap evidence. No archive sessions were created.

### Performance

Single runs on this desktop, in milliseconds; not phone latency promises. Source
generation and decode-back validation are outside encode `total`. Decode includes
the two sequential native passes. Other work explains why total exceeds the
three listed phase sums. Inputs are original generated images.

| Canvas | Frames / source | Decode | Quantize | GIF write | Total | GIF bytes | Final capacity |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 320×240 | 10 PNG, flat | 14.8 | 16.5 | 7.6 | 53.3 | 53,007 | 65,536 |
| 320×240 | 50 PNG, flat | 62.7 | 52.7 | 19.2 | 188.3 | 265,280 | 524,288 |
| 320×240 | 100 PNG, flat | 131.6 | 100.8 | 36.1 | 378.2 | 530,577 | 1,048,576 |
| 320×240 | 200 PNG, flat | 228.9 | 189.9 | 70.5 | 685.7 | 1,061,230 | 1,179,648 |
| 1024×1024 | 2 PNG, gradient | 57.3 | 22.4 | 23.3 | 119.4 | 274,777 | 524,288 |
| 1920×1080 | 2 PNG, gradient | 112.2 | 37.3 | 35.2 | 213.4 | 489,147 | 524,288 |
| 2048×2048 | 2 PNG, gradient | 213.9 | 70.2 | 56.2 | 390.7 | 896,731 | 1,048,576 |
| 64×48 | 2 WebP, one padded with 16 MiB JUNK metadata | 50.0 | 4.5 | 0.8 | 71.1 | 4,619 | 8,192 |

The metadata workload had **16,780,148 source bytes**. It tests sequential large
encoded-byte handling, not equivalently complex photographic data. The worst
main-thread 16 ms heartbeat gap during these eight encodes was **17.8 ms**;
the desktop harness enforces <250 ms and continued updating throughout.

The separate built artifact also executed through its `/AniView/` paths in Edge:
**40×320×240: 174.3 ms**, **10×1024²: 281.6 ms**, with four total Workers created
and terminated, all 100 source transfers detached, peak one bitmap and no remaining
bitmap/Worker. These are explicitly desktop runs of phone-sized workloads.

### Quality and transparency

RGB errors are per-channel 0–255, measured against actual native-decoded source
pixels on **the first** of each three-frame sequence. All three frames were
decode-back checked; the numbers are not a temporal quality metric. Every tested
alpha mask matched exactly, including source alpha 127 versus 128 and transparent
padding following an opaque frame. A soft-alpha circle becomes a hard-edged,
smaller opaque silhouette as expected; semi-transparency is not preserved.

| Sample | Colors | Mean absolute RGB | P95 error | Maximum error | GIF bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flat/anime-style | 256 | 0.205 | 2 | 11 | 17,717 |
| Flat/anime-style | 128 | 0.204 | 2 | 12 | 16,162 |
| Flat/anime-style | 64 | 0.192 | 2 | 12 | 14,433 |
| Gradient | 256 | 2.853 | 8 | 12 | 66,204 |
| Gradient | 128 | 2.821 | 8 | 12 | 60,150 |
| Gradient | 64 | 2.709 | 8 | 16 | 52,113 |
| High-color textured landscape | 256 | 3.514 | 8 | 18 | 236,180 |
| High-color textured landscape | 128 | 4.042 | 10 | 21 | 192,788 |
| High-color textured landscape | 64 | 4.771 | 12 | 26 | 151,417 |

Source/output PNG contact sheets were actually inspected. Flat fills/line art
are visually close, with slight skin-gradient quantization. The gradient has
**clearly visible contour bands and color steps even at 256 colors**; low average
RGB error does not establish visual equivalence. The high-color sample retains
recognizable texture at 256 with subtle sky shifts; 64 colors shows stronger
sky band boundaries and loss. It is an original procedural photographic-style
proxy, not a camera photograph or a broad natural-photo validation set. These
results support simple flat-color animation creation, not high-fidelity gradient
or photographic export. No dithering was added to hide this limitation.

### Memory and output copies

At 2048² the one RGBA buffer is **16,777,216 B**, indexed pixels **4,194,304 B**
and Canvas backing nominally another **16,777,216 B**: about **36 MiB** before
encoded source/Blob copies, palette/histogram/heap/codec/browser overhead and
output capacity. The bitmap phase instead has Canvas+one bitmap; it is closed
before RGBA readback. This is a nominal allocation model, not measured RSS.
At 320×240, peak RGBA stayed **307,200 B** for 10, 50, 100 and 200 frames;
only small metadata and the encoded output grew.

gifenc starts at 4,096 bytes, doubles below 1 MiB and grows by 1.125 above it.
During growth old/new capacity coexist until GC. The 200-frame output's last
growth can transiently overlap **1,048,576 + 1,179,648 = 2,228,224 B** of output
allocation. Quantizer RGB565 bins/JS heap and palette-map workspace are additional;
typed LZW scratch is 40,280 B. `bytesView()` supplies the backing buffer; no
`bytes()` copy occurs. The main thread receives the full capacity allocation and
constructs an immutable Blob from only `[0, byteLength)`, which can require one
platform byte copy. Test-only decode-back `slice()` and contact-sheet copies do
not belong to the encoder path. No output tail bytes are saved as GIF data.

### Bundle and production protection

The standalone encoder Worker is **21,455 B / 8,419 B gzip**; harness entry
**34,866 B / 13,437 B gzip**, existing GIF decoder Worker **13,043 B / 5,229 B
gzip**. Experimental complete notices are **59,364 B**. These are separate from
ordinary Viewer startup. Upstream ESM alone is 9,098 B / 3,926 B gzip.

All **ten** normal Viewer JS/CSS/Worker/WASM assets match the pre-spike release
build SHA-256 exactly; main JS remains 288,764 B / 87,482 B gzip. The experiment's
generated GIFs/screenshots/results are ignored rather than committed as fixtures.
No PLAN.md, AGENTS.md, existing decoder/Viewer runtime, production notice collection,
deployment workflow, v0.1.0 tag or release was changed.

### Candidate M8A2 limits and encoder verdict

Initial recommendations, **not final product policy**. The broader ceilings are
desktop evidence; the smaller phone workloads below do not validate every ceiling:

| Candidate | Proposed ceiling | Actual basis |
| --- | ---: | --- |
| Sources | 200 | 10/50/100/200 at 320×240 all completed with one decoded frame |
| Output pixels | 4,194,304 | Two 2048² frames completed; not 200 large frames |
| Output side | 2,048 | Largest tested side, deliberately narrower than Viewer metadata limit |
| Aggregate source bytes | 16 MiB | 16,780,148-byte metadata-heavy WebP workload passed on desktop; not phone-validated |
| Frame-pixel workload | 15,360,000 | 200×320×240 measured on desktop; Android also passed 10×1024² below this |

These limits apply together, so 200×4 MP is excluded. Both phone browsers passed
40×320×240 and 10×1024², but not 200 frames, 2048² sources or 16 MiB of source
bytes. M8A2 must confirm its final defaults instead of promoting all desktop
ceilings to proven phone limits.

Encoder verdict: **ACCEPT WITH LIMITATIONS**, for a flat-color first creation
workflow. Android Edge and Quark have passed the required small-scale spike.
The gradient banding prevents a general high-quality encoding claim; if smooth
gradients or photographic fidelity are required for the first product, this
candidate should be rejected for that requirement and a separate encoder
selection undertaken. No alternate encoder is installed here.

## Android acceptance (2026-10-25)

The user explicitly reported both browsers passed and supplied four result JSON
snapshots from the isolated experimental build of implementation commit
`13e35f5f466336bbd52a1970a34d9cf2feed8c8f`. Original numeric values and complete
reported user agents are retained in
[the Android results](milestone-8a1-android-results.json). These are user-reported
real-device results, not an independently observed mobile browser session.

The local page was initially unreachable from the phone. The same preview was
restarted outside the restricted agent environment, without changing Windows
firewall rules or production hosting; the subsequent user runs succeeded. This
sequence does not prove a specific network-level cause of the earlier failure.

| Browser | Workload | Decode ms | Quantize ms | Write ms | Encode total ms | GIF bytes | Max heartbeat gap ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Quark 10.2.0.995 / Chrome 123 UA | 40×320×240 | 262.6 | 209.8 | 73.4 | 1590.0 | 210,513 | 17.5 |
| Quark 10.2.0.995 / Chrome 123 UA | 10×1024² | 257.8 | 275.9 | 158.8 | 1107.6 | 183,622 | 16.6 |
| Edge Android 153 | 40×320×240 | 194.6 | 107.9 | 46.5 | 512.0 | 144,521 | 17.1 |
| Edge Android 153 | 10×1024² | 267.9 | 228.7 | 138.8 | 792.6 | 183,622 | 18.1 |

Every snapshot reported PASS, `peakRgbaFrames = peakBitmaps = 1`,
`outputCapacity = 262144`, `activeWorkers = 0`, `peakWorkers = 1`, and zero
decoder/static/archive/cleanup errors. Per-frame RGBA proxies were 307,200 B for
the small workload and 4,194,304 B for the larger one. Heartbeat counts were
101/73 for Quark and 34/51 for Edge respectively, supporting continued main-thread
event-loop activity during encoding. Total includes reads, Canvas work and
yield/scheduling overhead as well as the three measured phases; it excludes
test-source generation and GIF decode-back.

Workers created/terminated were 2/2 in both supplied Quark snapshots, 2/2 in the
small Edge snapshot and 8/8 in the large Edge snapshot. These are page/session
counters: they are retained as supplied, not added across snapshots or interpreted
as evidence of a particular number of cancellations. Main-thread bitmap counters
are zero because native encoder bitmaps live in the Worker; those counters alone
do not establish native bitmap cleanup. The per-job peak proxies and desktop
Worker instrumentation remain the applicable ownership evidence.

Source bytes were 726,622/871,043 in Quark and 754,774/1,782,609 in Edge. Sources
are generated by each browser's native Canvas encoder; these are not identical
encoded inputs across engines. Output sizes and timings are individual observed
runs, not a controlled browser ranking or a universal encoding-speed promise.
The Edge UA's Android 10/K fields are preserved without inferring a physical
device model or actual OS version from reduced user-agent fields.

No crash, reload, memory-pressure issue or other abnormality was reported with
the user's pass. Separate manual touch observations and Cancel→rerun outcomes
were not individually enumerated, so no extra mobile cancellation measurement
is inferred. Cancellation, stale results and cleanup remain covered by the
desktop/browser/unit gates. No Android heap/RSS measurement, 200-frame phone
stress or 4 MP phone encoding pass is claimed.

**Milestone 8A1: PASSED.**

**Ready for Milestone 8A2 — Multiple Static Images → Animated GIF Productization.**
M8A2 has not started. The feature branch remains isolated; no merge, production
deployment, new tag or release is included in this closure.
