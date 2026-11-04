# M10A2 — Unified Multi-format Animation Creator

Date: 2026-11-04. This is a desktop implementation checkpoint, **not a release**.

## 1. Status

**PENDING ANDROID CREATOR VALIDATION**. Desktop implementation and validation pass.
Fresh Android Edge and Quark acceptance must precede PASSED / FEATURE COMPLETE.

## 2. Branch

`feat/v0.3-animation-creator`. M10A1 checkpoint `42e6e75` was pushed before code
changes. The implementation checkpoint is identified by Git and the frozen
build's `release-candidate.json`, avoiding a self-referential commit hash here.
Main and peeled `v0.2.0` remain `0cb82c0a446a160806596d618bbbc61e16a5752d`.
No main push, tag, Release, repository setting change or Pages deployment.

## 3. Architecture

M10A1 Option A, unchanged: CreationSession + target → StaticImageSequenceSource
implements existing AnimationFrameSource → canonical RGBA → existing
EncoderWorkerClient / shared encoder Worker → actual binary detection and full
decode-back → result. WebP/APNG never pass through GIF. Shared conversion, video,
Player, Decoder, MediaSession, Renderer and ZIP implementations are unchanged.

## 4. CreationSession

The existing owner retains ordered source handles, result Blob/URL and settings.
It captures job/settings identity, rejects stale publications, joins cancellation
and inspection, releases source handles on removal/clear/disposal, and records a
debug-only numeric post-close snapshot. No second creation session was introduced.

## 5. StaticImageSequenceSource

Native preparation is extracted into vendor-free StaticFramePreparer. Source
scan and sequential second-pass composition run in a dedicated Worker. Binary
admission, EXIF orientation, duplicates/order, maximum oriented width/height,
transparent floor-centered placement, no scaling and no cropping are preserved.
Source reads remain encoded byte forwarding; pixel work stays off the main thread.

## 6. Worker Topology

One source Worker + one existing encoder Worker during preparation/encoding;
these close before the existing output-inspection consumer + decoder Workers.
The Creator suite observed peak 2 Workers. Historical GIF used one Worker; the
extra source/target boundary is intentional and measured, not hidden.

## 7. Canonical RGBA

Prepare one frame → transfer source-to-main → transfer to encoder → accepted
response → explicit source ACK → next frame. No all-frame RGBA array or clone
fallback. Unit tests hold acceptance and verify no next pull; 65 independently
observed source closures show peak native bitmap 1, closed/live balance, and
856/856 detached canonical frame transfers. App-owned canonical peak is 1.

## 8. Targets

Default GIF; native accessible GIF / Animated WebP / APNG radios. Existing target
encoder selection is reused. Source, encoder and inspection failures retain typed
errors; unsupported target capability fails explicitly, without another codec.

## 9. GIF Compatibility

The frozen V0.2 RC Worker (`encoder.worker-4zFLx0Cr.js`, SHA-256
`c0fa42e70471ea6ac5e42de56383e65593965065335c167d332a629213b2d0ba`)
is verified against the existing RC manifest and executed as an independent oracle.
Mixed formats/dimensions, duplicates/reordering and real EXIF inputs produce equal
decoded canvas pixels, order, timing and loops. Original 27 native GIF core tests
also pass. Byte-for-byte encoder output identity is not the compatibility claim.

## 10. WebP

Existing libwebp/WASM lossless encoder directly consumes canonical RGBA. Actual
output can merge identical consecutive frames. A 3-input gradient fixture becomes
1 physical frame with the same 1500 ms timeline and play count; this is accepted.
Input count remains separately available and still determines workload admission.

## 11. APNG

Existing APNG encoder receives canonical RGBA directly and preserves frame order,
alpha and full-color prepared pixels. Existing Worker CompressionStream(deflate)
capability handling is reused. Output is image/png with `.png`, detected as APNG.

## 12. Quality Evidence

