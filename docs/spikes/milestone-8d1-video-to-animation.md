# Milestone 8D1 — Video → GIF / Animated WebP / APNG technical spike

## 1. Status

**PENDING ANDROID VALIDATION — desktop framework complete.** Date: 2026-11-01.
Fresh phone testing has now started: Edge passed; Quark stopped on the PAR
fixture with VIDEO_SOURCE_LIMIT during probing. Overall PASS and 8D2 remain blocked
on that investigation and Quark's remaining coverage. See the Android record below.
Follow-up: native PAR loss is confirmed; a guarded adapter correction is desktop
verified in candidate8d1-122e82b97f04. Its targeted phone retest is still pending;
see the [complete evidence and correction](milestone-8d1-quark-par-followup.md).
V0.2 is **NOT RELEASED**.

## 2. Branch

Branch: `feat/v0.2-video-to-animation`, created from the full V0.2 feature state,
not main. Implementation `76cec92`; tests `c8fec6b`. Documentation is a separate
checkpoint. Main/origin-main, v0.1.0 and production Pages are outside this work.
No deployment workflow or repository setting was changed.

## 3. Research checkpoint

`4a00b2d1b6c7b852579d3c38eaeb3a027020549a`:
`docs: add video to animation reference delta audit`, committed and pushed to
`feat/v0.2-animation-to-video` before any implementation; GitHub API confirmed
the same remote SHA. The [delta audit](../research/video-to-animation-reference-delta-audit.md)
and previous audits remain unchanged. A measured clock-policy refinement is
recorded below rather than silently rewriting that research history.

## 4. Architecture

```text
borrowed VirtualFile
  → bounded range RPC
  → VideoSource Worker / Mediabunny Input
  → sequential presentation iterator / current + lookahead
  → timestamp sampler
  → public sample.draw / one reusable output OffscreenCanvas
  → RGBA8 canonical frame
  → main broker (transfer only)
  → existing Animation Encoder Worker
  → encoded output
```

`src/video-source/` contains the adapter, worker protocol, source, timing and
guards. The small `convertFrameSource` extraction in the existing canonical
broker preserves the old `convertAnimation` API without pretending video is a
GIF source. No pair-specific MP4→GIF/WebP/APNG converters exist.
ConversionSession, CreationSession, MediaSession, Player and existing decoders/
encoders are unchanged.

## 5. Input scope

MP4+AVC/H.264 (Baseline/Main/High8-bit profiles) and WebM+VP9 profile0. One primary
video track, opaque SDR8; audio is not decoded. Binary/container/codec evidence
wins over filename/MIME. No MOV/MKV product support, HEVC, AV1, VP8, HDR, alpha,
streaming, audio preservation or fallback is added.

## 6. Codec capability

Desktop: installed Edge156, production build, secure context. For AVC and VP9,
container read, primary video track, effective config support, real decoded
sample, draw and RGBA readback all pass. First-sample success confirms decoder
initialization; the public sink does not expose a separate configure-success
callback. On an early decoder failure that stage stays unknown, not falsely true.

Worker diagnostics retain each capability step, codec and stopped phase.
Known HDR/alpha/profile/coded-size policies reject before decoding; decoded
color/format/geometry is checked again. Fresh Android Edge and Quark capability
chains remain **PENDING**.

## 7. Timeline normalization

UI/harness times are relative to visible start. `computeDuration` is treated as
presentation end, not span. A +5 s WebM origin normalizes to zero. The real
negative-PTS MP4 starts at−.2 s and displays marker2 at normalized zero; preroll
is not shown as negative output time.

A bounded selected-track MP4 edit-header guard allows a single unit-rate visible
edit and clips end to that edit. Multiple/empty/unsupported edits are rejected as
`VIDEO_TIMELINE_UNSUPPORTED`. Mediabunny remains the demuxer. Primary-track
selection is deterministic; no secondary-codec fallback occurs.

## 8. Sampling grid

Frozen interval: **[start,end)**. Integer µs and BigInt-safe round-half-up:
`offsetUs(n)=round-half-up(n×1,000,000/FPS)`. The same plan utility supplies count
and actual output timestamps. Canonical duration is the next grid boundary or
trim end minus current time, divided by1000 to milliseconds.

