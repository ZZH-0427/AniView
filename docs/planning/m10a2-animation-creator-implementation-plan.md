# M10A2 — Unified Multi-format Animation Creator Implementation Plan

Date: 2026-11-04. **READY; NOT STARTED.** This is an M10A1 planning deliverable,
not product implementation or evidence that the future feature passed tests.
Source findings and exact current contracts are in the
[architecture audit](../research/v0.3-animation-creator-architecture-audit.md).

## Baseline, goal and boundaries

- Work on `feat/v0.3-animation-creator`, derived directly from stable main
  `0cb82c0a446a160806596d618bbbc61e16a5752d`.
- V0.2 remains released/frozen. Do not move `v0.2.0`, change its release records,
  push main or deploy Pages as part of the future feature implementation.
- Product goal: **static JPEG/PNG/WebP → prepared canonical RGBA → GIF / Animated
  WebP / APNG encoder directly**. No intermediate GIF for WebP/APNG.
- Keep input/order/duplicates, native oriented max-canvas/centering/transparency,
  global duration, total-play controls, Preview/Download and cancellation behavior.
- New dependencies, encoder research, WASM rebuilds and codec changes: **0 planned**.
- Not included: resize/crop/background editing, per-frame timing editor, persistence,
  ZIP creator input, password ZIP, new formats/languages, custom FPS/resolution,
  broad internal renames or conversion/video architecture refactoring.

## Chosen architecture

**Option A — extend existing CreationSession.** Preserve its source/settings/
result ownership and workspace. Introduce a thin static source adapter and small
creation job/broker, then use the existing EncoderWorkerClient and canonical
GIF/WebP/APNG Worker cores. Add existing-style output inspection before success.

```text
Home → lazy CreatorWorkspace → existing CreationSession
  ordered VirtualFile handles + immutable job settings (target defaults GIF)
    → new StaticAnimationEncoder job boundary
    → new StaticImageSequenceSource : AnimationFrameSource
       ↔ static-source.worker: sequential oriented scan + prepared next RGBA
    → same ArrayBuffer transferred through main, no Canvas/ImageData on main
    → existing EncoderWorkerClient / conversion encoder.worker
       → GIFAnimationEncoder | WebPAnimationEncoder | APNGAnimationEncoder
    → close source + dispose encoder
    → exact-range Blob + signature detection + inspectConversionOutput
    → inspected metadata + one committed CreationResult/URL
    → existing Viewer Preview/return + unique format-correct download
```

Source preparation remains off-main and sequential. This is **two generation
Workers**, compared with the old single GIF Worker: one source-preparation Worker
and the existing target Worker. The count/cost change is deliberate and must be
measured. Verification follows encoding cleanup, then Preview follows verification;
do not overlap those lifetimes to hide latency.

Do not adapt static files by pretending they are an animated VirtualFile or by
calling ConversionSession.prepare, which rejects them. Do not route Creator through
ConversionSession's target-change URL revocation policy. Leave convert.ts and its
video consumers unchanged. A short dedicated pull/transfer/accepted/ACK loop is
acceptable wrapper duplication; encoder implementations are not duplicated.

## Types and interfaces

### Reuse existing types

- `VirtualFile`, `CreationSource` and existing IDs/list ownership.
- `CreationSettings` validation and default values, extended only with target.
- `ConversionFormat` (`gif | webp | apng`), `CanonicalAnimationMetadata`,
  `CanonicalAnimationFrame`, `AnimationFrameSource`, `SourceMetrics`,
  `EncoderMetrics` and `EncoderResult` from conversion/model.ts.
- `EncoderWorkerClient` / existing target request-response protocol.
- Type-only animation arm of `ConversionProductResult`; no MP4 arm/runtime import.
- Existing structured `Message`, EncodeError/detail and ConversionError categories.

### Minimal additions / changes (proposed, not implemented)

1. `CreationSettings.target: ConversionFormat`, default gif; validate the union,
   without adding MP4. Keep 500 ms / forever defaults and existing finite plays.
2. Worker-only reusable static frame preparation object: ordered immutable sizes,
   scan metadata and `next` preparation, with checkpoint/progress hooks and close.
   Its import graph must be vendor/encoder-free.
3. `StaticImageSequenceSource implements AnimationFrameSource`, plus its typed
   source protocol/transport. It borrows files, owns Worker lifetime, not file release.
