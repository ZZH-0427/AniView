# Milestone 8D2 — Video → Animation Productization

Status: **PENDING ANDROID VALIDATION**. Date:2026-11-01.
Branch:`feat/v0.2-video-to-animation`. V0.2 is NOT RELEASED. Main, v0.1.0,
GitHub Pages settings/workflow and production remain outside this work.

## Product entry and inherited technical boundary

Home exposes **Convert video** beside existing image/archive input and Create GIF.
Its workspace is lazy-loaded; no video is inserted into MediaSession/Viewer.
The [accepted8D1 architecture](../spikes/milestone-8d1-video-to-animation.md),
[native PAR diagnosis/fix](../spikes/milestone-8d1-quark-par-followup.md) and
[reference delta audit](../research/video-to-animation-reference-delta-audit.md)
remain the technical basis.8D1 phone results are inherited decoder/sampling
evidence, not8D2 product acceptance.

The pipeline remains borrowed video VirtualFile → VideoSource Worker/Mediabunny
Input/native VideoDecoder → sequential presentation sampler → integer-microsecond
grid → public sample.draw/orientation/PAR/resize → RGBA8 transfer broker → existing
GIF/WebP/APNG Encoder Worker. The emitted Source Worker remains byte-identical
to the accepted8D1 worker. The coordinator gains only an optional, non-owning
worker-lifecycle observer. No source decoder, sampling, PAR normalization,
Canvas path, backpressure or encoder algorithm was rewritten.

## Session and resource ownership

`VideoConversionSession` is separate because the existing ConversionSession
borrows the current Viewer animation. It owns one selected File reference,
one source-preview URL, one result Blob/URL, settings, metadata and job state.
It never stores VideoSamples, ImageData, VideoFrames or canonical frame arrays.
Preview uses the existing AniView Viewer borrowing the result Blob, with no
extra result URL, recursive conversion or source-list insertion.

Native `<video controls>` is for source Play/Pause/seek only. It uses parsed
display geometry including PAR, pauses during conversion, and detaches src/load
on unmount. The conversion decoder never reads its currentTime. Preview time
selection maps native source-offset or already-normalized timelines into visible
time0…duration; final sampling is always the accepted Worker timeline.

Generation IDs, AbortControllers and a joined operation queue prevent old jobs
from publishing over replacement/cancel/new-source state. Waiting for lazy module
imports is abortable; a late import cannot start work. Cancel retains source and
settings, clears progress/result, and permits rerun. Initial preparation can be
retried. A replacement aborts/joins old work, releases old URLs, then prepares B.
Back/Home disposes and joins cleanup before leaving. Viewer teardown is joined
before restoring the same successful result screen. No persistence is added.

## Settings, trim and shared preflight

Default target is Animated WebP for full-color lossless output. A new source
preserves the chosen target but resets FPS to its default, size480 and start0.
Initial end is at most5s and clipped to the output budget using accepted grid
utilities; an unencodable tiny target tail is trimmed to the preceding grid
boundary. Source duration and supported timing remain authoritative.

GIF FPS5/10/20, default10; WebP/APNG5/10/15/20/24/30, default15. Switching from an
unsupported FPS to GIF selects10. Sizes360/480/720/guarded Original preserve
display aspect and never upscale. Loop is fixed forever/playCount0. No dithering,
quality, palette, compression, speed, crop, custom FPS/resolution, loop editor,
timeline thumbnails or frame editor is introduced.

Start/End use normalized integer microseconds with0≤start<end≤visible duration.
Set Start/End borrow approximate native preview time solely for these inputs.
`countGrid`, `outputSize`, `createSamplingPlan`, `validateTargetTiming` are the
same8D1 utilities used by conversion. Preflight shows selected duration, FPS,
sampled frames/150, actual planned dimensions and frame-pixel work/15.36MP.
Errors distinguish invalid trim, duration, size, frame count, workload, target
timing and missing APNG deflate support, with explicit corrective suggestions.

## Scope and limits

MP4/H.2648-bit SDR and WebM/VP9 profile0 opaque SDR only. Cheap bounded binary
header rejection precedes the authoritative Worker container/codec inspection;
QuickTime brand is rejected. Filename/MIME never override actual bytes. Audio
is ignored. No HEVC, AV1, VP8, MOV/MKV product support, HDR, alpha video, streaming,
complex unsupported timeline or heavy fallback is added.

| Guard | Value |
| --- | ---: |
| Source/output | 64MiB each |
| Coded/display-allocation guard | side2048; area2,073,600px |
| Output long side |720 maximum;480 default |
| Selected clip |30s maximum, additionally budget-limited |
| Sampled frames |150 |
| Output frame pixels |15,360,000 |
| Observable source samples |1800 |
| Observable source pixel proxy |622,080,000 |
| Keyframe preroll |5s |
| Job deadline, including output checking |120s |
| Source cache/read chunk |4MiB /1MiB |

Observable source decode work is a safety proxy, **not native/GPU memory**.
Original source guards can reject at runtime after metadata/preflight. Existing
animation encoder200-frame guards are unchanged. The accepted source-acquire
guard can observe the triggering decoded sample before rejecting; no strict
native allocation bound is claimed.

## Result, progress, errors and download

Progress comes from actual broker stages: Preparing, Sampling, Encoding,
Finalizing, Checking output. Frame progress is monotonic; finalization/checking
remain indeterminate rather than fabricated percentages. Cancel remains available.

Success requires actual encoded bytes, binary target identification and the
existing animation-decoder readback. Dimensions, loop, duration and output count
are checked against the plan/target quantization. Estimated frames must equal
transferred canonical frames; WebP may have fewer physical output frames because
identical frames merge. Result UI shows actual format, dimensions, duration,
frames, loop and bytes, with a sampled-vs-output note when needed.

