# Milestone 8A2 — Static images to GIF productization

Status: **PASSED**. Android encoding is **PASS**
in Edge and Quark, with QQ providing additional compatibility PASS evidence.
Cancel → rerun, resource cleanup and the near-ceiling real-media workload are
confirmed. Preview and single Download retain their earlier user-reported PASS.
The final real Android confirmation closes **Repeated Download preservation:
PASS**: unique generated filenames, earlier files retained, non-zero sizes and
normal file opening. **Multiple Static Images → Animated GIF is feature-complete
on the V0.2 feature branch.** There are no remaining 8A2 blockers.
Development stays on `feat/v0.2-static-to-gif`. No main merge, production Pages
deployment, version bump, V0.2 tag/release or 8B conversion work is included.
The published v0.1.0 baseline remains
`4a3dc69542ca2923744904cd10ddbf1a35f36ff9`.

## Product flow and architecture

Home adds the secondary **Create GIF** action next to the existing Viewer image
and ZIP actions. The creator workspace is loaded lazily and owns a separate
`CreationSession`. Opening it unmounts the ordinary Viewer source orchestrator,
so desktop drops cannot accidentally append to both workflows.

```text
image picker / file-only drop
  -> VirtualFile handles -> CreationSession
  -> binary source detection and ordered metadata list
  -> product limits and settings
  -> promoted StaticGifEncoder transport
  -> one dedicated module Worker
  -> sequential native decode -> reusable Canvas -> one RGBA -> gifenc
  -> transferable encoded buffer + exact valid range
  -> CreationSession-owned Blob / object URL / result metadata
      -> download link
      -> Blob-backed VirtualFile -> existing GIF decoder / Player / Viewer
```

The passed spike implementation and its existing 58 tests move into
`src/creation/gif/`. There is one encoder implementation; the historical harness
now imports it with an explicit spike limit profile. Production code imports
neither the experiment page nor the engineering harness. `gifenc@1.0.3` moves
from a development dependency to a pinned runtime dependency without changing
version or adding dependencies. CreationSession always supplies the stricter
product profile. The lower-level spike profile remains for historical conformance
tests, never selected by the product UI.

Source IDs and ordered VirtualFile references belong to CreationSession, not
MediaSession. The session owns one latest successful result and URL. Preview
borrows only the generated Blob through a new VirtualFile; it does not append
the creation sources to a viewing session. Preview Close returns to the same
source order, committed settings and result after joining Viewer teardown.

## Sources, settings and UI

- Multiple `image/*` picker input, no capture attribute; add-more appends.
- Desktop drops admit files only, excluding directories, text and URL navigation.
- Binary JPEG, PNG and static WebP only; GIF, APNG and animated WebP are rejected
  with a clear static-source message. Wrong extensions follow their bytes.
- Admission detection uses one temporary prefix of at most 64 KiB per source,
  with original reads for distant PNG chunk headers. Parsing still belongs to
  BinaryFormatDetector; late APNG metadata is not skipped. The prefix is dropped
  after each source, not cached across the list. Actual Checking N / Total is
  shown while reading. Small/large PNG examples reduce native provider reads
  from 4 to 1/2 respectively.
- Duplicate files remain separate frames. Stable IDs protect ordering and stale
  work. Up/Down and Remove have accessible icon actions, clamped end controls and
  at least 44×44 CSS-pixel targets. There are no full-resolution source thumbnails.
- The bounded scrolling list displays position, ellipsized filename, detected
  format and encoded size. Counts and total MiB are visible before generation.
- Partial admission is deterministic: fitting files are accepted in input order,
  excessive/unsupported files are counted and explained, never silently dropped.
- Default uniform frame duration is 500 ms; 20–10000 ms is accepted and rounded
  to the nearest 10 ms on blur/generation. Invalid values cannot generate.
- Loop forever defaults on. Otherwise Play count means total complete plays,
  from 1–100. One play omits the repeat extension; larger counts encode N−1 extra
  repeats, preserving the established decoder semantics.
- The palette remains 256 entries including reserved transparent index zero;
  alpha threshold remains 127. Neither is a user setting.

The page explains native-size centering on the largest transparent Canvas and
the known 256-color/1-bit-alpha limitation. Banding and hard alpha edges are an
informational note. There is no crop, resize, per-frame duration, dithering,
palette editor, ZIP creation input, animated format conversion or video feature.

