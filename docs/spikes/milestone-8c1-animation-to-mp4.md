# Milestone 8C1 — Animation → MP4/H.264 technical spike

**PENDING ANDROID VALIDATION.** Desktop implementation/validation complete;
real Android Edge and Quark results are required before architecture acceptance.
8C2 and 8D1 have not started. V0.2 is not released.

## Branch and dependency provenance

Research-only commit `ff7aafdd2d80535e41be7ee7475d4a36e5332c81` was created
and synchronized on `feat/v0.2-static-to-gif` before video implementation.
`feat/v0.2-animation-to-video` was then created from that complete feature state,
including 8A1/8A2/8B1/8B2. No work was based on or merged into main.

Mediabunny is fixed to **1.65.0** in npm metadata and lockfile. Its only added
transitives are TypeScript declaration packages `@types/dom-mediacapture-transform`
and `@types/dom-webcodecs`; neither supplies another runtime codec. MPL-2.0 source
availability and full text are recorded in [third-party notices](../../THIRD_PARTY_NOTICES.md)
and `third_party/licenses/mediabunny/`. Covered upstream files are unmodified.
Only public APIs are used. AniView remains `UNLICENSED`; MPL compliance does not
settle AVC patent/commercial distribution obligations. No FFmpeg, MediaRecorder,
codec polyfill or new WASM binary was introduced.

## Architecture and ownership

```
GIF/APNG/WebP existing decoder Worker
 → existing AnimationFrameSource
 → unchanged full straight-RGBA canonical frame
 → main-thread transfer/accept broker (no pixel loop)
 → dedicated Video Worker:
     cumulative µs timeline → white composite/pad → VideoFrame
     → native VideoEncoder(AVC)
     → Mediabunny EncodedVideoPacketSource / MP4 Output / BufferTarget
 → same Worker: MP4 Input / VideoSampleSink / native decoder readback
 → transferred MP4 → local Blob URL → native video playback
```

The broker never branches on source format. No Player, Decoder, MediaSession,
CreationSession or canonical types/limits were changed. The encoder consumes one
canonical frame at a time, transfers it rather than copying through the broker,
and acknowledges only after target acceptance and buffer detachment. No full
decoded-frame history is retained. Only ≤256 RGB samples/frame (≤153,600 bytes
for 200 frames), timestamps and durations are retained privately for readback;
no pixels are put in diagnostic reports. Source resources close before native
encoder flush/finalization/readback. Readback is sequential and closes each
sample and owned VideoFrame in `finally`.

Unlike the research sketch's VideoSampleSource convenience path, this spike owns
native VideoEncoder directly and feeds the public encoded-packet API. This makes
WebCodecs queue pressure, native µs timestamps, ownership and the distinction
between encode and mux errors observable without patching Mediabunny. It does
not duplicate source decoders or fork the library.

## Native capability and AVC settings

API presence, per-configuration support, encoder configuration success, real
encoded packets + decoderConfig, successful MP4 mux, decode-back and native
playback are separate checks. A successful `isConfigSupported` is never called
a successful encode. Probe/encoding happen inside the Worker in a secure context.

Candidates prefer constrained baseline, then AVC Main/High if the first profile
is unavailable; no other codec/container fallback. Dimensions/bitrate/level are
part of every exact probe. Requested codecs are `avc1.42e01f`, `avc1.42e028` or
`avc1.42e032` for tested sizes, followed by corresponding `4d00` / `6400` profiles.
Level selection accounts for macroblocks and configured bitrate (3.1 / 4 / 5).
Bitrate = clamp(width ×height ×30 ×0.18, 500,000, 20,000,000) bit/s. The reference
30 sets capacity, not a CFR grid: **no framerate field is supplied**.
`hardwareAcceleration: 'no-preference'`, `latencyMode: 'quality'`, AVC packet
format `avc`; keyframes first and at ≥2 seconds. Native hardware/software choice
is not assumed. Actual desktop tracks remained constrained baseline, e.g.
`avc1.42c00d`, `avc1.42c015`, `avc1.42c02a`, `avc1.42c032`; actual SPS level can
differ from the requested capacity. The report records both.