**Measured refinement:** strict comparison between a 90kHz source timeline and
a rounded µs target grid caused a15-FPS→15-FPS test to repeat/drop visual markers:
150 canonical slots contained only100 distinct source markers. Source relative
PTS is now also round-half-up quantized to µs (≤0.5µs). Previous/active selection
then preserves all150 identities. This is not nearest-frame sampling and does
not change the half-open grid, canonical tail, encoders or Mediabunny.
Unit regressions cover15/24/30 FPS identity and negative rounding.

## 9. Presentation order

CFR, real VFR, and real AVC B-frame fixtures pass. The B-frame fixture contains
24 original frames, including14 B pictures; independent FFmpeg showinfo/debug_ts
records confirm PTS≠DTS. Barcode identities, source PTS and target visual
fingerprints are checked, not merely reported frame counts.

The VFR oracle has A0–100ms, B100–400ms, C400–450ms, D450–1000ms, E1000–1030ms.
Exact/middle starts and exact/middle ends are checked. Source packets are not
sampled by DTS/index/FPS.

## 10. Last-frame duration

The1.03 s /10 FPS GIF case has11 canonical frames and a30ms last frame; decoded
duration is1030ms. The41,667µs /24 FPS boundary produces one frame, not two:
WebP42ms and APNG≈41.667303ms match predicted existing quantization. GIF at10 FPS
encodes that one selected frame as40ms. Zero-quantized or legacy-short GIF
intervals are rejected explicitly rather than padded or hidden.

## 11. Orientation / PAR

Real90° metadata rotation passes upright corner/barcode checks with swapped
dimensions. Portrait1080×1920 →270×480 passes. Real SAR2:1, coded64×48 →
display128×48 passes. Quarter-turn/flip matrix unit tests reject scaling, shear
and degenerate transforms. A real flip-video fixture has not been run.

Output planning uses upright display dimensions. Runtime sample dimensions must
remain compatible; pathological display/PAR surfaces also face the source-size
guard.

## 12. Resize

Public `sample.draw` into one reusable exact-output-size OffscreenCanvas, high
Canvas smoothing hint, no upscale/stretch/even padding. Original is guarded by
the720 output long-edge cap. Real1920×1080 →480×270 /720×405 pass.

Desktop PNG inspection of the procedural edge/texture and NASA Apollo17-derived
photo shows correct aspect/colors and usable photographic detail. The deliberate
high-frequency patch can show aliasing/moiré; no multistep scaler was added.
Phone interpolation quality remains untested.

## 13. RGBA extraction

Worker `getImageData` supplies straight RGBA8. Its backing ArrayBuffer is
transferred without an RGBA slice. Drawing, readback, pixel fingerprints and
barcode/corner extraction stay in Workers. Main compares only bounded numeric
evidence and coordinates transfers; it never renders/resizes source pixels.

This is visual video→RGB conversion, not codec-plane bit-exact reconstruction.
Native YUV→RGB, Canvas backing/readback and encoder WASM/workspace copies remain.

## 14. Worker topology

Two conversion Workers: source and existing target. After both close, readback
uses the existing animation decoder plus a numeric inspector Worker. The desktop
global tracked peak is2. Native codec/GPU threads and internal surfaces are not
counted by that Web Worker metric.

## 15. Backpressure

Observed peak app-owned VideoSamples: **2**; explicit app-created native
VideoFrames: **0** (VideoSample backing resources are library-managed).
Peak canonical RGBA in flight: **1**. The main broker awaits actual encoder
acceptance before source ACK/next pull. 919/919 instrumented main frame transfers
detached their original buffers in the full source suite.

No VideoSample/VideoFrame/ImageData/RGBA history is retained. Bounded scalar
fingerprints and encoded results are separate from raw frames.

## 16. Memory

One app output Canvas, one in-flight canonical RGBA, current/lookahead source
handles; encoder workspace/output and range/parser storage are additional.
The input adapter uses explicit4MiB cache/no prefetch and ≤1MiB range messages.
The existing64MiB encoded source/output guards remain.

Mediabunny1.65.0's Android Chromium path can add a source/display-sized Canvas and
replacement native VideoFrame before the sample reaches AniView. No claim of
“one frame total memory” is made. Native DPB/GPU/driver allocation is **UNKNOWN**;
`decoderHeapBytes=0` means no WASM decoder heap, not zero native memory.

## 17. Experimental limits