4. `StaticAnimationEncoder` implements the Session's encoding-job boundary:
   receives files/captured settings/product limits/signal/progress; returns exact
   encoded range, input metadata, source/encoder metrics and logical frame high water.
   It owns no product URL and publishes no Session state.
5. `CreationResult` reuses the animation result arm type-only and adds immutable job
   `settings`, `inputFrameCount`, static preparation metrics and overall time. Its
   `metadata` is independently inspected canonical output metadata with non-null
   duration. Derive byte size from Blob; do not duplicate unrelated MP4 fields.
6. Add `verifying` to CreationStatus and busy state, plus a joined generation-task
   lifetime that includes output inspection. Keep CreationSession and workspace names.
   Define Creator-neutral progress in creation-types.ts with phase and explicit
   completed/total frames (plus optional completed work); render those counts
   directly rather than carrying the old current-index-plus-one rule into an
   accepted-frame counter. Leave legacy EncodeProgress unchanged for its callers.

UI settings `loopForever=true, playCount=1` and canonical output `playCount=0` are
different concepts. Store settings separately; do not spread them into the same
canonical metadata field. Actual output frameCount can differ from inputFrameCount.
GIF source preparation metrics and EncoderMetrics are not identical: record only
measured quantities, showing unavailable separate quantize/write timings as absent.

## Source adapter, composition and protocol

Extract **preparation only** from creation/gif/encoder-core.ts into
`src/creation/static-frame-core.ts`: signature/dimension verification, oriented
native scan, open/close bitmap, max-canvas validation and transparent centered
composition. The legacy core delegates these operations to it, retaining its own
GIF progress/quantize/write behavior and historical tests. Keep extraction narrow;
do not consolidate the two GIF writer wrappers or delete the legacy path.

The new source Worker uses this helper without importing the legacy GIF core,
gifenc, decoders or target encoders. Two-pass behavior stays: sequential native
dimension scan and sequential decode/compose. Do not optimize away the scan by
retaining ImageBitmaps or preparing every RGBA frame in advance.

Planned source protocol:

| Operation | Contract |
| --- | --- |
| open | job ID, source sizes, duration/plays, stricter Creator limits; request encoded bytes only as needed |
| read/source/source-error | job/request ID and source index; validate exact range/size; transfer encoded buffer from main |
| ready | fixed canonical canvas/count/total plays, source scan metrics |
| next/frame | one composed RGBA buffer, index, durationMs; transfer to main |
| acknowledge | only after encoder accepted; match outstanding frame/job; clear detached view before any next prepare |
| end | null after exactly input count; repeated pulls remain ended |
| reset | only idle with no held frame; reset iteration/Canvas state without retaining pixels |
| close/cancel | reject pending work, close late bitmaps, shrink Canvas, drop references and close ports; acknowledged or bounded termination |
| error | existing typed source/limit/Worker code and numeric detail, no raw strings/media identity |

AnimationFrameSource.acknowledgeFrame returns void. The client can enqueue a source
ACK internally; its next() must await that ACK gate. It must not weaken the contract
to “postMessage detached, therefore immediately prepare another frame.” Both
source and target transports reject concurrent commands and stale IDs.

Broker invariant:

```text
await source.next()
→ validate metadata/index/full RGBA range
→ transfer identical frame.rgba to EncoderWorkerClient.addFrame
→ await accepted response
→ assert original buffer byteLength === 0
→ source.acknowledgeFrame()
→ next only after ACK gate
```

Logical full canonical RGBA in flight **<=1**. Bitmap closes before readback;
ImageData view is dereferenced after transfer. Canvas backing and encoder native/
WASM picture/workspaces/compressed output are additional, not included in that one.
Source handles and small dimension arrays are allowed; decoded-frame/thumbnail
caches and all-source encoded-byte caches are not.

Preserve `imageOrientation:'from-image'`, independent max width/height and integer
floor centering with odd padding right/bottom. Clear to transparent every frame;
no scaling, crop or background choice. Compare quality to those native-prepared
pixels, not an unsupported promise about source-file stored hidden RGB/metadata.

## Session behavior, cancellation and previous results

- Admission remains static-only and prefix-based, with deterministic partial
  acceptance and duplicate IDs. A target-only change does not read files again.