Absent APIs, rejected configuration, initialization, frame/encode/mux/readback
failure, output/workload limits, cancellation and Worker failure have distinct
typed categories. Native failure never triggers an undeclared alternate codec.
The tiny original APNG fixture's 4×2 coded size was rejected by native config
support. No automatic enlargement was added to conversion. Desktop composition
tests therefore enlarge source fixture rectangles/offsets before decoding;
the actual canonical→video path receives the enlarged animation unchanged.

## Timing, one cycle, and audio

Kahan cumulative canonical milliseconds →round cumulative boundary to integer
microseconds →duration =next boundary −previous boundary. This avoids repeatedly
rounding fractional durations independently. Starts at zero, strictly positive
durations, no FPS resampling or hold/drop/reorder, one decoded cycle only.
Source playCount 0/1/5 all produce the same three-frame, one-cycle MP4. No audio
track is added. Existing GIF normalization still applies before canonical:
raw sub-20ms delays normalize to 100ms, and GIF's own centisecond quantization is
not falsely attributed to MP4. APNG/WebP include 1/10/20/27/33/41/100/250/500/1000ms.

Mediabunny packet time is seconds; native WebCodecs time is µs. Each native
encoded chunk is paired with its original integer timestamp/duration before
muxing. MP4's 57,600Hz timebase causes bounded rounding. Actual full desktop
maximum errors: **timestamp 7µs, per-frame duration 14µs, total duration 10µs**.
The readback gate is 50µs (<3 ticks), including a real 1ms frame; it does not use
a 1ms tolerance that could conceal losing that frame. Unit tests additionally
cover fractional cumulative boundaries, invalid/sub-µs durations, and overflow.

## Alpha and dimensions

All RGBA is straight alpha. Each RGB channel is composited onto fixed white by
round((RGB ×alpha +255 ×(255−alpha))/255), output alpha=255. Opaque pixels stay
unchanged; fully transparent hidden RGB becomes white; partial alpha is blended
once. No VP9/alpha product path. Even dimensions composite in the transferred
buffer. Odd dimensions allocate one padded scratch buffer, white-filled, copy
all original pixels, and pad **right/bottom only** to even coded dimensions.

319×241 →320×242 and 1221×1729 →1222×1730 both encoded, decoded and played.
Source dimensions remain in the report; no crop/stretch/rescale. MP4 display
dimensions are the padded coded dimensions for this spike (no clean-aperture
metadata). The one-pixel white edge can blur through lossy 4:2:0 chroma coding.
Pre-encode padding/compositing is exact in unit tests; decoded RGB is lossy.
Desktop visual inspection of native-video screenshots found the white background,
soft red-circle edges, gradient, complete odd frame and photographic motion
consistent with this policy. Native-control shading is a player overlay.

## Backpressure, memory, and cancellation

Unchanged guards: 200 frames, side2048, 4,194,304 pixels/frame,
15,360,000 cumulative frame-pixels, 64MiB source/output limits. Additional spike
cycle-duration cap: **30 seconds**, to bound native encoder time/frame-reference
exposure and avoid pretending 200 very long-delay frames are a tested workload.
This is conservative engineering scope, not a final product policy.

Observed canonical in-flight≤1, JS-owned VideoFrame peak1, encodeQueueSize≤2.
Frame closes immediately after `encode()`; waits on `dequeue` before pulling
more when queue≥2, and awaits serialized packet/mux work. WebCodecs control queue
size and owned-frame counters **do not measure native reference surfaces or total
process/GPU memory**. During inspection the encoder is closed; source-decoder
workspace is already gone. Odd padding adds one full RGBA scratch only. An
internal native conversion/reference surface can still exist; zero-copy is not
claimed. Direct RGBA avoids the extra application Canvas/ImageBitmap surfaces.