All pixels in every covered source frame are compared with the native prepared
Canvas pixels, including each input interval covered by a merged WebP frame.
The reference is not source-file hidden RGB, raw PNG channels or ICC metadata.

| Original procedural scene | GIF worst-frame RGB MAE / p95 | Direct WebP | Direct APNG |
| --- | --- | --- | --- |
| Flat illustration | 0.206 / 2 | exact prepared RGBA | exact prepared RGBA |
| Gradient | 2.853 / 8 | exact; 3→1 frames | exact; 3 frames |
| Photo-like high-color texture | 3.549 / 9 | exact prepared RGBA | exact prepared RGBA |
| Semi-transparent edge | 21.138 / 161 | exact RGBA/alpha | exact RGBA/alpha |

The semi-edge fixture contains up to 1340 semi-transparent pixels per frame.
GIF changes those alpha values as expected for binary transparency; it is not
called lossless. GIF contact sheets were visually inspected: visible gradient
banding and textured-scene palette reduction are consistent with this limitation.
WebP/APNG comparisons report zero RGBA mismatches across these prepared fixtures.

## 13. Timing

Global default 500 ms, range 20–10000 ms, nearest 10 ms for every target. 27→30 ms,
boundaries, invalid 19 ms, finite timing and merged WebP total duration are tested.
There is no per-frame duration editor or target-specific settings policy.

## 14. Loop

Canonical play count: 0 infinite, 1 once, N total complete plays. The existing GIF
encoder maps finite N to N−1 extra repeats. UI settings and actual output metadata
are separate, including UI playCount 1 while loop-forever produces canonical 0.

## 15. Limits

Unchanged for all targets: 2–200 input frames, 16 MiB aggregate encoded sources,
2048 per side, 4,194,304 canvas pixels, 15,360,000 input frame-pixels, 64 MiB output
including finalized size. WebP merging never reduces admitted input workload.
Real UI cases cover 200×320×240, 10×1024² and 3×2048² for every target. Four 2048²
sources are rejected before encoder construction. GIF additionally covers 2×2048².
Count/byte exact and overflow guards, corrupt/animated/wrong-extension inputs and
successful recovery are covered without weakening a limit.

## 16. Output Validation

Success requires signature/container detection and actual existing decoder
inspection of the encoded output, with dimensions, plays and total duration
checked. GIF/APNG must contain N frames; WebP accepts 1..N with preserved duration.
No result URL is allocated before validation. Wrong format, static output and
mismatched metadata are rejected; validation cancellation joins decoder cleanup.

## 17. Result Model

Actual format, MIME, extension, Blob, URL, filename, decoded metadata and encoder
metrics are distinct from settings snapshot and inputFrameCount. Diagnostics
contain numeric ownership/timing and format identities, without media or filenames.

## 18. Preview

All three results reuse the existing Viewer via a borrowed Blob VirtualFile.
Playback/pause/frame controls work; Close joins Viewer cleanup, returns to the
same result/source/settings and restores Preview focus with Download in view.

## 19. Download

Correct GIF/image-gif/.gif, WebP/image-webp/.webp and APNG/image-png/.png identities.
Native browser saves are tested twice per target, plus saves after target changes:
8 new-path files have distinct names, identical expected bytes, remain on disk
and reopen through the actual format decoder. Existing GIF download tests remain.

## 20. Target Switch

An idle target change keeps the prior successful result, its own format and
download extension. A failed/cancelled replacement keeps that result; successful
replacement revokes its old URL. Conflicting edits are locked while busy.

## 21. Progress

Preparing sources, accepted encoded frames, finalizing and checking output reflect
real work. Only the encoding frame counter is determinate. Finalizing/checking
never fabricate a percentage. Broker acceptance ordering, Session phases, UI
locking and the real checking-stage cancellation are tested.

## 22. Cancel / Rerun