- All conflicting source/settings/target controls lock during busy/verifying.
  Do not implement “switch target implicitly cancels active job” in the first version.
- At Generate, capture ordered handles/settings/target and increment generation.
  Do not let locale changes or later idle settings mutate that job's identity.
- Idle edits/target changes retain previous valid result A, consistent with current
  Creator settings edits. Result labels and downloads use A's actual format and
  settings. A pending/failed/cancelled job B must not relabel, revoke or replace A.
- On new success, publish B and its one URL, then revoke A. Clear and Back/dispose
  revoke current URL and release sources according to duplicate ownership.
- Cancel must cover preparation, encoder work **and Checking output**. Abort source,
  dispose encoder, stop inspection and join the generation task before cancelled/
  rerun/Back completion. Reject all late progress/readback/URL publication by job ID.
- Keep the source read gate across generations. VirtualFile.read is not guaranteed
  abortable; an old pending read must finish/discard before a replacement read can
  allocate another buffer. Preserve the existing 30 s inactivity source guard and
  cooperative source cancellation with 100 ms fallback; do not inherit the target
  client's 120 s timer as permission to relax existing source policy.
- EncoderWorkerClient cancellation is termination, not a new invented cooperative
  cancel command. Its existing normal/error/finalize contract stays unchanged.
- Native decode can finish after cancel; close its bitmap or terminate the source
  Worker. Keep unknown native/GPU reclamation distinct from app ownership counters.
- CreatorWorkspace keeps its StrictMode lifetime token, Viewer teardown transition
  and usePreviewReturn. No routing, storage or background navigation changes.

## Limits and timing policy

Use the stricter existing Creator product profile for every target:

```text
2–200 static sources
16 MiB aggregate encoded source bytes
2048 maximum side
4,194,304 maximum output pixels
15,360,000 = canvas width × height × input frame count
64 MiB maximum output valid bytes
global duration 20–10000 ms, default 500, nearest 10 ms
finite total plays 1–100, or canonical 0 for forever
```

Retain underlying per-source static bounds and oriented/combined-canvas checks
before allocations. Duplicates count toward source/workload bounds even when WebP
will merge them. Never apply the 64 MiB animation-conversion source allowance or
SPIKE_ENCODER_LIMITS to the Creator. Do not raise safety limits during integration.

Every canonical frame receives the same normalized duration. GIF rounds to
centiseconds; WebP rounds cumulative timestamps and final end; APNG uses reduced
seconds fractions. These initial Creator inputs are exactly representable. Keep
the 10 ms UI normalization for all targets initially, but describe it as a Creator
setting policy rather than a WebP/APNG format restriction. No per-frame timing UI.

Canonical plays: forever→0, once→1, finite→N. Existing target mappings: GIF
repeat 0 / omitted / N−1; WebP ANIM and APNG acTL 0 / 1 / N. Preserve decoder-normalized
total plays, not raw vendor repeat fields in product state.

## Output validation and result publication

After target finish, validate ArrayBuffer/positive valid byteLength/capacity and
64 MiB cap. Close generation source/encoder before output inspection. Construct
Blob over **only the valid range**, with target MIME; no URL until verification.

Use BinaryFormatDetector to confirm the requested animated format and the existing
`inspectConversionOutput(file, target, signal, openAnimationFrameSource)` to read
every physical output frame, count, plays and summed duration without retaining
pixels. Use a neutral Blob-backed VirtualFile, not an invented GIF source.

Required comparisons before success:

- Dimensions equal prepared canvas, plays equal canonical requested total plays.
- GIF/APNG output frame count equals input count.
- WebP physical frame count is **1..inputCount**, allowing duplicate-frame merge;
  single-visual-frame wrapper must remain animated and retain total duration/plays.
- Total duration equals target-normalized planned duration within existing 1 ms
  tolerance. For Creator's >=20 / 10 ms values, no GIF short-delay normalization
  should change the timeline.
- Readback/decode/Worker/cancel failure never publishes an unchecked result URL.

The raw encoder result's metadata is not proof of output metadata. Runtime readback
checks structure/decodability/timeline, not full visual fidelity. Quality equivalence
belongs to independent fixture tests below. Do not retain input/output RGBA arrays
to make runtime pixel comparisons.

## UI, i18n, preview and download changes