| Guard | Actual value |
| --- | ---: |
| Source bytes / target output bytes | 64MiB each |
| Coded side / coded area | 2048 /2,073,600px |
| Display allocation guard | Same side/area bounds before native draw |
| Sampled output frames | 150; existing encoder guard stays200 |
| Output long edge | 360/480/720, default480; Original still≤720 |
| GIF FPS | 5/10/20, default10 |
| WebP/APNG FPS | 5/10/15/20/24/30, default15 |
| Selected interval | ≤30s plus exact count/pixel guard |
| Output frame-pixels | 15,360,000 |
| Observed source samples / pixels | 1800 /622,080,000 |
| Key-PTS preroll span / job deadline | 5s /120s |
| Cooperative close fallback | Worker termination after1s |

480×270×150 exceeds the output guard; the150-frame benchmark uses320×240.
These are experimental operational guards, not final8D2 policy or memory ceilings.

## 18. Source decode workload

Proxy = metadata coded width×height×application-observed source samples,
including probe and observable preroll. It does not count every internally
decoded/prefetched sample or native reference surface. The already-delivered
crossing sample in dense1080p caused rejection at624,153,600 observed pixels;
the accepted budget is622,080,000. That overshoot is recorded, not renamed a
strict hardware cap. Maximum accepted observed work in this run was12,441,600.
Small-output dense input is rejected independently of output workload.

## 19. Desktop matrix

AVC→GIF/WebP/APNG and VP9→GIF/WebP/APNG all pass real decode-back,
dimensions/count policy, duration, infinite plays and visual identities.
Lossless targets match composed source RGBA fingerprints; GIF uses appropriate
palette tolerance. WebP duplicate coalescence and one-frame animation pass.

## 20. Desktop special cases

VFR; genuine B-frame;90° rotation;1080×1920 portrait; real PAR; positive/negative
origins; odd tail;24/30 grid; exact/middle VFR boundaries;32-second source trimmed
at20.3s; no-upscale; single-frame outputs;480/720 resizing; photographic quality;
source-work/preroll/Original/4K/HDR-tag/audio-only rejections all behave as expected.

## 21. Desktop benchmark

Installed desktop Edge156, local production loopback. Times include the real
conversion pipeline and Worker work, exclude fixture HTTP loading and subsequent
decode-back. Stage times are wall/proxy counters and need not sum (overlap/waits).
One run is not a throughput promise or hardware-accelerated/native-memory claim.

| Case / output | N | Open | Seek/preroll | Sample | Draw/read | Encode | Total ms | Observed source samples | Bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| portrait.mp4 → webp 270x480 | 15 | 4.9 | 15.0 | 0.6 | 53.2/3.2 | 11.6 | 114.5 | 3 | 5752 |
| long.mp4 → webp 64x48 | 11 | 5.1 | 13.0 | 0.5 | 0.8/0.3 | 5.3 | 43.0 | 15 | 3312 |
| benchmark.mp4 → webp 320x240 | 10 | 5.0 | 13.4 | 0.8 | 2.2/1.3 | 9.5 | 48.8 | 12 | 9832 |
| benchmark.mp4 → webp 320x240 | 50 | 6.1 | 13.8 | 3.0 | 11.4/6.4 | 23.5 | 93.1 | 51 | 25396 |
| benchmark.mp4 → webp 320x240 | 100 | 5.1 | 13.7 | 5.1 | 23.0/11.8 | 37.6 | 131.2 | 102 | 41166 |
| benchmark.mp4 → webp 320x240 | 150 | 9.3 | 15.9 | 6.2 | 32.1/18.0 | 58.0 | 184.6 | 151 | 54402 |
| 1080.mp4 → apng 480x270 | 10 | 5.3 | 11.8 | 1.4 | 36.7/1.8 | 18.6 | 102.0 | 6 | 32873 |
| 1080.mp4 → apng 720x405 | 10 | 4.7 | 10.9 | 1.2 | 49.1/3.9 | 30.7 | 128.0 | 6 | 79507 |
| photo.mp4 → apng 480x270 | 10 | 5.0 | 21.3 | 12.2 | 37.7/1.6 | 50.1 | 158.2 | 3 | 1744519 |

Full source suite: **57 expected outcomes** =41 success,10 cancel,6 explicit
rejections. Browser error list empty. Across-suite tracked Workers:
189 created /189 terminated, active0. Visible main-thread heartbeat max18.5ms.
Source app sample/Canvas/ImageData/canonical/ACK counters and cleanup errors return0.

## 22. Android Edge