## Product limits

These limits apply **simultaneously**:

| Resource | Limit |
| --- | ---: |
| Source count | 2–200 |
| Sum of encoded source bytes | 16 MiB |
| Output side | 2048 |
| Output pixels | 4,194,304 |
| Output width × height × frame count | 15,360,000 |

Count and encoded bytes are checked before accepting source handles and again
by the transport/Worker. Oriented dimensions are scanned sequentially; source
metadata and final independent maximum width/height are validated **before**
Canvas allocation, quantization or GIF writes. The existing static dimension
parser accepts an optional validator to share its container parsing; its default
Viewer safety behavior is unchanged and remains tested.

Failures retain the source list. Canvas errors include dimensions and the 2048/
4 MP policy; workload errors ask for fewer/smaller images. Native Blob decode
`InvalidStateError` is classified as a corrupt or browser-unreadable source;
other decode errors, read failure, Worker failure, quantization and encoding
failure retain separate categories. Cancellation is a normal status, not a red
error. No limit is relaxed by debug mode.

## Generation, result ownership and cleanup

Preparing, Encoding N / Total and Finalizing reflect actual Worker messages.
The progress element uses global completed/total work across scan and encoding,
so phase changes cannot reset its value. Source/settings edits are locked during
preparation/encoding; Cancel and Back remain available.

Cancel aborts the generation, joins Worker termination and preserves sources and
settings for an immediate rerun. Session and transport generations independently
discard old progress/results. Native decode and vendor quantization cannot be
preempted mid-call; cooperative checkpoints plus the established 100 ms termination
fallback bound cleanup. Cross-job source reads stay serialized. Closing the
workspace joins pending source checks, async source releases and encoding cleanup;
StrictMode effect replay does not dispose a live workspace.

On success, only the valid transferred byte range becomes a `Blob(image/gif)`.
The capacity-sized ArrayBuffer and Worker are not retained in session state.
The result shows dimensions, frames, stored delay, total-play behavior and size.
An actual download anchor uses the session-owned object URL. Each result gets
a neutral `aniview-animation-<time>-<nonce>-<counter>.gif` suggestion; every normal
click assigns a fresh suggestion synchronously before native download handling.
It creates no additional Blob/URL and publishes no click-time session state.
New success revokes the old URL; Clear and leaving/unmounting revoke it as
well. A failed replacement retains the last successful result. Removing a source
does not delete its underlying device file. Duplicate VirtualFile handles are
released only after their last source reference is removed.

The encoder still holds at most one full RGBA frame, one indexed frame, one
palette, one output Canvas and at most one native bitmap; bitmap close precedes
RGBA readback. It never retains all decoded sources. Result Preview starts only
after the encoder Worker has terminated and uses the existing Viewer's bounded
playback cache; it does not overlap source encoding or add a thumbnail cache.
The one-RGBA metric describes encoding, not a claim that the Viewer's established
animation cache has been replaced or that browser heap/RSS is fixed.

## Diagnostics, privacy and licensing

Only `?debug=1` renders the initially collapsed Creation diagnostics, with nested
Raw JSON. Numbers include generations, cancellations, output bytes, last encode
metrics and existing runtime resource counters. Normal creator UI renders no
diagnostic panel. No filename, pixel or local path is put into diagnostic JSON.
Image processing and download stay local; there is no upload/server encoder or
new telemetry service.

The development build's central component inventory now includes gifenc as a
runtime creator component. Its unchanged full MIT text and quantizer/LZW source
acknowledgements accompany the full `public/third-party-notices.txt` collection.
The historical experimental build reuses that collection rather than duplicating
the notices. Published v0.1.0 assets stay untouched. AniView retains `UNLICENSED`,
`private: true` and package version 0.1.0; README public release claims are unchanged.

## Validation

Formal installed environment: Node **v24.22.1**, npm **11.19.1**, executables under
`D:\tool\nodejs`. Clean `npm ci --prefer-offline --fetch-retries=0
--fetch-timeout=30000` passed for the implementation; the follow-up does not change
dependencies or lockfile. At the committed encoder/download follow-up `a038491`,
lint, typecheck, **49 files / 646 tests** and build passed. This preserves the
initial product's 622 tests and adds 24 regressions
for task yielding, source reads and save names (94 added over the 552-test baseline).
Existing tests were
moved where appropriate and expected error categories updated deliberately;
none was removed or skipped. The later local lifecycle investigation passed
**50 files / 658 tests**, lint, typecheck and build, including 12 temporary
recorder-only tests. Final closeout withdrew that recorder and archived those
12 tests with it; they were not product regressions. **All 646 established
product/spike tests remain present and enabled.**