Keep Create animation / 制作动图 and current CreateGif file/class/test IDs. Add
native labelled output radios: GIF / Animated WebP / APNG, default GIF. Reuse current
form/control styling; add only necessary responsive styling if current primitives
cannot accommodate the selector. No unrelated CSS polish or full internal rename.

Use target-specific Generate GIF / Generate WebP / Generate APNG and Chinese
equivalents. Update actual result heading, size label, download format and progress
accessible name. Keep existing static admission/minimum-image helper.

Proposed bilingual key categories include `creator.outputFormat`,
`creator.generateWebp`, `creator.generateApng`, `creator.webpHint`, `creator.apngHint`,
plus format-parameterized result/finalizing/generated/encoder errors and duration
policy help. Reuse existing format labels and `common.savedFiles` where appropriate.
GIF copy keeps palette/binary-alpha warning; WebP/APNG copy promises lossless
encoding of prepared full-color/alpha pixels, without file-size guarantees.
APNG full-frame output may be larger. Do not claim GIF universally best-supported.

Retain typed catalog/MessageKey/Message/EN-ZH placeholder parity and same locale
store; adding keys is allowed, a second dictionary architecture/dependency is not.
Language switches must not create a new Session, restart a job or replace a result.

Progress exposes actual preparing/scanning, accepted-frame encoding, finalizing and
checking-output work. Map legacy phases during helper extraction without backwards
percentages; checking output must not reset the completed encode bar. Do not invent
quantizing events for WebP/APNG or split unmeasured encoder time into fake timings.

Keep Viewer Preview, teardown gate and focus/scroll return. Pass actual result
filename and Blob MIME instead of hardcoded GIF. Preserve result Blob/URL/settings
on Preview Close. Do not change Viewer or MediaSession.

Generalize createGifDownloadNamer with a creator-specific extension factory while
preserving its neutral stem and existing GIF wrapper. `.gif` / `image/gif`, `.webp` /
`image/webp`, APNG `.png` / `image/png`. Per-result namer is installed only on success
and remains tied to that result when UI target changes. Actual click sets a fresh
download suggestion synchronously, without a new URL or a click-time state publish.

Capabilities are checked by the actual selected target's Worker/open path at
generation time. Do not eagerly probe all encoders on Home/Creator entry. Unsupported
APNG deflate or WebP WASM is a typed, target-aware recoverable error; sources and
prior result survive. A confirmed unavailable target may be disabled with explanatory
copy; unknown support must not be guessed from browser names or main-thread APIs.

## Diagnostics and cleanup evidence

Reuse generations/cancellations/output bytes and global RuntimeDiagnostics; add
completed jobs, job ID/target, input/actual output frame counts and source/encoder/
inspection ownership only where needed. Source Worker reports real bitmap/canvas/
ImageData/RGBA ownership and cleanup snapshots; main global bitmap zero alone is
not evidence of Worker bitmap cleanup. Frame/heap counters remain logical proxies.

For Home evidence, add a numeric, debug-only lastCreationCleanup store following
conversion-cleanup.ts, and append it to RuntimeDiagnosticsPanel without importing
Creator/encoders into that panel. Do not modify video cleanup stores. Available
post-close counters must be zero; forced-termination native/WASM measurements may
be unknown, not invented zero. No filenames/paths/bytes/URLs or remote logs.

Home gate after success/cancel/error/Back/Clear and after closing Preview:
active Workers/Bitmaps/ArchiveSessions zero (all source/archive workflows closed),
app-owned source Canvas/ImageData/RGBA zero, owned result URLs zero and cleanupErrors
zero. Distinguish Clear, which intentionally preserves the idle Creator settings,
from Back, which disposes the workspace. Readback/preview workers cannot overlap a
still-active encoder merely to improve the displayed time.

## File-level impact map

Paths below are proposed. ADD files do not exist at this baseline.

### ADD — product boundaries and focused tests