Default MP4 fastStart=false avoids the library's separate in-memory fast-start
packet retention. BufferTarget still buffers encoded output; it is not a streaming
or File System Access target. Encoded payload is rejected before packet copying
at 64MiB−1MiB, reserving mux overhead; target high-water and final length also
guard 64MiB. Largest observed output **141,040 bytes**. BufferTarget's write event
fires after internal allocation/write, so the cap is **not** a strict transient
heap ceiling: growth capacity, native encoded chunks and final array copies can
temporarily coexist. A true near-64MiB stress allocation was not exercised;
early budget rejection is tested with a simulated oversized native chunk.

Encode-stage cancellation occurs after one frame of a 20-frame job. Actual
finalizing cancellation uses a separate engineering Worker holding Mediabunny's
public `onFinalize` callback after mux finalization begins. `Output.cancel()`
alone cannot interrupt that state: the client rejects the pending request and
terminates the dedicated Worker. Old ids/results are ignored; a new Worker
successfully reruns. Normal paths close owned native handles in `finally`;
termination reclaims the whole realm. The spike does not invent post-termination
JS close events or claim visibility into all native handles.

Full desktop run: 32 cases =30 encoded/decode-back/native-playback successes +2
expected cancellations; 91 Workers created/terminated, zero active Workers,
bitmaps, archives and cleanup errors after Close; result object URLs revoked.
Source bitmap generation/readback and native `<video>` internals are not all
counted by main-thread runtime counters, so those counters are not total memory.

## Fidelity and construction path