Preview uses AniView decoder/Player/Canvas, not native animated img. Close returns
to retained source/settings/result without another conversion. Downloads use
existing bounded safe-basename+time+nonce+activation-counter naming. GIF uses
.gif/image/gif, WebP.webp/image/webp, APNG.png/image/png. Each click changes the
actual suggested filename; gallery indexing remains browser/OS controlled.

Typed source container/codec/config/API/timeline/preroll/size/deadline/pixel/Worker
and target errors map to clear recoverable messages. A new source remains
selectable. No ffmpeg.wasm, server upload or HTMLVideoElement seek extraction.

## New desktop product evidence

Official installed Windows Node24.22.1/npm11.19.1. npm ci, lint, typecheck,
tests and production build pass. **75 files/948 tests**,59 new; all prior889
preserved. New tests cover entry/controls, binary gate, source preparation,
typed errors, default clip, FPS policy, normalized trim, exact150/151 and
15.36MP boundaries, metadata vs sampled count, WebP merge, unique names, URLs,
cancel/rerun, aborted import, late preparation/result, active replacement,
disposal and diagnostics privacy.

`tools/video-conversion/run-product.mjs` passes **22 groups plus six-direction
matrix** through actual product controls. This includes real MP4/H.264 and VP9
to each output; target decode-back; nonzero trim/odd tail; FPS,360/480/720,
Original/no-upscale; rotation/portrait; VFR/B-frame representative; three PAR
targets; native source controls/Set Start; target-switch FPS correction; workload
and150/151 rejection; Cancel/rerun; AniView Preview/back; unique retained actual
downloads; reopening both repeated APNGs; source replacement/Home/active leave.
Every direction also activates its actual download link. A test-only native PAR
metadata-omission shim validates the guarded compatibility path through all
three product encoders; it is not shipped or served to phones.

The main uninterrupted product-page cleanup snapshot has112/112 Workers,
peak2, active0, no bitmap/archive resources and zero session active samples,
Canvas/ImageData/RGBA/ACK/URLs/errors. Later reload-isolated recovery/leave tests
have separate counts; do not sum them into a fabricated whole-browser trace.
The six-direction50ms heartbeat maximum is about51.6ms in this run. It measures
timer scheduling, not a long-task attribution or Android performance guarantee.

Existing Viewer/static/ZIP core,20 release UI checks,19 Create GIF checks,
22 animation conversion checks and animation→MP4 product regression all passed.
These are newly run desktop integration regressions. Full8D1 technical stress,
VFR/B-frame matrices and source-workload campaigns were not rerun as8D2 evidence.

## Diagnostics and privacy

Only?debug=1 exposes collapsed Video conversion diagnostics/Summary JSON.
It records started/completed/cancelled jobs; source/encoder/output decoder Worker
ownership; active samples/Canvas/ImageData/RGBA/ACK; sampled/actual frames;
observed source work; PAR fallback; peak canonical/sample counts; URLs; cleanup
and close disposition. No filename/path/URL/media bytes/pixels enter diagnostics.
Source names remain only in ordinary source UI and safe download filenames.

Heartbeat adds raw/visible-gap observations, bounded >1s gap records with wall
clock delta, and hidden-during-job context. It must not equate an outlier with
main-thread blocking. After Home, Resource Raw JSON exposes numeric
lastVideoAnimationCleanup. Hard-close uncertainty is preserved, not zeroed to
pretend individual callbacks balanced. All processing stays in the browser.

## Bundle and licensing

| Artifact | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Ordinary entry |281,659 |85,206 |
| Aggregate initial JS including extracted shared preloads |293,330 |89,830 |
| Video product UI/session |30,673 |9,548 |
| Lazy video-source coordinator/runtime |7,131 |2,514 |
| Source Worker including Mediabunny |274,358 |72,288 |
| Shared animation Encoder Worker |45,991 |16,013 |

Initial JS raw delta vs8D1's single291,867-byte entry is+1,463, not a misleading
entry-only reduction. JSX/errors/runtime diagnostics became shared chunks.
Startup network checks load neither VideoConversionWorkspace/runtime nor Source/
encoder Worker. Entering workspace loads UI; selecting a video loads metadata
runtime/Worker and encoder capability probe; Convert starts actual pipeline.
Mediabunny remains in existing video Workers, not ordinary main-thread startup.
Standalone probe contribution is not an additive bundle delta.

AniView UNLICENSED; Mediabunny1.65.0/MPL-2.0 unmodified; corresponding source/
notices retained and expanded to describe video input. No dependency/lockfile
change or codec runtime added. npm ci reports12 existing moderate advisories;
no audit force-fix or unsupported classification of all advisories is asserted.

## Android gate and next state

Fresh lightweight product testing in Edge and Quark is **PENDING**. Use the
[Android record/checklist](milestone-8d2-android-validation.md), frozen production
build and trusted HTTPS. User preference is wireless; no USB is required.
8D1 raw timer disposition and passed codec/ownership gates are inherited,
not substituted for native preview/trim/settings/result/download/new-source8D2 UX.

Known limits: stated codec/opaque SDR subset; ignored audio;150 frames/30s/
720 long side and dynamic budgets; no upscale/crop/speed/custom settings/HDR/
alpha/HEVC/AV1; browser-dependent RGB/resize; unobservable native/GPU peaks;
source-work proxy; narrowly guarded native PAR compatibility; temporary preview.

**Milestone8D2: PENDING ANDROID VALIDATION.** No main merge, tag, GitHub Release,
production deployment or release-preparation work has started.