| Path | Purpose |
| --- | --- |
| `src/creation/static-frame-core.ts` | Worker-only extraction of existing static scan/composition, no codec/vendor imports |
| `src/creation/static-source.worker.ts` | Pull-based static sequence Worker and explicit cleanup |
| `src/creation/static-source-protocol.ts` | Typed job/request/read/frame/ACK/reset/close/error messages |
| `src/creation/static-frame-source.ts` | StaticImageSequenceSource client implementing AnimationFrameSource; readGate |
| `src/creation/static-animation-encoder.ts` | Small creation job/broker using existing target client, cancellation and metrics |
| `src/creation/static-frame-core.test.ts` | Geometry/native ownership/extraction parity |
| `src/creation/static-frame-source.test.ts` | Transfer/ACK, source I/O, late/native/cancel/reset/close |
| `src/creation/static-animation-encoder.test.ts` | Per-target dispatch, loop/timing, broker/cleanup/no-GIF-intermediate |
| `src/media/creation-cleanup.ts` | Small local numeric post-close snapshot, no media/runtime imports |
| `src/media/creation-cleanup.test.ts` | Debug gating, numeric-only copy/idempotent subscription |

### MODIFY — existing files, narrowly

| Path | Intended scope |
| --- | --- |
| `src/creation/creation-types.ts` | target, inspected result/settings split, verifying/progress/metrics types |
| `src/creation/creation-session.ts` | swap encoding service boundary, target updates, inspect-before-URL, joined cancel/task, preserve ownership |
| `src/creation/creation-messages.ts` | typed target/runtime/output error mapping; retain source/limit detail |
| `src/creation/CreatorWorkspace.tsx` | actual result filename/MIME for Preview; keep lifetime/return gates |
| `src/pages/CreateGif/CreateGif.tsx` | target radios/copy/CTA/result metadata/busy-verifying, without wholesale rename |
| `src/pages/CreateGif/CreationDiagnostics.tsx` | target-aware measured metrics and numeric ownership |
| `src/creation/download-name.ts` | additive creator extension factory; existing wrappers keep behavior |
| `src/creation/gif/encoder-core.ts` | only delegate extracted preparation; retain legacy encoding behavior |
| `src/i18n/messages.ts` | typed bilingual target-aware strings/parameters |
| `src/components/RuntimeDiagnostics.tsx` | append lightweight lastCreationCleanup only |
| `src/creation/creation-session.test.ts` | retain all old behavior assertions; new service/readback/target cases |
| `src/creation/download-name.test.ts` | all three extensions, retained old result, repeated clicks |
| `src/creation/gif/encoder-core.test.ts` | preserve prior geometry/cancel/product guards after extraction |
| `src/pages/CreateGif/CreateGif.test.tsx` | all targets, proper disabled/ARIA/copy/result behavior |
| `src/i18n/localization-ui.test.tsx`, `src/i18n/messages.test.tsx` | target text/parity without reset; no weakening old checks |
| `tools/creation/run-browser.mjs`, `tools/creation/generate-fixtures.mjs`, `tools/creation/README.md` | real three-target flow, quality/download/resource evidence and future Android steps |

`src/pages/CreateGif/create-gif.css` is **conditional only**: no change if existing
controls suffice; otherwise selector-specific responsive rules, no polish campaign.
Existing dictionary/locale/preview-return/diagnostics primitives and input controls
are reused. A new creation-specific test helper may be added only if substantive
test duplication warrants it; no large fixture binary is planned.

### DO NOT TOUCH

- `src/video/**`, especially `encoder.worker.ts`, product conversion and MP4 paths.
- `src/video-source/**`, including `source.worker.ts`; `src/video-conversion/**`.
- `node_modules/mediabunny` and package/lock metadata, dependency versions/licenses.
- `src/archive/**` (ZIP engine), `src/input/**` existing source adapters.
- `src/formats/**`, `src/player/**`, `src/renderer/**`, Viewer components,
  `src/media/media-session.ts` and MediaApp orchestration.
- `src/conversion/{convert.ts,conversion-session.ts,frame-source.ts,encoder-client.ts,
  encoder.worker.ts,protocol.ts,model.ts,gif-encoder.ts,webp-encoder.ts,apng-encoder.ts,
  output-inspection.ts,inspection.worker.ts}`: consume existing API/type-only;
  do not refactor shared conversion/video contracts for convenience.
- `src/creation/gif/{encoder-client.ts,encoder.worker.ts,gifenc-adapter.ts,model.ts,
  protocol.ts,gif-validation.ts,worker-task-yield.ts}`: keep legacy service/codec/
  guard profiles. Reuse exports; no automatic wrapper consolidation or deletion.
