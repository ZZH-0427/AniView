# Milestone 8C2 — Animation → MP4 productization

Status: **REOPENED — PENDING ANDROID VALIDATION**, 2026-10-31.
Desktop product acceptance passes; fresh Android product acceptance is incomplete
and is required again after the user's explicit request to restart testing.
Branch: `feat/v0.2-animation-to-video`. V0.2 is not released. Main, v0.1.0
and production Pages remain outside this feature's deployment scope. 8D1 has not
started. The resumed gate and phone coverage are in the [Android record](milestone-8c2-android-validation.md).

## Product and ownership

An animated GIF, WebP or APNG (including a borrowed ZIP entry) exposes
**Viewer → More → Convert animation → MP4 / H.264 video**. Static media has no
conversion entry; existing same-format animation targets remain disabled.
There is no additional Home action or separate video-conversion session.

`ConversionSession` owns the job and one encoded result Blob/URL. It borrows the
original `VirtualFile`, preserving MediaSession and ArchiveSession. The accepted
8C1 broker, source decoder and encoder Worker remain the processing pipeline.
The MP4 module is imported only on Convert with MP4 selected. Source preparation,
ordinary viewing and other targets do not load it or Mediabunny. The native video
preview is a separate lazy component, borrowing the result URL rather than
inserting MP4 into Player, Decoder or MediaSession.

Back from Preview detaches native playback and returns to the same result.
Back to source aborts work, joins teardown and revokes the result URL. Replacing
a result or selecting another target revokes the old result. Generation IDs and
abortable waiting around dynamic imports prevent stale jobs from starting or
publishing. No media is persisted, uploaded or restored.

## Accepted MP4 policy

The 8C1 policy is unchanged: H.264 in MP4, one animation cycle, VFR from actual
source durations, no audio, no alpha channel. Alpha is composited on white.
Lossy video, 4:2:0 chroma and source premultiplication can change fine RGB/chroma/
soft-alpha details. Odd dimensions receive white right/bottom padding without
scaling/cropping. The label is H.264 rather than a Baseline promise: native
profiles vary by device (8C1 Edge Baseline, Quark High).

Results use actual MP4 readback dimensions, duration and codec, separately from
source timing. The primary result displays dimensions, duration, bytes, H.264
and the padding note. Frame count and exact avc1 string are diagnostic facts.
A 319×241 fixture produces 320×242. Download uses `video/mp4`, `.mp4` and a
distinct name per activation. Gallery indexing remains a browser/OS decision.

The secure-context check precedes source opening. The encoder Worker probes
VideoEncoder configuration/initialization as in 8C1. Missing API, unsupported
configuration, initialization/encoding/mux/readback failures produce typed,
recoverable errors. There is no ffmpeg, MediaRecorder, server or format fallback.
Another animation target remains selectable after an MP4 error.

## Progress, cancellation and limits

Progress reflects decoding/accepted frames. **Finalizing MP4…** covers real
flush/mux; **Checking output…** covers actual readback. There is no invented
finalization percent. Cancel remains available throughout. Cancel and Back
hard-stop the Worker through the accepted termination path. Late success cannot
replace a newer result; Cancel preserves source and target for another Convert.

| Limit | Value |
| --- | ---: |
| Frames | 200 |
| Side | 2,048 pixels |
| Pixels/frame | 4,194,304 |
| Sum of frame pixels | 15,360,000 |
| One-cycle duration | 30 seconds |
| Encoded source/output | 64 MiB each |

Canonical RGBA ownership remains bounded to one frame; owned VideoFrames to one,
with native queue backpressure. These are ownership/queue observations, not a
promise about native codec RSS/GPU allocations. Safety limits were not increased.

## Desktop product evidence

Installed Windows Edge, formal Node 24.22.1/npm 11.19.1, production build under
`/AniView/`. `tools/video/run-product.mjs` drives actual product controls:

- GIF→MP4, APNG→MP4, WebP→MP4: actual conversion, native Play/Pause/seek,
  Preview→Back retaining URL/result, actual download, Back to original source.