Nine real browser cases: GIF/WebP/APNG × preparing/encoding/output checking.
Test-only transport delays hold actual operations; no product delay hook exists.
All cancel, join cleanup, retain inputs/settings/previous result and rerun.
Back during generation also joins shutdown. Source close has a bounded 100 ms
termination fallback for an unresponsive native operation, as in the legacy path.

## 23. Stale Isolation

Source job/request IDs and Session generations reject old responses/results.
A serialized source read gate prevents overlapping uncancellable old/new reads.
Tests cover late read, old progress/result/inspection completion, replacement and
disposal; closed or obsolete jobs cannot allocate a new result URL.

## 24. Cleanup

Creator browser ledger: 257 Workers created / 257 terminated, active 0, peak 2.
Source bitmap probes balance created/closed with live 0 and peak ≤1; encoded and
canonical transfers detach. All generated result URLs are revoked after leaving.
Post-Home snapshots expose source/encoder/validation/inspection Workers, bitmap,
Canvas, ImageData, owned RGBA, ACK, URL and cleanup-error counts locally only.
These are application ownership measurements, not measured RSS or GPU memory.

## 25. Localization

290 → 303 typed bilingual keys; 13 additions, missing English 0, missing Chinese 0.
Target controls/helper/CTA/result/error text are paired. Live EN/ZH changes preserve
sources/settings/result. No localization dependency or untyped fallback was added.

## 26. UI

Existing compact Creator structure is retained with one format fieldset. Duration
and loop remain shared. Result identity follows the actual result, even after
selecting another target. Responsive checks pass at 320/360/390/768/1280 px,
including long filenames, no horizontal overflow/overlap and ≥44 px action targets.
Ordinary pages expose no diagnostics; debug details remain collapsed.

## 27. Desktop Validation

Installed Edge 156, production Vite build under `/AniView/`, no HMR. Creator suite:
26 check groups, 13 limit/workload observations, 12 multi-format quality rows,
3 independent legacy GIF parity cases, 3 real EXIF target cases, 9 cancel/reruns.
Existing core browser and release-UI suites pass. Full local evidence and binary
outputs remain ignored under `.tools/creation/` and `.tools/m10a2/`.

## 28. Android Edge

PENDING. No previous milestone result substitutes for this new Creator flow.

## 29. Android Quark

PENDING. No desktop emulation is reported as a real Android result.

## 30. Android Coverage Gaps

Fresh three-target source/reorder/Preview/download, semi-alpha edges, cancel/rerun,
language switch, old GIF Viewer smoke and complete Home cleanup remain required.
See the [current Android procedure](milestone-m10a2-android-validation.md).

## 31. Performance / Responsiveness

Desktop UI-to-validated-result wall times (one run, not cross-device benchmarks):

| Workload | GIF | WebP | APNG |
| --- | --- | --- | --- |
| 200×320×240 | 1631 ms | 1322 ms | 2454 ms |
| 10×1024² | 560 ms | 548 ms | 618 ms |
| 3×2048² | 645 ms | 749 ms | 614 ms |

Largest heartbeat interval among these cases: 38.4 ms; no browser errors or crash.
Preparation statistics separately measure source reads, identification, native
decode, composition/readback and checkpoints. Encode and total-before-validation
times are explicitly labeled. Native allocations/OS RSS/GPU totals are unknown.

## 32. Bundle

Initial observed Home JS: 327946 bytes / 101080 gzip versus V0.2's 325399 / 100489
(+2547 / +591). Main CSS remains 10958 / 3078. Creator JS 36368 / 10672 versus
28744 / 8689; Creator CSS 6311 / 1788 versus 6122 / 1745. New native-only source
Worker 15453 / 5445 replaces the old Creator-specific GIF Worker in the ordinary
product build; shared animation encoder 45991 / 16013, video encoder 300564 / 77663
and WebP WASM 394132 / 159999 are unchanged V0.2 assets (raw/gzip bytes).
Fresh runtime observations: no source/encoder Worker or WASM on Home/Creator entry;
GIF and APNG request no WASM, WebP requests the existing WASM only when needed.