- `tools/webp-wasm/**`, generated `.mjs/.wasm/.d.mts`, `third_party/**`, notices.
- `src/app/App.tsx`, `src/pages/Home/Home.tsx` unless a separately justified
  integration need appears; current lazy entry/product naming already fits.
- `package.json`, `package-lock.json`, Vite/tsconfig/workflows/public assets,
  PLAN.md, AGENTS.md and all frozen V0.2 release/audit documents.

Check actual module names before edits; a shared-type incompatibility requiring
changes to this freeze list is a **stop/review condition**, not silent permission
to refactor it. Type-only reuse of the animation result arm needs no Session change.

## Ordered implementation gates

1. Verify clean feature baseline and read this audit. Add focused static preparation
   tests; extract helper with legacy behavior unchanged. Run relevant legacy core
   geometry/orientation/cancel/limit tests before moving to the next step.
2. Add source protocol/Worker/client. Prove readGate, bounded native lifetime,
   ArrayBuffer transfer, exact metadata, ACK, reset/end/close and stale isolation.
   Source Worker must not import gifenc or target codecs.
3. Add creation job/broker with dependency injection and selected existing target
   transport. Prove one in-flight frame and source/encoder closure in every exit.
   Use small real decode-back fixtures for GIF/WebP/APNG before wiring UI.
4. Extend CreationSession/result and add output inspection/task joining. Preserve
   all source/settings/result-retention tests. Prove cancellation in verification,
   failures before URL allocation and valid WebP physical-frame coalescing.
5. Add minimal target UI/copy/Preview MIME/naming and diagnostics. Update legacy
   harness DTO readers rather than inventing legacy quantize/write timings. Check
   normal mode has no diagnostics and changing locale never restarts work.
6. Run formal Node 24 npm lint/typecheck/full tests/build. Preserve the 1,001-test
   baseline's behavior; total should grow, not lose effective coverage. Run installed
   desktop product/UI checks, asset/base/lazy-network checks and quality evidence.
7. Freeze a production-preview candidate without HMR, then obtain **new Android
   Edge and Quark Creator acceptance**. Do not label implementation complete from
   desktop or historical V0.2 evidence alone. Archive actual results, not assumed
   phone timings. No main merge/version bump/Pages deployment in this plan.

## Automated test plan

| Group | Required tests / oracle |
| --- | --- |
| Admission | JPEG/PNG/static WebP mixed order, wrong extension, late APNG/GIF/animated WebP rejection, unreadable/corrupt sources; keep prefix regression |
| Source list | append, duplicate same handle with different IDs, up/down clamping, remove/Clear, picker cancel and same-file reselection; last-duplicate release |
| Geometry | native/exif-oriented dimensions, independent maximum width/height, mixed portrait/landscape, odd padding to right/bottom, transparency reset after opaque source; no scaling/crop |
| Source ownership | scan/prepare two passes, <=1 live bitmap, close-before-readback, one Canvas, detached ImageData buffer, no retained prior RGBA; late native decode closes after cancel |
| Broker | same buffer identity, no next preparation before actual accepted + source ACK, reject copied transfer/reorder/double ACK/concurrent pull, reset/end/null behavior |
| Targets | same prepared sequence directly → GIF, WebP, APNG; exactly one selected target constructor; WebP/APNG receive unquantized canonical pixels |
| No GIF intermediate | source adapter has no GIF decoder/writer call; instrument dispatch/quantization calls and compare full-color/semi-alpha outputs. Do not assert “no GIF JS bytes fetched” when shared Worker physically includes GIF code |
| Settings | default GIF/500 ms/forever; 20/27→30/500/10000 ms; reject 19/10001/NaN/Infinity; finite 1/2/3/100 and forever; reject invalid counts |
| Timing/plays | decode-back dimensions/order/total timeline/plays for all targets; per-target timing quantization; same intended timeline despite WebP frame merging |
| Duplicate visuals | all equal sources and repeated adjacent runs; WebP output physical count 1..N, animated one-visual-frame wrapper retains duration/loops; GIF/APNG counts remain N |
| Quality | opaque gradient with >256 colors, semi-transparent PNG edge, procedural photo-like high-color input; GIF expected palette/binary alpha; WebP/APNG preserve prepared canonical color/alpha |
| Alpha oracle | canonical alpha values 0/1/64/127/128/192/254/255 and transparent canvas padding; GIF <=127→transparent, >127→opaque; APNG independent zlib/CRC RGBA oracle; WebP lossless decode-back, distinguish native Canvas source rounding |
| Guards | count 1/2/200/201, exact 16 MiB and overflow, side/pixels/combined-canvas/work before allocation; input count remains guard after merge; output cap/error valid range; no spike defaults |
| Capability/error | missing Worker/ImageBitmap/OffscreenCanvas, missing WebAssembly/WASM fetch/init, missing/unconstructable Worker deflate; typed target-aware errors, old result retained, other targets recover |
| Cancellation | scan/read/native decode/await-ACK/encode/finalize/inspection; rapid Cancel→rerun and Back, delayed A progress/result/readback cannot publish into B; blocked old read cannot spawn concurrent allocation |
| Result lifecycle | no URL before successful independent inspection; reject bad signature/dimensions/plays/timeline/count; retain A after edit/target change/failure/cancel; revoke exactly once on B success/Clear/dispose |
| Result identity | metadata uses actual output format/count/duration/plays; captured UI settings separate from canonical plays; old A download uses A extension after selected target changes |
| Preview | all three formats through existing Viewer, playback/pause/frame inspection, Close returns same sources/settings/result; joined teardown/focus/scroll return; no extra result URL |
| Download | GIF/.gif, WebP/.webp, APNG/.png exact MIME; same result twice and different result, distinct real names, non-zero exact bytes and reopen; no reallocation on clicks |
| UI/i18n | target radios/disabled/ARIA, correct CTA/helpers/progress/result/error in EN/ZH; minimum sources; locale changes during job/result/preview do not reset or regenerate |
| Diagnostics | debug collapsed/nested JSON only, no source identity; measured phase counters; final source and encoder resources plus lastCreationCleanup zero; cancellation native heap unknown retained honestly |