Quality comparison is against canonical source after white composite, not the
pre-GIF-quantization artwork. It measures 256 evenly spaced RGB pixels/frame,
not every pixel or a perceptual/PSNR guarantee. Experimental ordinary-scene gate:
mean≤8, p95≤30 channel units. Flat:1.267/2, gradient:1.419/3, sparse:0.015/0,
soft alpha edges:0.245/1, procedural landscape:1.505/4, actual photograph:3.579/12.
The photographic fixture is NASA Apollo17 AS17-148-22727, resized/translated only
when generating the test animation. Image courtesy of the Earth Science and
Remote Sensing Unit, NASA Johnson Space Center; [source](https://www.nasa.gov/image-article/blue-marble-view-from-apollo-17/),
[usage guidance](https://eol.jsc.nasa.gov/FAQ/default.htm). The downloaded JPEG and
generated media are ignored local test artifacts, not redistributed fixtures.

Deliberate pixel-frequency mixed-alpha/chroma stress reports **FIDELITY
LIMITATION**, not a visual-quality pass: GIF mean25.827/p9587; APNG/WebP
22.645/73. Native lossy 4:2:0 AVC cannot preserve these alternating pixel colors.
Codec/mux/timing/playback still succeed. Increasing bitrate does not eliminate
chroma subsampling. This architecture is not lossless animation preservation.

Five 320×240 construction iterations: rawRGBA0.3ms, OffscreenCanvas1.0ms,
ImageBitmap0.6ms on this desktop. These tiny totals are a comparative smoke,
not a statistically reliable throughput result. Raw needs no extra application
Canvas/bitmap; alternatives need one surface/bitmap. ImageData itself is not a
CanvasImageSource: its `.data` can use the raw-buffer overload. Raw is retained
for ownership simplicity. No OffscreenCanvas fallback is silently selected by
the video adapter. The inherited APNG decoder can still legitimately use Canvas
for source composition.

## Desktop benchmark

Installed headless Edge156 on Windows. Measurements exclude source-fixture
generation; pipeline total includes source decoding, Worker startup, encoder,
mux and mandatory decode-back. Encode-phase wall includes waits for following
source frames and native flush, not just native CPU. Decode/encode overlap, so
stage timings are not additive. Single-run values are not mobile predictions.

| Case | Source size ×frames | Pipeline ms | Encode wall ms | MP4 bytes | Mean /p95 RGB | Queue peak |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| VFR gif | 320×240 ×10 | 67.3 | 16.0 | 122283 | 25.8 /87 | 0 |
| VFR apng | 320×240 ×10 | 217.7 | 129.3 | 102509 | 22.6 /73 | 0 |
| VFR webp | 320×240 ×10 | 76.0 | 18.2 | 102509 | 22.6 /73 | 0 |
| solid | 320×240 ×10 | 98.7 | 36.1 | 4493 | 0.6 /1 | 0 |
| transparent | 320×240 ×10 | 83.5 | 35.2 | 1397 | 0.0 /0 | 0 |
| flat | 320×240 ×10 | 92.0 | 34.3 | 3843 | 1.3 /2 | 0 |
| gradient | 320×240 ×10 | 251.3 | 154.5 | 21905 | 1.4 /3 | 0 |
| sparse | 320×240 ×10 | 88.8 | 36.8 | 2662 | 0.0 /0 | 0 |
| photo-like | 320×240 ×10 | 67.8 | 18.0 | 21398 | 1.5 /4 | 0 |
| photographic Apollo17 | 320×320 ×10 | 108.7 | 38.3 | 29779 | 3.6 /12 | 0 |
| soft edges | 320×240 ×10 | 84.7 | 35.1 | 13337 | 0.2 /1 | 0 |
| benchmark 320 10 | 320×240 ×10 | 93.4 | 40.1 | 3827 | 1.3 /2 | 0 |
| benchmark 320 50 | 320×240 ×50 | 256.6 | 182.6 | 16393 | 1.2 /2 | 0 |
| benchmark 320 100 | 320×240 ×100 | 493.9 | 399.9 | 34356 | 1.2 /2 | 0 |
| benchmark 320 200 | 320×240 ×200 | 955.9 | 786.7 | 66335 | 1.2 /2 | 0 |
| dimensions 1024x1024 | 1024×1024 ×2 | 161.5 | 27.6 | 39796 | 1.4 /4 | 1 |
| dimensions 1920x1080 | 1920×1080 ×2 | 422.2 | 115.0 | 67795 | 1.7 /4 | 2 |
| dimensions 2048x2048 | 2048×2048 ×2 | 681.3 | 175.6 | 141040 | 1.6 /4 | 1 |
| dimensions 319x241 | 319×241 ×2 | 57.5 | 4.1 | 4750 | 2.0 /4 | 0 |
| dimensions 1221x1729 | 1221×1729 ×2 | 362.8 | 87.5 | 78610 | 1.8 /4 | 1 |
| regional APNG NONE BACKGROUND PREVIOUS SOURCE OVER | 48×32 ×8 | 55.2 | 5.2 | 1102 | 0.4 /1 | 0 |
| regional GIF previous.gif | 48×32 ×3 | 66.7 | 1.9 | 947 | 0.4 /1 | 0 |
| regional GIF background-opaque.gif | 48×32 ×2 | 49.6 | 1.9 | 889 | 0.4 /1 | 0 |
| regional GIF background-transparent.gif | 48×32 ×3 | 39.3 | 2.3 | 901 | 0.4 /1 | 0 |
| regional GIF transparent-local.gif | 48×32 ×2 | 44.2 | 2.2 | 850 | 0.4 /1 | 0 |
| regional WebP blend dispose | 64×32 ×4 | 51.5 | 1.9 | 957 | 0.2 /1 | 0 |
| one cycle source playCount 0 | 64×48 ×3 | 59.3 | 8.3 | 1372 | 4.4 /25 | 0 |
| one cycle source playCount 1 | 64×48 ×3 | 48.9 | 8.1 | 1372 | 4.4 /25 | 0 |
| one cycle source playCount 5 | 64×48 ×3 | 55.8 | 8.1 | 1372 | 4.4 /25 | 0 |
| encode cancel | cancelled | — | — | — | — | — |
| finalize cancel | cancelled | — | — | — | — | — |
| rerun after cancel | 320×240 ×10 | 57.2 | 12.9 | 3827 | 1.3 /2 | 0 |

No native-video/console errors in the matrix. Every successful file has a
decoder configuration, correct frame count, no audio and native playback time
advance. APNG regional tests cover NONE/BACKGROUND/PREVIOUS/SOURCE/OVER; GIF tests
cover previous/opaque-background/transparent-background/local-palette transparency;
WebP tests cover partial rectangles, blend/dispose. Existing source composition
tests remain unchanged; no full-frame-only alternate decoder was introduced.

## Bundle, tests, and protected state

Ordinary entry is identical to pre-spike: **291,139 raw /88,248 gzip bytes**.
The ordinary build emits no video Worker or Mediabunny chunk; nothing in product
navigation imports this experiment. Engineering entry **24,600 raw /7,411 gzip bytes**, video Worker
**300,299 raw /77,574 gzip bytes**; same-symbol isolated Mediabunny probe279,614 raw /73,445 gzip bytes.
The latter is a representative independent bundle, not an exact additive
allocation of shared minifier bytes. Worker bundles contain the imported MP4
APIs; no whole application-wide Mediabunny preload. The held-finalize Worker is
engineering-only. Existing WebP WASM394,132 bytes is reused for source handling.

Clean `npm ci`, lint, typecheck, **64 test files /796 tests**, ordinary production
build and isolated spike build pass. **750 prior tests preserved +46 new tests**.
Viewer7 core groups, Creator19 checks and six-direction conversion22 checks pass
in installed Edge. Project dependency lock changed only for the pinned package
and two declaration packages. npm audit reports zero runtime advisories; twelve
existing moderate development-tool advisories remain, with no unrelated forced
dependency upgrades.

Protected main/origin-main SHA `4a3dc69542ca2923744904cd10ddbf1a35f36ff9`, v0.1.0
annotated tag object `498f596377c6ba13cdc300a695b2b49370982811`, Pages deployment
7301517861 at that main SHA remain unchanged. No workflow/settings change, Pages
push, release, main merge, tag, product video UI or download flow was performed.
No WebM/VP8/VP9/AV1 encoding path or capability claim.

## Remaining gate and provisional verdicts

Implementation commit: `3998b60` (full research parent `ff7aafd`). A temporary
HTTPS Localtunnel preview was independently checked in installed desktop Edge:
normal certificate validation, secureContext=true, HMR=false, native AVC encode,
MP4 readback, native playback time advance, zero active codec Workers/bitmaps and
object URLs after Close. Its normal visitor-IP form was completed; the provider's
initial511 gateway response is recorded separately from zero application errors.
The upstream access page is external tunnel infrastructure, not AniView UI.
The free gateway can transiently return408 and its hostname can expire. This
does not replace real phone evidence or claim release-grade hosting.

Canonical→Video adapter: **ACCEPT WITH LIMITATIONS** (desktop evidence).
WebCodecs AVC: **ACCEPT WITH LIMITATIONS** (platform support / lossy4:2:0 / native
memory opacity). Mediabunny MP4: **ACCEPT WITH LIMITATIONS** (buffered output,
Worker termination needed in finalization). Overall architecture: **ACCEPT WITH
LIMITATIONS, provisional pending real Android evidence**.

The remaining mandatory gate is fresh secure-context Android Edge +Quark
encoding/playback/alpha/cancellation/cleanup evidence, documented in the
[Android protocol](milestone-8c1-android-validation.md). No inference from
successful desktop capability probes or old mobile converter tests. Until that
gate passes: **Milestone 8C1: PENDING ANDROID VALIDATION**. No 8C2/8D1 work.

Follow-up: fresh numeric phone logs now confirm real successful encodes in all
three source formats and zero active resources in both browsers. Edge also
recorded **two APNG `WORKER_FAILED` jobs**, which remain unresolved. Quark's
summary has no failures. The user later confirmed normal playback, white/alpha,
padding, cancellation recovery and no stalls/reloads/crashes in both browsers;
both failures were in the second (held-finalization) cancellation test. Original
failure rows were lost. The original phone build remains unchanged; a separate
`finalize-trace-1` diagnostic preview now distinguishes Worker startup, request
failure/timeout, native flush and mux finalization. Its focused controls and
HTTPS test pass;802 tests pass after six added diagnostic regression tests.
See the Android record for the single-path follow-up. No fix/root cause is
claimed from missing evidence;8C1 remains pending and8C2/8D1 have not started.