After cleanup, the formal Node 24 environment freshly passed **npm ci**, lint,
typecheck, **49 files / 646 tests**, and production build. An initial Windows
native-module lock prevented npm ci; stopping the identified project Vite
process released it, and the complete sequence then passed. No dependency,
lockfile, type/lint rule or resource limit was changed to obtain the result.

Fresh post-cleanup desktop acceptance in installed Edge 156 also passed all
**19 product groups**, five workloads and three quality samples. Create GIF,
Generate, actual Cancel → rerun, Preview controls/return and real downloads
passed. Saving one result twice and a different result once produced three
distinct names with exact bytes and preserved both earlier files. Ownership
ended at **18/18 Workers terminated, active 0, peak 1**, **493/493** source
transfers detached, **12/12** result URLs revoked, and zero browser errors.
These fresh desktop checks supplement, rather than repeat, the accepted Android
evidence; cleanup does not change any product behavior.

Session tests cover ordered append/add-more/remove/clear/move, duplicates,
200-count and 16 MiB boundaries, duration normalization and total-play mappings,
real progress, conflicting edits, cancel/rerun/stale protection, result URL
replacement and joined source cleanup. Encoder tests cover product limits and
exact boundaries, pre-quantization rejection, format combinations and corruption
classification. Creator rendering tests cover picker policy, controls/settings,
minimum frames, result download and diagnostics privacy.

The reproducible product browser suite is `npm run test:creation`. It uses the
installed Edge, the built application under `/AniView/`, real file inputs and
saved GIFs, and writes reports/screenshots only under ignored `.tools/creation/`.
Original procedural source generators provide flat/anime-style, gradient and
high-color samples. No external artwork or large generated fixture is committed.

Installed **Edge 156** passed all **19 product groups**, including actual file
selection/add-more/reorder/remove, desktop file-only drop, real progress,
duration/loop mappings, Cancel→rerun, Back during encoding, Preview Play/Pause/
step and return state, and genuine browser downloads. Saving one result twice,
then a different result, produced **three different filenames**; all bytes matched
their results and both earlier files remained unchanged. Saved GIF pixels also
confirmed source order, centering, transparent padding, alpha 127/128 and correct
full-frame disposal. The source list stays bounded at 200 rows and scrolls.

Widths **320/390/768/1280** passed with no horizontal overflow, clipped settings
or filename/control overlap, associated form labels and 44px icon controls.
320/1280 screenshots and all three source/output quality comparisons were
actually inspected. The original Viewer core browser regression (**7 groups**)
and release UI regression (**20 groups**) also pass, including normal picker,
static/animation/ZIP behavior, viewport controls, diagnostics and cleanup.

### Product workloads

Single desktop runs through the actual product file input and Generate button;
time is encoder `totalMs` unless explicitly labelled wall time. Preparation,
native scan and per-stage yields are included; fixture creation and Preview
playback are outside this timing. Every row ended at **active Workers = 0**.

| Sources | Outcome | Time ms | GIF bytes | Peak RGBA frames |
| --- | --- | ---: | ---: | ---: |
| 200×320×240 | Success | 1037.0 | 1,061,230 | 1 |
| 10×1024² | Success | 297.6 | 245,426 | 1 |
| 2×2048² | Success | 212.9 | 117,107 | 1 |
| 3×2048² | Success | 329.9 | 176,555 | 1 |
| 4×2048² | Controlled rejection | 49.6 wall | — | No quantization/encoding started |

The 3×2048² result stays within the existing 15,360,000 frame-pixel budget;
4×2048² exceeds it and emitted scanning progress only. No workload limit was
increased or lowered to hide a failure. The worst main-thread heartbeat gap was
**18.7 ms**. The original desktop run at `970c861` recorded 3151.3 ms / 40.2 ms
for the 200-frame total/heartbeat; the follow-up memoizes the unchanged source
list during progress updates and changes task yielding. These are individual
desktop observations, not an isolated causal estimate or a phone speed claim.