**PASS — user-reported Android Edge155.** Frozen build8d1-c8c7e145cf58,
secure context true/HMR false:21 successes (benchmark repeated),1 cancellation,
no failures. All six groups completed. Workers86/86; final active resources,
source sample/Canvas/ImageData/RGBA/ACK and cleanup errors0; soft close confirmed.

## 23. Android Quark

**PARTIAL / FAIL — user-reported Quark10.2 / Chromium123 / Android16.** Same frozen
build:10 successes, no cancellation; par.mp4→APNG fails VIDEO_SOURCE_LIMIT in
probing. AVC/VP9 six directions, VFR, B-frame, rotation and portrait passed.
Workers41/41 and all reported cleanup counters0; soft close confirmed. Follow-up
numeric diagnostics confirm native output loses the requested PAR; the adapter
normalization is implemented but pending a new phone retest.

## 24. Android coverage gaps

Quark PAR is unresolved; positive/negative origin, mid-video trim and odd tail
following it in the correctness group were not reached. Quark's resize,
150-frame and cancel→rerun groups were explicitly not run. Edge coverage is
complete. See the [Android record](milestone-8d1-android-validation.md); prior
milestones do not substitute for these remaining cases.

## 25. Android responsiveness

Reported heartbeat maximum: Edge71.3ms; Quark48.3ms before its failure. The user
confirmed all Edge tests passed; no separate qualitative performance statement
was provided for Quark. Native/GPU bytes remain null/UNKNOWN. Both reports show
peak2 app samples,1 canonical RGBA frame, final0 active resources.

## 26. Cancellation

Ten real desktop cancellation cases: open/probe, observable mid-video preroll,
sampling, drawing/readback, waiting to hand out a frame, pending encoder ACK,
encoding/finalizing, each followed by successful rerun. Jobs stop range/credit work,
dispose Input, return iterators, close yielded samples, and terminate owned Workers.
Epoch checks prevent stale reads/closed responses from a prior reset realm.

A close disposition records soft cleanup versus hard termination. A hard-reclaimed
realm does not fabricate measured-zero native/sample-close callbacks. The normal
completed desktop path has balanced cleanup; public-API-unobservable native work
already in flight is not claimed to stop synchronously inside a native call.

## 27. Cleanup

After the full suite: source/encoder/verification Workers0; owned samples0;
explicit VideoFrames0; canonical buffers0; ImageData0; app Canvas0/disposed;
ACK credit0; result URLs0; cleanup errors0. Reset closes the previous realm first.
Borrowed VirtualFile ownership is preserved.

## 28. GIF output

Existing gifenc,256 colors, no dithering, binary alpha, centisecond timing retained.
Flat fixture sampled mean RGBA error is small (about0.2); this does not promise
photographic GIF fidelity. Short-delay normalization/quantization is predicted and
reported separately from canonical duration.

## 29. WebP output

Existing libwebp1.6.0 lossless policy retained. Adjacent identical visuals may merge:
e.g.15 canonical slots from a10-FPS source become10 physical frames with the correct
duration/loop. The corrected15→15 benchmark preserves all150 distinct markers.

## 30. APNG output

Existing incremental RGBA8 full-frame SOURCE writer, filter0, CompressionStream
deflate. Lossless fingerprint checks pass. Rational delay approximation is
reported (e.g.1s at15 FPS decodes≈999.994913ms); photographic APNG is larger
(~1.74MB for this small quality task), not silently called compressed-video sized.

## 31. Tests

**70 test files /876 tests: original821 preserved +55 new.**
This is the original candidate baseline. The PAR correction adds13 guard tests:
**71 files /889 tests passed**; original tests remain unchanged.
Clean npm ci, lint, typecheck, all unit tests and ordinary build pass with installed
Node24.22.1/npm11.19.1. New tests cover grid/tail/rounding, same-FPS identity,
origin/resize/guards/color/profile/matrix, sampler ownership and cancellation,
edit headers, transfer/ACK, reset, stale reads, hard-stop honesty and deadline.

Existing browser regressions also pass:62 animation conversion cases /10
independent PNG oracles /1903 frame transfers;32 animation→MP4 cases; Creator19
checks /5 workloads /3 quality cases; Viewer core; release UI20 checks.
No tests/rules were skipped, deleted or weakened. npm ci reported12 existing
moderate advisories; no audit force fix or dependency upgrade was performed.

## 32. Bundle