Quality proof is relative to known native-prepared canonical RGBA. Do not compare
new WebP/APNG against GIF as the only oracle: both could inherit the same loss.
For small frames compare every pixel/order/time, not just 64 samples. Preserve
independent APNG inflation/CRC tests and known original geometry fixtures. Label
any large-case sampled checks honestly. Avoid storing all full frames in product
code to satisfy tests; test-only tiny expected arrays are acceptable.

## Desktop validation matrix

Use installed Node 24/npm and installed desktop Edge. No temporary Node/browser
downloads. Use a local **production build under /AniView/** with no HMR. Minimum:

| Workload | Targets / checks |
| --- | --- |
| 2–4 mixed JPEG/PNG/WebP, mixed dimensions/orientation | GIF/WebP/APNG; order/edit, settings/plays, readback/Preview/return and real double download/reopen |
| Gradient / soft-alpha / photo-like, tiny exact-oracle scenes | Three targets; direct-RGBA quality and GIF parity |
| 40×320×240 | Three targets, Cancel→rerun and steady heartbeat/cleanup |
| 200×320×240; 10×1024²; 2–3×2048² | Staged allowed workloads, one job at a time; ownership/workspace/output capacity; no arbitrary mobile promise |
| 201 sources; 4×2048²; wrong/static animation/corrupt input | Controlled errors before unsafe allocation, then successful small rerun |
| Repeated generated results/targets and Preview/Back/Clear | resource and URL balance in one uninterrupted document; also verifying-cancel |
| 320/390/768/1280 widths, EN/ZH | target control/result/error layout, keyboard focus/labels, touch targets; ordinary UI free of engineering workload text |

Run existing core/release-UI regression and Creator GIF historical checks. One
lightweight cross-feature pass covers Viewer/ZIP, an existing animated-image
conversion, animation→MP4 and video→animation with localization; do not repeat
H.264/VP9/VFR/B-frame technology matrices unless shared paths actually change/fail.

## Android validation plan — future, not performed by M10A1

Freeze the M10A2 production-preview build/commit while testing, no Vite HMR or
Pages deployment. Provide working temporary access only when the user is ready;
reuse established LAN/HTTPS/USB options according to availability and capability,
without inventing reachability or codec results.

| Browser | Minimum fresh Creator flow |
| --- | --- |
| Android Edge | mixed static images → GIF/WebP/APNG; edit order/duplicates/duration/finite+forever; target change; Preview/Close; repeated real downloads/reopen |
| Android Quark | mixed static images → WebP/APNG plus a small default-GIF parity check; idle target change with retained old result, Cancel→rerun; Preview/Close; repeated downloads/reopen |
| Both | small 40-frame WebP/APNG workload if mixed set passes; back/Home cleanup; no jank/reload/crash; copy short target/result/cleanup diagnostics |

Escalate to the inherited 10×1024² workload only if the smaller jobs are stable;
do not run multiple large jobs together or repeatedly crash a phone. Confirm
alpha/gradient visually as well as numeric metadata, and keep gallery indexing
separate from actual download-directory preservation. Other phone browsers are
optional; do not reuse old Creator/8B/video acceptance as new M10A2 results.

## Bundle, Pages, security and regression gates

- Home startup: no Creator encoder/source Worker or WASM fetch.
- Creator entry: UI only, no target Worker probe/start; target-only idle switch
  does not reread files. Generate creates source + selected target instance.
- Existing shared-target Worker may physically include all encoder JS; do not
  promise separate APNG/GIF chunks. WebP WASM is fetched only for actual WebP
  encoding/readback paths. Measure new source Worker, Creator and shared chunks.
- Existing nominal comparison: shared encoder is 45,991 B / 16,013 gzip versus old
  Creator GIF 24,191 / 9,240. Total delta is **unknown**, not their difference alone.
  New source/client/UI bytes and chunk regrouping require actual build measurement.
- Keep `new URL('./static-source.worker.ts', import.meta.url)` / existing Vite asset
  resolution and `/AniView/`. Check Worker/WASM MIME/404 and lazy imports in built
  preview. Do not change build config to force per-target splitting for this feature.
- No new dependencies/license surface. Preserve existing notice collection and
  local-only media processing; no file names/content in telemetry or numeric JSON.
- Keep current version, tags/releases/workflows and frozen release docs intact.
  V0.2 full unit behavior remains, with focused shared helper/encoder regression.

## Risks, decisions and stop conditions

| Level | Risk | Required mitigation / stop |
| --- | --- | --- |
| LOW | target strings, MIME/extension, type-only result reuse and internal CreateGif names | parity/ARIA/naming tests; no whole-repo rename or i18n dependency |
| MEDIUM | one legacy Worker becomes source + target Workers; static preparation extraction | explicit two-worker cost, old GIF parity, source helper vendor-free; stop if pixel work migrates to main |
| MEDIUM | stale/cancel during new inspection phase, retained result with different selected target | join full task, captured identity and per-result namer, no URL before inspection |
| MEDIUM | WebP duplicate merge, actual count/timeline versus UI settings metadata | decode-back policy and original timeline/order oracle; separate input/actual counts |
| MEDIUM | native Canvas alpha/color behavior versus original source bytes | oracle prepared canonical pixels; preserve current composition semantics, disclose boundary |
| HIGH | large-frame native/WASM memory, pending ACK/read overlap or leaked Worker/URL | enforce all existing combined limits; <=1 canonical frame; staged desktop/phone checks; stop on overlap, crash or unexplained cleanup imbalance |
| HIGH | broad shared coordinator/video/codec changes masquerading as Creator integration | keep freeze list; stop/replan before touching it; no new codecs/dependencies/limit increases |

Stop and report if maintaining existing GIF settings/geometry/palette/loops requires
codec changes, if a target cannot validate real output/timeline, if an unsupported
capability would need a fallback dependency, if the source adapter needs all-frame
RGBA retention, or if runtime/assets leak into Home. Do not delete meaningful tests,
weaken lint/types, fake stages/metrics, skip output validation, or silently choose
a different Session/coordinator architecture to pass a gate.

## Readiness and next state

No product decision remains open before M10A2 under this plan. Exact future code
size, timings and native-memory ceilings are measurements to collect, not reasons
to fabricate numbers or start a new encoder research phase.

**M10A1 COMPLETE. M10A2 READY.** Existing V0.2 encoder infrastructure is technically
sufficient for direct static-image GIF/WebP/APNG creation. The source adapter,
new product flow and fresh mobile acceptance still need implementation/validation.

**STOP. M10A2 — Unified Multi-format Animation Creator Implementation has not begun.**