Product probes ended at **18 Workers created / 18 terminated / active 0 / peak
1**, **493/493** source transfers detached and **12/12** created object URLs
revoked. Independent Worker instrumentation closed every successful job's native
bitmap, with peak one and zero live after emission; transferred result buffers
were detached. Result/cache/native allocations remain subject to browser GC.
Reports and screenshots are ignored under `.tools/creation/`.

### Quality regression

The three 256-color source samples reproduce 8A1's exact first-frame RGB error
and encoded output sizes, confirming the promoted product path did not degrade
the tested quantization. The synthetic high-color sample is not a real-camera
photo set. All three frames of each sample were encoded; the numeric metric
below concerns only the first frame.

| Sample | Mean absolute RGB | P95 | Maximum | GIF bytes |
| --- | ---: | ---: | ---: | ---: |
| Flat/anime-style | 0.205 | 2 | 11 | 17,717 |
| Gradient | 2.853 | 8 | 12 | 66,204 |
| High-color | 3.514 | 8 | 18 | 236,180 |

Manual comparison confirms nearly identical flat art and the same clear gradient
banding/color shifts seen in the spike. The UI warning remains visible; no claim
of high-fidelity photographic/gradient export is made.

### Bundle

Node gzip measurements of the tested product follow-up `a038491`, before the
temporary local lifecycle instrumentation:

| Asset | Raw bytes | gzip bytes |
| --- | ---: | ---: |
| Normal initial JS | 289,876 | 87,856 |
| Creator lazy JS | 27,887 | 8,717 |
| Encoder Worker | 24,191 | 9,240 |
| Creator lazy CSS | 6,095 | 1,727 |
| Initial CSS | 10,198 | 2,900 |

Normal JS grows **1,112 B raw / 374 B gzip** from v0.1.0. Startup network
instrumentation fetched only initial JS/CSS; neither the creator chunk nor
encoder Worker loaded until the creation action/job. gifenc's standalone ESM
artifact is 9,098 B / 3,926 B gzip; it is included in the Worker, not added to
initial JS. Bundling/minification prevent treating that standalone number as an
exact additive chunk-size attribution. Existing GIF/APNG/WebP/ZIP Worker and
WASM payloads retain their content. The full development notice collection is
distributed separately and not imported as JavaScript.

## Android product acceptance procedure

**Android product acceptance must use a production preview build without Vite
HMR.** The Vite development server is appropriate for development, debugging
and rapid iteration, but is not the final Android page-lifecycle or release
acceptance environment. See the [closed lifecycle investigation](milestone-8a2-lifecycle-investigation.md).

Use the local-only static fixture server after generating fixtures:

```powershell
npm run build
npm run preview:creation -- --host 0.0.0.0 --port 4200
```

This must run outside the restricted agent environment for phone access; the
8A1 connectivity fix did not require firewall rule changes. Connect phone and
computer to the same trusted Wi-Fi. Open
`http://<computer-LAN-IP>:4200/AniView/?debug=1`.

Original fixture downloads are available locally at
`/AniView/validation/creation/`: 40×320×240 PNGs, 10×1024² PNGs and a mixed static
JPEG/PNG/WebP set. Download and **extract with the phone file manager**, then
select the extracted images in Create GIF. ZIP is only sample delivery; it is
not a creator input. If the OS gallery does not index Downloads, copy extracted
images into Pictures and allow the gallery to discover them.

In **Android Edge and Quark**, test the new product UI: choose/add images,
Up/Down/Remove, duration, finite/forever loops, real progress, Cancel→Generate,
Preview (Play/Pause/step then Close back), Download GIF, Clear and Back. Run the
40-small sequence before the 10×1024² sequence and report timing/response,
any crash/reload, download/save success and the creation Raw JSON after success.
Reopening a downloaded GIF through ordinary Viewer in one browser is useful if
the system picker permits it, but not a blocker. Stop escalating on tab reload
or memory pressure. The prior encoder-only Android results are not counted as
this product UI/download acceptance.

## Android product results and follow-up

The user reported both Edge and Quark passed the requested product workflow,
then identified slow initial loading, Quark downloads missing from the gallery
and silent replacement of older same-name GIFs in Quark. Edge's downloads were
visible in the gallery and did not exhibit the overwrite behavior. These are
user-reported observations; no browser-name workaround is introduced.
Five original snapshots and the user's confirmed browser mapping are retained
in [the Android results](milestone-8a2-android-results.json).