## 33. Dependencies

New runtime dependencies: 0. Package metadata, lockfile, version 0.2.0, project
license and notice collection unchanged. npm ci succeeds; its 12 moderate entries
are the previously documented development-tool advisory baseline. No force-fix,
dependency substitution or browser/runtime download was performed.

## 34. Tests

Existing 1001 test behaviors retained; 53 new cases, total **1054 PASS** in **84
test files** (baseline 79). Failed 0, skipped/pending 0. Existing test adaptations
change the new contract/metadata/progress mocks, not remove behavior assertions.

## 35. Build

Official Node v24.22.1 / npm 11.19.1, `D:\tool\nodejs\node.exe` and `npm.cmd`.
`npm ci`, lint, typecheck, all tests and production build PASS. Test/tool assertions
were rechecked after strengthening progress coverage. Clean checkpoint rebuild is
used for the frozen phone artifact. No fixtures, reports or source maps enter dist.

## 36. V0.2 Regression

Viewer playback/Preview and saved WebP reopen, ZIP navigation, animation→WebP,
animation→MP4 native Preview, video→animation, language switching, ordinary-page
diagnostics absence and post-Home cleanup PASS in the light production smoke.
The eight-flow smoke observed 71 local GET/HEAD requests, no browser errors.
No full video/codec matrix was unnecessarily repeated.

## 37. Files Added

- `src/creation/static-frame-core.ts`, `static-source-protocol.ts`, `static-source.worker.ts`
- `src/creation/static-frame-source.ts`, `static-animation-encoder.ts`, `output-validation.ts`
- `src/creation/static-frame-source.test.ts`, `static-animation-encoder.test.ts`
- `src/creation/creation-targets.test.ts`, `output-validation.test.ts`, `creation.test-support.ts`
- `src/media/creation-cleanup.ts`, `creation-cleanup.test.ts`
- `tools/creation/multi-format-checks.mjs`, `audit-runtime.mjs`
- This milestone report and `milestone-m10a2-android-validation.md`

## 38. Files Modified

- `src/creation/creation-session.ts`, `creation-types.ts`, `creation-messages.ts`
- `src/creation/CreatorWorkspace.tsx`, `download-name.ts`, `gif/encoder-core.ts`
- Existing `creation-session.test.ts`, `download-name.test.ts`
- `src/pages/CreateGif/{CreateGif.tsx,CreateGif.test.tsx,CreationDiagnostics.tsx,create-gif.css}`
- `src/components/RuntimeDiagnostics.tsx`, `src/i18n/{messages.ts,localization-ui.test.tsx}`
- `tools/creation/{browser.mjs,fixture-paint.mjs,generate-fixtures.mjs,preview.mjs,run-browser.mjs,README.md}`

## 39. Old GIF Creator Path

**Retained**, not the product default. `src/spikes/gif-encoder/harness.ts` still
consumes StaticGifEncoder; the historical client/worker/core tests and spike tools
remain valid consumers. Only preparation is shared by delegation. Shared GIF
quantization also remains used by the existing canonical encoder. Do not retire
these while consumers remain and fresh Creator Android acceptance is pending.

## 40. Known Limitations

Fresh real Android Creator acceptance is outstanding. GIF still has palette and
binary-alpha losses. Lossless target guarantees start at native prepared Canvas
pixels, not original file metadata/hidden RGB. Fixed limits and app ownership
counts do not measure native allocator/GPU memory. APNG needs existing deflate
capability; unsupported browsers receive a controlled error.

## 41. Final Verdict

**M10A2: PENDING ANDROID CREATOR VALIDATION**. Desktop gates passed; no final
PASSED or FEATURE COMPLETE claim is made.

## 42. Next State

V0.3 IN DEVELOPMENT. Freeze a clean production build, hand off its secure test
URL, preserve that build during phone testing, and collect fresh Edge/Quark
results. Stop at that handoff; do not start another milestone or deploy Pages.