- Seven cases: opaque, transparent/soft-alpha, VFR, finite-play source,
  odd dimensions, regional/disposal GIF/APNG/WebP. Preserved 8C1 tests retain
  composition/readback assertions; product cases make no new quality guarantee.
- Two distinct MP4 downloads have equal valid bytes and both reopen with native
  video metadata. APNG/WebP outputs are also actually saved.
- Actual accepted-frame Cancel, actual held native mux finalization Cancel,
  and Back during actual finalization: teardown/rerun pass. The held Worker is
  an isolated test artifact, never served to the phone.
- A test-only Worker without VideoEncoder yields explicit unsupported UX and
  recovers on normal rerun. A 40-second source is rejected by the unchanged
  30-second guard; later small conversion succeeds.
- MediaSession Next and ZIP entry Next remain available. Controls fit
  320/390/768/1280-pixel viewports without horizontal overflow. Observed progress
  is monotonic/bounded; heartbeat is recorded in the ignored numeric report.
  No desktop script/Worker errors occur.
- After closing everything: all created Workers terminated; archive sessions
  closed; zero active Workers/bitmaps/archive sessions/owned VideoFrames/
  conversion URLs/cleanup errors.

Existing desktop regressions pass: six animation conversion directions (22
checks), GIF creator (19 checks, five workloads, three quality cases), and Viewer
core stability including static media/ZIP/navigation. These do not replace new
8C2 Android product acceptance.
The existing release UI suite also passes all 20 checks, including normal-mode
diagnostic absence, native fullscreen, menu keyboard/focus, touch targets,
responsive screenshots, rapid switching and complete cleanup.

## Tests, diagnostics and bundle

**66 test files / 821 tests: previous 802 preserved, 19 new.** New tests cover
Session ownership/actual metadata, lazy import/stale isolation, cancel during
encoding/finalizing/checking, rerun/disposal, typed failures/invalid output,
filenames/URL revocation, Worker phases and insecure-context rejection before
source/Worker work. Clean `npm ci`, lint, typecheck, test and build pass.

Only `?debug=1` exposes collapsed local diagnostics: video starts/completions/
cancellations (including Back while active), active video/decoder Workers, peak
canonical RGBA/VideoFrames/native queue, last MP4 bytes/codec, owned VideoFrames
and cleanup errors. No filenames, paths, URLs, media bytes or pixels are recorded.
Existing shared runtime counters remain intact.

After Back, Runtime Raw JSON includes `lastConversionCleanup`, a numeric disposed
Session snapshot: active decoder/encoder/video Workers, owned VideoFrames, URLs,
cleanup errors and frame balance. A hard Worker stop reclaims the realm; owned
frame count becomes zero but exact create/close callback balance is unknown
(`null`) until a completed job supplies metrics. Success reports `true`. These
are not native-memory measurements. The snapshot is ephemeral, local, debug-only.

Startup requests load neither conversion UI, MP4 runtime, video preview nor
Mediabunny. Conversion UI has one lazy MP4 runtime edge; native preview has its
own lazy chunk. Mediabunny stays in the video Worker. Exact emitted raw/gzip
sizes are recorded by the build report and the Android candidate record.

## Licensing and remaining gate

Mediabunny 1.65.0 remains pinned, MPL-2.0, with no upstream modification. Retained
license/source-availability notices now describe product use as well as the spike.
Corresponding published source remains linked. No dependency or lockfile change.
AniView remains UNLICENSED; native codec/AVC rights remain separate questions.

Fresh Android Edge/Quark product smoke is incomplete and is required again;
neither is recorded as a completed 8C2 phone test pass. QQ is not tested.
The previous waiver was superseded by the user's request to restart this round.
Mobile product coverage remains the pending acceptance gate.
8C1's two historical Edge cancellation failures remain root-cause unknown, with
focused reruns passing. A new product Worker failure must be investigated.
Native capabilities/profile, downloads and temporary HTTPS availability vary.
No Pages deployment, main merge, release/tag, media persistence or 8D1 work occurs.