| Browser | Sources | Encode total ms | GIF bytes | Active Workers at snapshot |
| --- | --- | ---: | ---: | ---: |
| Quark | 10×1024² | 2641.5 | 245,426 | 0 |
| Edge | 10×1024² | 3966.9 | 245,426 | 0 |
| Edge | 40×320×240 | 9957.6 | 212,197 | 0 |
| Edge | 2×1220×1783, user-selected | 1612.8 | 1,352,629 | 0 |
| Quark | 40×320×240 | 6254.1 | 212,197 | 0 |

All snapshots show one peak RGBA/bitmap, balanced Worker counts and zero cleanup/
decode/archive errors. Main-thread bitmap counters are separate from Worker
bitmap ownership and do not independently prove Worker bitmap cleanup. The raw
generation/cancellation counts are retained without inferring omitted runs.
These are neither measured heap/RSS peaks nor a controlled browser speed ranking.

For the 40-frame phone runs, measured decode+quantize+write sum to about one
second, leaving substantial time outside the original phase counters. No claim
is made that all that difference is timer delay or image decoding. The follow-up:

1. Uses a reusable MessageChannel task boundary at each existing checkpoint,
   with a timer fallback and both ports closed in Worker finally. Cancellation,
   native resource cleanup, two passes and one-RGBA ownership remain unchanged.
   This avoids the nested timer minimum delay documented by the
   [HTML timers specification](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers).
2. Adds `sourceReadMs` (Worker request/main provider read/transfer round trips),
   `identifyMs`, `composeMs`, `checkpointMs` and `checkpointCount`. Source admission
   time before Generate is separately recorded as `diagnostics.sourceCheckMs`.
   Blob construction/native decode remain inside decodeMs. Picker work before
   the application receives its File handles is outside these counters.
3. Reduces admission reads with a bounded prefix and memoizes source-list rows
   while actual Worker progress continues updating the operation display.
4. Replaces fixed save names with per-result/per-click suggestions and adds an
   ordinary result note directing users to browser downloads/Files.

A local 100-successive-task microbenchmark observed timers 453.6 ms versus
MessageChannel 0.7 ms. Separate same-file Edge observations were 40-small
231.7→199.6 ms and 10-large 409.7→281.0 ms; output bytes stayed 212,197/245,426.
Native decode and other costs also varied, so these changes are not all
attributed to the scheduler. These desktop measurements do not establish an
Android speed improvement or a controlled cross-device comparison.