Raw/gzip bytes measured independently with Node gzip:

| Artifact | Raw | Gzip |
| --- | ---: | ---: |
| Ordinary entry | 291,867 | 88,531 |
| 8C2 ordinary entry baseline | 291,867 | 88,529 |
| Engineering harness entry | 38,458 | 11,641 |
| VideoSource Worker including library | 273,566 | 72,082 |
| Standalone same-public-symbol Mediabunny input probe | 246,521 | 65,405 |

Ordinary raw-entry delta0. Normal build contains no8D source/inspector Worker.
Only the isolated engineering entry imports this path; no ordinary navigation
was added. The standalone probe is not exact shared/additive attribution.

## 33. Licensing

AniView remains UNLICENSED. Mediabunny1.65.0 MPL-2.0 remains pinned/unmodified,
existing notice/source links retained. No package dependency/lockfile change.
No ffmpeg.wasm, upstream fork/vendor/patch or new runtime codec is introduced.
The offline FFmpeg executable and credited NASA photo are test resources only;
see [tool provenance](../../tools/video-source/README.md).

## 34. Known limitations

Quark PAR compatibility and remaining Android cases are outstanding. Only the specified
8-bit opaque codec/profile/container subset and fixed geometry is accepted.
Complex edit lists are rejected. Color/resize results are browser conversions,
not original codec-plane reconstruction or guaranteed cross-browser RGB identity.
Native/GPU peaks, internal queue sizes and all preroll work cannot be measured
exactly through the public sink. Strong downscale has high-frequency aliasing
limitations; phone quality/performance remains unknown. The temporary HTTPS
tunnel has no production uptime guarantee.

## 35. 150-frame verdict

**KEEP150, experimental.** Desktop passes; no evidence yet justifies raising to200
for a mobile video-input product. Revisit after fresh phone results; this is not
a permanent8D2 cap decision. Existing encoders remain at200.

## 36. Default size verdict

**480: KEEP provisionally.** Desktop aspect/photo/edge behavior is usable and
720 is available within workload guards. Final product recommendation waits
for Android time, quality and stability observations.

## 37. VP9 verdict

**ACCEPT WITH LIMITATIONS — original candidate passed on Android Edge and Quark.**
Both phone reports completed VP9→GIF/WebP/APNG before the unrelated AVC PAR
failure. New candidate's targeted geometry checks remain pending.
A phone failure must report actual capability/config/first-decode stage and
support a scope decision; it must not trigger an FFmpeg fallback.

## 38. Component verdicts

| Component | Verdict |
| --- | --- |
| Mediabunny Input | ACCEPT WITH LIMITATIONS — desktop/phone codec slices verified; native PAR compatibility pending |
| VideoSampleSink | ACCEPT WITH LIMITATIONS — presentation stream verified; hidden work unobservable |
| Sampling | ACCEPT WITH LIMITATIONS — µs normalization refinement verified |
| Orientation/resize | ACCEPT WITH LIMITATIONS — Edge passed; Quark PAR correction/resize retest pending |
| RGBA extraction | ACCEPT WITH LIMITATIONS — Worker path verified; native copies unknown |
| Video→Canonical adapter | ACCEPT WITH LIMITATIONS — ownership/ACK/cleanup verified on desktop |
| Overall architecture | ACCEPT WITH LIMITATIONS provisionally; overall milestone not passed |

## 39. Final verdict

**Milestone 8D1: PENDING ANDROID VALIDATION.**
The framework and desktop engineering gate are complete. Original candidate
`8d1-c8c7e145cf58` remains unchanged; the separately frozen PAR follow-up is
`8d1-122e82b97f04`, with targeted phone acceptance pending.
The wireless HTTPS preview was checked on desktop with normal certificate
validation, actual AVC/VP9 Worker decoding, HMR false,320/390/1280-width layouts,
and clean teardown. It is not phone or GitHub Pages validation.
Ignored raw evidence/frozen asset hashes live under `.tools/video-source/`.

## 40. Next state

Complete the linked targeted retest against8d1-122e82b97f04; retain older Edge
and Quark results as evidence for their original build. Keep both frozen artifacts
unchanged during acceptance. Native PAR loss has been diagnosed; the guarded
adapter correction is desktop verified, not yet phone verified.
Do not run or infer those tests on their behalf now. Main, v0.1.0 and production
remain unchanged. **Milestone 8D2 has not started. V0.2 NOT RELEASED.**