The file name is a browser suggestion; save behavior remains implementation
defined by the [HTML download rules](https://html.spec.whatwg.org/multipage/links.html#downloading-resources).
The web application cannot force native Android gallery indexing or select the
MediaStore Images destination; Android distinguishes media and download storage
collections ([Android shared media](https://developer.android.com/training/data-storage/shared/media)).
Gallery visibility is therefore documented separately from successful file
download. Users can inspect browser downloads/Files and, if desired, move files
to Pictures using their file manager. Immediate gallery indexing is not promised.

The result-present hint and Preview/Download controls were visually checked at
320/1280 px after the fix. The earlier full Android UI acceptance is retained.
The real-device results below close encoding and cancellation validation.
Repeated-save preservation has its own subsequent explicit Android confirmation,
recorded separately below.

### Final real-user-media validation

The user's final closeout evidence confirms **Android Edge: PASS**, **Android
Quark: PASS**, and **Android QQ: additional compatibility PASS**. QQ supplements
the existing Edge/Quark matrix; it is not a newly defined release gate. These
results use **real user media**, predominantly about 1220–1522 px wide and
1280–2048 px high. They are not a uniform standard fixture or controlled
cross-browser benchmark. Successful reported source sets include:

| Real-user source set | Frame-pixel workload | Result |
| --- | ---: | --- |
| 8 × 1280×1280 | 13,107,200 | Success |
| 4 × 1280×1842 | 9,431,040 | Success |
| 5 × 1451×2048, QQ | 14,858,240 | Success |
| 3 × 1522×2048 | 9,351,168 | Success |
| 4 × 1220×1729 | 8,437,520 | Success |
| 2 × 1220×1783 | 4,350,520 | Success |

Only the QQ mapping explicitly supplied for the near-ceiling case is assigned
here; no additional browser/workload mapping or unreported timings are invented.
The original five timed snapshots above remain historical evidence, not a
substitute for or exhaustive raw record of this later closeout confirmation.

The real Android diagnostic results consistently show:

```text
peakRgbaFrames = 1
peakWorkers = 1
activeWorkers after completion = 0
workersCreated == workersTerminated
cleanupErrors = 0
```

**The verified sequential, single-worker, bounded-memory encoding architecture
remained intact on real Android browsers.** These are application ownership and
workload observations, not OS RSS/heap or GPU-memory measurements.
**Productization preserved the verified 8A1 bounded-memory architecture.**

QQ and Edge diagnostics explicitly recorded **cancellations = 1**, followed by
successful generation. **Cancel → rerun: real Android PASS**; there is no pending
cancellation-validation gate.

QQ's `1451 × 2048 × 5 = 14,858,240` frame-pixels is about 96.7% of the existing
15,360,000 ceiling. **Real-device evidence supports the current workload ceiling;
no limit adjustment is required by this validation.** Every product limit above
remains unchanged.

### Interpreting Android source-check timing

Some Android `diagnostics.sourceCheckMs` readings reached tens of seconds during
foreground/background switching and copying diagnostic information. This is a
**wall-clock measurement**, which can include provider waits, browser background
scheduling, user interaction pauses and development-server lifecycle events.
It is not pure image-check CPU time and does not establish a performance
regression by itself.

Interpret encoding performance primarily through `metrics.totalMs`, `decodeMs`,
`quantizeMs`, `writeMs` and `sourceReadMs`, together with the actual foreground/
background behavior. These asynchronous stage and total timings are not
automatically CPU-only measurements either. No phone speed ranking or numeric
performance regression is inferred from an interrupted wall-clock interval.

### Final Android download confirmation

**Repeated Download preservation: PASS.** The user's final real Android
confirmation reports download-directory screenshot evidence and actual file
opening checks:

- Multiple downloads produced distinct GIF files with unique generated filenames.
- Earlier downloaded files remained present; no overwrite or removal was observed.
- Downloaded GIF files had non-zero sizes and opened normally.

This closes the final user-flow blocker after the filename fix. It is
user-provided real-device evidence, not a claim of independently operating the
phone or inspecting an image unavailable to this session. No private filename,
media content or screenshot is added as a permanent product example.

### Final product-flow reconciliation

| Check | Status | Evidence |
| --- | --- | --- |
| Generate | PASS | Final Edge/Quark real-user-media results; QQ additional PASS |
| Add more images | PASS | Earlier Edge/Quark full workflow and desktop product regression |
| Remove | PASS | Earlier full workflow and desktop ordered-source checks |
| Move Up / Move Down | PASS | Source ordering validated in the full workflow and desktop regression |
| Clear | PASS | Full workflow and source/result cleanup regression |
| Global frame duration | PASS | Full workflow; boundary/normalization/output-delay checks |
| Loop forever | PASS | Full workflow and encoded repeat-extension checks |
| Finite play count | PASS | Full workflow; once/finite total-play mappings |
| Progress | PASS | Real Worker progress and monotonic work counters |
| Cancel → rerun | PASS | QQ and Edge cancellation counter followed by successful generation |
| Preview | PASS, user-reported | Earlier Edge/Quark complete requested product workflow, including Preview and return |
| Single Download | PASS, user-reported | Actual saves reported in Edge/Quark; gallery visibility is browser/device-dependent |
| Repeated Download preservation | **PASS** | Final Android confirmation: distinct files, earlier files retained, non-zero sizes and normal opening; desktop byte-preservation regression also passes |
| Result lifecycle cleanup | PASS | Replacement/Clear/Back URL revocation and ownership regression |
| Worker cleanup | PASS | Real Android active Workers 0, balanced created/terminated counts, cleanupErrors 0 |
| Error recovery | PASS | Controlled failure retains usable source/session state; subsequent generation succeeds in product regression |
| Production-preview background lifecycle | Reported normal | Edge and Quark B; development A reproduces HMR reload, investigation CLOSED |

The lifecycle comparison has no QQ production-preview evidence, so QQ is not
added to that comparison. Exact Android lifecycle repetition counts and a
separate Blob-present result were not supplied; no fabricated counts or new
lifecycle blocker are introduced. No crash/reload was reported in the B
production-preview comparison.

## Final diagnostics audit and cleanup

Every previously uncommitted path was reviewed before cleanup. **A** denotes a
retained product-worthy diagnostic/tool correction; **B** denotes temporary
investigation instrumentation. No blind reset or blanket checkout was used.

| Category | Audited path | Final disposition |
| --- | --- | --- |
| B | `src/app/App.tsx` | Removed temporary panel/mount/navigation tracing; original committed App restored |
| B | `src/app/MediaApp.tsx` | Removed the observation-only screen hook |
| B | `src/creation/CreatorWorkspace.tsx` | Removed the observation-only hook; original Session ownership unchanged |
| B | `src/main.tsx` | Removed temporary boot initialization and HMR event tracing |
| B | `src/components/DiagnosticsPanel.css` | Removed the temporary panel style |
| B | `tools/creation/browser.mjs` | Removed the investigation-only background-throttling option; original acceptance helper restored |
| A | `tools/creation/preview.mjs` | Retained the accurate “production preview (no HMR)” fixture-link wording; serving behavior unchanged |
| B | `src/app/lifecycle-diagnostics.ts` | Removed from runtime; original retained in local ignored archive |
| B | `src/app/lifecycle-diagnostics.test.ts` | Archived its 12 temporary recorder tests; all 646 product/spike tests retained |
| B | `src/app/use-lifecycle-screen.ts` | Removed from runtime and locally archived |
| B | `src/components/LifecycleDiagnostics.tsx` | Removed temporary UI and locally archived |
| B | `tools/lifecycle/README.md` | Locally archived as investigation-only tooling |
| B | `tools/lifecycle/run-browser.mjs` | Locally archived; not retained as a product acceptance tool |
| B | `docs/milestones/milestone-8a2-lifecycle-android-results.json` | Local event evidence archived; causal excerpts remain in the closed investigation document |

The seven untracked temporary files were moved individually into ignored
`.tools/lifecycle/archive/`; the captured reports remain local. Investigation
LAN services were stopped after the device test window. No raw dump, test banner,
boot counter, sessionStorage journal, HMR-specific hook or lifecycle panel remains
in the product runtime. Restored source and the browser helper match committed
product code exactly.

Existing **Creation diagnostics under `?debug=1`** remain unchanged: generation
and cancellation counts, last output bytes, source-check timing, encode timing
breakdown, peak RGBA frames, Worker created/terminated/active counts and cleanup
errors. They are local-only numeric diagnostics with no filenames, media pixels,
remote upload or product behavior change. Their existing tests and the final
desktop acceptance exercise generation, cancellation and ownership cleanup.
This preserves useful formal diagnostics without promoting the investigation
recorder into a permanent Creator feature.

## Known limitations and release state

GIF remains limited to **256 colors**, **no dithering** and **1-bit transparency**.
Visible gradient banding/color shifts and hard edges replacing semi-transparent
edges remain expected quality limitations. Timing is global per-frame duration
only; there is no crop/resize editing. All source-count, encoded-byte, output-size
and frame-pixel resource limits remain as documented above.

Work stays on `feat/v0.2-static-to-gif`. **main is unchanged**, the **v0.1.0 tag
is unchanged**, and **production GitHub Pages remains AniView v0.1.0**. No merge,
V0.2 deployment, tag, GitHub Release or 8B work is part of this closeout.

## Decision

**Milestone 8A1: PASSED.** Its encoder verdict remains **gifenc: ACCEPT WITH
LIMITATIONS**.

**Milestone 8A2: PASSED.** Generate, Cancel → rerun, Preview, Single Download,
Repeated Download preservation, cleanup and production-preview lifecycle
acceptance are complete. The lifecycle investigation remains **CLOSED** and
requires no product recovery or persistence change.

**Multiple Static Images → Animated GIF is feature-complete on the V0.2 feature
branch.** The implementation preserves the verified sequential, single-worker,
bounded-memory architecture from Milestone 8A1. Known GIF quality and resource
limitations remain documented. **Remaining blockers: None.**

**V0.2 itself is not released.** No main merge, production deployment, tag or
GitHub Release is implied. **Milestone 8B has not started.**
