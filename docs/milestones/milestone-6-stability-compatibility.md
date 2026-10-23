# Milestone 6 — Stability & Compatibility

**Status: Milestone 6 PASSED (2026-10-24).** Desktop stability work, CI, Pages
and production checks pass. The user confirmed the new Android P0 stability
checklist passed in Quark and Edge and supplied six runtime snapshots per browser.
These are new Milestone 6 results, separate from historical Android acceptance.
No Milestone 7 tagging, release or release notes; Milestone 7 is not started.

## Scope and corrections

The existing input → VirtualFile → detector → static source/animation decoder →
bounded cache/player → renderer pipeline is preserved. No new dependency, format,
conversion, export, timeline, seek or navigation feature is introduced.

Corrections cover:

- Pause scheduling when hidden; preserve playing/paused intent and remaining
  frame time. Resume from the current logical frame, without hidden-time catch-up.
- Defer first-frame, loop, Replay and backward-reconstruction presentation while
  hidden. Worker/cache work may finish within the same bounded budget. Generation
  invalidation still wins on Replay, switch or Close.
- Coalesce asynchronous step requests to one latest direction; one sequential
  producer/reset at a time. UI keyboard requests can reach this policy while a
  reconstruction runs. Replay can supersede reconstruction.
- Join failure cleanup, repeated Close and concurrent load ownership; dispose
  replaced sequences even if never decoded. A Canvas clear failure still releases
  the decoder/cache. Cleanup faults are counted locally instead of silently lost.
- Guard ZIP cancellation sends, reject a dead Worker before publishing a ready
  session, and avoid reusing an already-aborted same-entry extraction.
- Validate Blob/ImageBitmap capability before full static reads; cancellation
  during the decoding-phase callback avoids native allocation. Late native
  bitmaps are closed. Shared viewer capability errors remain clear and recoverable.
- Clear gestures/captures across resize, fullscreen and background interruption;
  synchronize real fullscreen state on return and dispose inactivity timers.
- Preserve Loading and disabled playback controls if visibility changes before
  the first decoded frame has arrived.

PLAN.md, AGENTS.md and earlier milestone documents are unchanged.

## Stability domains

| Domain | Desktop evidence | Android status |
| --- | --- | --- |
| A. Media Stress | Boundary static formats, two-slot large APNG, 1000-frame animations, controlled rejection, logical long durations | Large/long sample checklist passed, user-reported |
| B. Lifecycle Stress | 100 rapid switches, immediate open/close, late native/decode responses, latest load/step ownership | Navigation/Close/reopen passed; all supplied post-close resource snapshots idle |
| C. Archive Stress | 1008 entries, 96 mixed media, local 100 MiB ZIP, corrupt/encrypted/unsupported recovery, current-only extraction | 96-media ZIP opening/first-six navigation and recovery checklist passed; no mobile 100 MiB/1008-entry run claimed |
| D. Interaction Stress | Play+zoom, step/reconstruction+viewport, keyboard burst, fullscreen repetition, resize, interruption | Touch/pan/orientation checklist passed, user-reported |
| E. Browser Compatibility | Installed Edge full regression and stress; installed Chrome core smoke | Edge + Quark P0 passed; QQ/Xiaomi P1 not retested |
| F. Page Lifecycle | Synthetic visibility, genuine desktop tab hide, delayed first frame; injected-clock no-catch-up policy | Playing/paused app-switch checklist passed; separate lock-screen details not supplied |
| G. Error Recovery | Bad loose files/ZIP, limits, missing capability, Worker error/messageerror/send failure/timeout; later good file opens | Limit/recovery ZIP checklist passed, user-reported |
| H. Long-running Stability | Six-round soak with 570 sequential file transitions and source/ZIP replacement | Requested real-device sequence passed; no timed Android soak or transition-count measurement supplied |

## Unified resource policy

All values are application safety policy, not estimates of available device RAM.

| Resource | Limit / policy |
| --- | --- |
| Encoded ordinary media / extracted media entry | 64 MiB |
| Static pixels | 4,194,304; unchanged |
| Static edge | 16,384 pixels |
| Animation decoded full RGBA frame | 16 MiB / 4,194,304 pixels under automatic player budget |
| Animation edge | Format/container bounds; no separate shared edge constant in the player |
| Normal frame cache | 16 MiB and at most six frames, current/history/prefetch sharing the budget |
| Large-frame cache | Exactly enough for current+next when needed; automatic ceiling 32 MiB; explicit custom budgets stay strict |
| WebP codec preflight | Separate C/WASM 64 MiB encoded / 8,388,608 pixel guard; player rejects frames over 4,194,304 before presentation |
| GIF/APNG descriptors/work | 10,000 frames; 1 GiB declared full-frame/inflated work; bounded parser structures |
| Display Canvas backing | 8,192 per edge / 16,777,216 pixels; DPR reduced as needed |
| Renderer source Canvas guard | 16,384 per edge / 16,777,216 pixels; source admission is stricter |
| ZIP encoded size | 512 MiB |
| ZIP central-directory read/allocation | 16 MiB |
| ZIP entries | 10,000 |
| ZIP entry uncompressed size | 64 MiB |
| ZIP total uncompressed declaration | 2 GiB; metadata guard, never an extract-all reservation |
| ZIP compression ratio | 1000:1 |
| Archive path / cumulative path lengths | 1024 / 2,097,152 UTF-16 code units |
| Viewing list | 1000 references, for both loose files and ZIP candidates |
| Worker deadlines | Animation request 15 s; ZIP metadata/extract 30 s; explicit ZIP close watchdog 2 s |
| Total browser memory/RSS | No global hard limit; codec/native/GPU/Canvas allocator dependent |

Static and animation source budgets are aligned with ZIP entry admission. ZIP
adds independent archive/path/ratio/integrity guards because it is a compressed
container. A safe extension controls discovery only; bytes still determine format.

**12 MP decision: keep the current static pixel ceiling.** A 4000×3000 image
requires 48,000,000 RGBA bytes (~45.8 MiB) for one bitmap. The private renderer
source copy adds another ~45.8 MiB, before the DPR display backing (up to 64 MiB),
encoded data and native decode workspace. Desktop decoding capability and a
`deviceMemory` hint alone do not establish safe Android support. Real, valid
12 MP JPEG/PNG/WebP encodings were tested for clear rejection before native
bitmap creation and successful navigation to a small good image. No silent
downsampling, dimension forgery or unconditional limit increase was added.

## Ownership and page lifecycle

| Owner | Owns | Release / invalidation |
| --- | --- | --- |
| MediaSession | Ordered VirtualFile references and current ID | Remove/Clear/source replacement |
| Viewer keyed lifetime | AbortController, renderer, viewport/gesture/listener ownership, one static source or player | Mark inactive, abort, detach, close, join shared transition gate |
| Animation sequence / transport | Encoded input, one format Worker, pending request deadline | Dispose terminates Worker and rejects pending work; stale IDs ignored |
| FrameBuffer/cache | One incremental producer and bounded full RGBA frames | Evict/reset/close disposes frames; late results rejected by generation |
| StaticImageSource | One native bitmap | Actual bitmap.close on switch/remove/Clear/Close or late cancellation |
| CanvasRenderer | Private copied pixels and bounded display backing | Clear/dispose shrinks backing; borrowed frame/bitmap not retained |
| ArchiveSession | Original ZIP Blob, bounded metadata and one current extracted Blob | Abort current extraction, drop current Blob/metadata, close reader and terminate Worker |
| Fullscreen controller | Browser listeners and one inactivity timer | Disconnect; resync fullscreenElement after foregrounding |

Worker lifetimes are media/session scoped, with no shared idle application Worker.
zip.js internal workers remain disabled. The archive Worker alone owns ZipReader
and performs DEFLATE away from the UI thread. Visiting entries does not create a
visited-entry Blob cache.

`visibilitychange` updates `AnimationPlayer.setBackgrounded()`. Hidden media may
complete bounded prefetch/reconstruction, but does not commit a new presentation.
Foregrounding commits a valid deferred frame and resumes only preserved playing
intent. Explicit Pause clears that intent. ZIP extraction may finish once while
hidden; the result remains session scoped and is reused on return, without a
duplicate extraction. Foreground state does not revive an old generation/session.
Fullscreen is checked against the browser, rather than assumed to survive hiding.
See the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

## Fixtures and reproducibility

Generators use original AniView solid pixels/quadrants and original conformance
payloads, CC0-1.0. The test encoder is the installed browser Canvas encoder,
existing PNG fixture builder/omggif writer, or original lossless WebP chunks.
These are test tools, not new product encoders. No private user file is published.

- `tools/stability/media-fixtures.mjs`: valid 2048² and 4000×3000 JPEG/PNG/WebP;
  three 1000-frame 20 ms animations; three 20-minute logical timelines; 2048²
  two-frame APNG; 3000² rejection APNG; seven corrupt/renamed media inputs.
- `tools/stability/archive-fixtures.mjs`: 1008-entry, 96-media, mixed damaged/
  encrypted/CRC-failed/unsupported archives and an optional stored 100 MiB ZIP.
- `tools/stability/publish-fixtures.mjs`: copies only 11 small original samples,
  642,420 bytes in total, to `public/validation/stability/`, with `samples.json`.
  The 100 MiB ZIP and generated debug outputs remain ignored under `.tools/`.

Use installed Node 24/npm, then:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:browser
npm run test:stress
npm run test:soak
```

The browser/stress commands use native Node WebSocket/CDP and an installed
browser. They start/stop a loopback production preview and isolated browser
profiles. `BROWSER_PATH` selects an installed executable; `EDGE_PATH` remains
compatible. On Windows the default is installed Edge; on Linux it is
`/usr/bin/google-chrome`. Set `ANIVIEW_TEST_PORT` to run independent previews.
No npm/browser download is performed by the harness. Default unit tests stay fast.
Stress/soak generate ignored inputs and are documented local/optional checks.

CI runs the short core browser regression after build using the runner's installed
Chrome, before official Pages artifact/deployment steps. PR validation still never
deploys. The [official runner image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
documents installed browsers; the actual CI result remains the acceptance evidence.

## Local and desktop evidence (2026-10-24)

Installed Windows Node **v24.22.1** / npm **11.19.1**, executables under
`D:\tool\nodejs`. No temporary Node or browser installation was used.
`npm ci`, lint, typecheck, **38 test files / 469 tests**, and production build pass.
This adds 64 unit tests to the 405-test Milestone 5 baseline. New tests cover
visibility/timing, step/load concurrency, failed cleanup, late static allocation,
archive races, transport failures, diagnostics and required capabilities.

The existing seven installed Edge suites pass **180 groups**: Viewer UX 64,
input 33, archive 40, WebP Viewer 8, APNG 15, GIF 11 and isolated WebP spike 9.
The UX run ended with 18/18 Workers, active 0; 29/29 static bitmaps, live 0;
5790 detached RGBA transfers and at most one APNG temporary bitmap, live 0 after
each emission. Three-codec cached previous-frame UI observations were ~0.6 ms;
first reconstructed previous ~15.2/31.7/16.0 ms (WebP/APNG/GIF), peak six cached
frames, no underruns. These include UI polling and are not isolated codec latency.

Final core smoke passed on **Edge 155** and **Chrome 153**, including actual
desktop tab activation: both observed hidden frame 17 remaining paused at frame
17 during the observation, then resumed prior intent. Synthetic visibility tests
also cover prior paused intent. A real first-frame response was held while
visibility changed: Loading and disabled controls persisted; no hidden first
paint occurred; foreground paint and subsequent step succeeded. Both browsers
provided working Fullscreen in this run. This is desktop evidence, not Android.

The final-build Edge soak ran **144.5 seconds**: 570 sequential file transitions
plus 100 rapid switches, 24 immediate open/close cycles and six source/ZIP rounds.
**409 Workers created/terminated** (131 WebP, 127 APNG, 137 GIF, 14 ZIP), active
0; **396 static bitmaps created/closed**, live 0; **12 archive sessions opened/
closed**, active 0. Independent browser instrumentation matched application
diagnostics. Peak concurrency was two Workers (ZIP + current decoder), one static
bitmap. 6198 RGBA transfers detached; 3901 observed APNG frame emissions peaked
at one temporary bitmap and returned to zero after emission. No page exceptions
or unexpected console errors were observed. Error counters reflect deliberate
bad-input cases, not uncaught failures; cleanupErrors stayed zero.

Boundary JPEG/PNG/WebP (2048²) opened, zoomed/panned/resized and released. The
two-frame 2048² APNG peaked at exactly **33,554,432 bytes / two cached frames**;
3000² APNG and valid 12 MP static images were rejected clearly and later good
files opened. The three 1000-frame streams played beyond frame 800; evicted
history reconstructed 802/804/804 frames without retaining that history: each
tiny fixture peaked at **six frames / 96 bytes**, with zero underruns. Unit-clock
testing separately traverses 1000 frames from 820 to 20 and a 30-minute variable
duration timeline, including pause/resume, finite end and zero/short timing.
GIF 0/1 centisecond delays still normalize to 100 ms; >=2 uses centiseconds.

All 96 mixed ZIP media were visited; the 1008-entry ZIP exposed eight media;
the **104,870,471-byte** ZIP opened metadata and its six media. Maximum retained
extracted output in these archives was **1166 bytes**, matching one current
fixture, not all visited data. Mixed good → damaged → encrypted → good →
unsupported → APNG → bad CRC → good static entries remained navigable. Damaged
ZIP directories and unsupported methods failed clearly; a new good file opened.

Soak round durations were ~11.6–12.2 s without progressive slowdown. Observed
JS heap varied ~4.4–7.6 MB during six rounds (initial ~1.6 MB; after-close ~6.6 MB).
No >50 ms long tasks were observed in that run. These are observational desktop
metrics: no forced-GC/RSS return-to-baseline or universal leak-free/OOM claim.

## Runtime diagnostics and privacy

Only development and `?debug=1` collect numeric ownership counters. The debug
panel remains available after Close for final counts. Counters are recorded at
actual Worker creation/termination, bitmap acquisition/close, archive accepted
open/termination, extraction request/completion/discard and normalized failures.
Resource release closures are idempotent; tests cover double cleanup and ordinary
production no-op behavior. Player cache/step/viewport metrics stay in their
existing debug outputs; they are not inferred resource ownership counts.

Preflight unsupported/encrypted/limit rejection and intentional cancellation do
not all count as decoder/archive failures. Counts describe their named ownership
or transport event, not a total user-visible-error tally. Diagnostics contain no
filename, archive path, password, user bytes, stack trace or network upload.
`?debug=1` changes observation only, never resource limits or decode policy.

## Browser matrix and Android acceptance

| Browser | Priority | This milestone result |
| --- | --- | --- |
| Desktop Edge 155 | P0 | PASS: full regression, core, stress and soak |
| Desktop Chrome 153 | P1 | PASS: six-format/core/ZIP/error/visibility/fullscreen smoke |
| Android Edge | P0 | PASS: new checklist and post-close runtime snapshots, user-reported |
| Android Quark | P0 | PASS: new checklist and post-close runtime snapshots, user-reported |
| Android Chrome | P0 alternative to Edge | Not retested in this milestone; no new Chrome result claimed |
| Android QQ | P1 | Reduced smoke not supplied in this milestone |
| Xiaomi Browser | P1 | Reduced smoke not supplied in this milestone |

Required shared capabilities: Canvas 2D, AbortController, ResizeObserver, Pointer
Events and animation-frame scheduling. Animations require Worker; WebP also
requires WASM; APNG requires Worker Blob/ImageBitmap/OffscreenCanvas decoding.
Static viewing needs Blob/ImageBitmap. GIF uses typed-array composition and does
not require OffscreenCanvas. Fullscreen is optional and feature detected.
Missing capabilities show a categorized message; no browser-name routing/fallback.

The requested P0 checklist covered six-format opening/first-six navigation in
`validation/stability/mixed-96.zip`, play/pause, stepping, rapid file navigation,
pinch/pan, orientation and Close/reopen. It included `long-1000.webp` past frame
800, repeated backward steps and Replay; app switching for 10–30 s while playing
and while paused; separate boundary JPEG and large-frame APNG checks; controlled
12 MP rejection followed by a good file; and navigation past damaged, encrypted,
unsupported and bad-CRC entries in `recovery.zip`. Lock/unlock was requested if
convenient. These original samples remain available for reproduction.

On 2026-10-24 the user reported **“夸克均正常”** and **“edge上也均正常”** in
response to that new checklist. This completes the required Android P0 gate
(Edge or Chrome plus Quark), including user-reported background/foreground and
large/long-media functionality. No stutter, crash or other issue was reported.
This is user-reported real-device acceptance, not an independently observed
Android browser run. Device/browser versions, a separate lock-screen outcome,
per-browser Fullscreen capability and new frame-cache/heap/RSS/latency data were
not supplied. No precise Android cache or performance measurements are inferred
from the functional response or resource-count snapshots.

Each browser supplied six cumulative runtime snapshots. Every snapshot showed
zero active Workers, bitmaps and archive sessions, with cleanupErrors zero.
Snapshots are successive observations, not six independent counts to add up.
The final snapshot from each browser was:

| Android browser | Workers created / terminated | Bitmaps created / closed | Archives opened / closed | Extraction started / completed | archiveErrors | cleanupErrors |
| --- | --- | --- | --- | --- | ---: | ---: |
| Quark | 34 / 34 | 19 / 19 | 5 / 5 | 42 / 41 | 2 | 0 |
| Edge | 13 / 13 | 7 / 7 | 2 / 2 | 19 / 18 | 1 | 0 |

Both final snapshots had **activeWorkers = activeBitmaps = activeArchiveSessions
= 0**, peakWorkers 2 and peakBitmaps 1. Their decoderErrors, staticDecodeErrors,
entryExtractionsDiscarded and staleResultsDiscarded counters were also zero.
The nonzero archiveErrors are retained as reported. The checklist intentionally
included damaged archives/entries; aggregate counters do not identify which
specific operations produced them. Likewise, started/completed differing by one
does not establish a particular cancellation or failure. These are handled-event
counters, not evidence of a crash or a retained resource.

Final user-supplied snapshots (unchanged numeric values):

```json
{
  "Quark": {"workersCreated":34,"workersTerminated":34,"activeWorkers":0,"peakWorkers":2,"bitmapsCreated":19,"bitmapsClosed":19,"activeBitmaps":0,"peakBitmaps":1,"archiveSessionsOpened":5,"archiveSessionsClosed":5,"activeArchiveSessions":0,"entryExtractionsStarted":42,"entryExtractionsCompleted":41,"entryExtractionsDiscarded":0,"staleResultsDiscarded":0,"decoderErrors":0,"staticDecodeErrors":0,"archiveErrors":2,"cleanupErrors":0},
  "Edge": {"workersCreated":13,"workersTerminated":13,"activeWorkers":0,"peakWorkers":2,"bitmapsCreated":7,"bitmapsClosed":7,"activeBitmaps":0,"peakBitmaps":1,"archiveSessionsOpened":2,"archiveSessionsClosed":2,"activeArchiveSessions":0,"entryExtractionsStarted":19,"entryExtractionsCompleted":18,"entryExtractionsDiscarded":0,"staleResultsDiscarded":0,"decoderErrors":0,"staticDecodeErrors":0,"archiveErrors":1,"cleanupErrors":0}
}
```

QQ/Xiaomi reduced P1 smoke was not supplied; it remains a coverage limitation,
with no new pass claimed. The task's milestone status rule makes the new P0
acceptance the closing gate, which is now satisfied.

## Publication and remaining risks

Implementation commit: `fc74e2e0e60b4e9a64060ea2dd0de0b9ff03d8ea`
(`chore: harden AniView stability and compatibility`). Published to main using
the established Git Data API fallback, verifying blob/tree/commit hashes and
updating the ref without force. No repository settings changed.

[Actions run 39999656499](https://github.com/ZZH-0427/AniView/actions/runs/39999656499)
completed successfully: Node 24/npm ci, lint, typecheck, 469 unit tests, build,
the new installed-Chrome core browser regression, official Pages artifact and
deployment all passed. The browser step really ran; it was not inferred from
the workflow configuration. Extended stress/soak remain outside normal CI.

Real installed Edge checks at `https://ZZH-0427.github.io/AniView/?debug=1`
passed both the seven core stability groups and the complete **64 Viewer UX
groups**, including static/animation/ZIP, exact pixels and EXIF, previous/next
frame and bounded reconstruction, zoom/pan/gestures, fullscreen, responsive
layout, delayed cancellation and error recovery. Core resources ended at 10/10
Workers and 11/11 static bitmaps, all inactive. The full Viewer run ended at
18/18 Workers and 29/29 static bitmaps, all inactive; 5792 RGBA transfers detached;
1435 APNG emissions peaked at one temporary bitmap and zero after emission.

The production core also observed a genuine desktop hidden tab preserving frame
17 and paused state; returning restored prior playing intent. Holding a real
first-frame response confirmed visibility changes did not enable incomplete
media, hidden painting stayed deferred, and foreground paint/step succeeded.
These are desktop lifecycle results, not an Android app-switch/lock-screen claim.

All **26** checked JS/CSS/Worker/WASM, favicon and original acceptance-resource
responses were HTTP 200 beneath `/AniView/` and matched the tested local build
SHA-256, including all new stability samples. No page exceptions, unexpected
console errors or asset 404s were observed. Main JS is ~279.60 kB / 85.67 kB gzip;
ZIP remains a lazy separate chunk/Worker. Normal startup still does not load ZIP.

Browser reports, screenshots, heap observations and the local 100 MiB archive
remain ignored under `.tools/`. The reproducible tools and small acceptance
inputs are committed. The new Android P0 request was sent after these production
checks and has now passed as recorded above. Milestone 6 is closed.

The browser can retain heap pages and native/GPU allocations after logical
cleanup. Native bitmap decode cannot be force-aborted; completion is joined and
late bitmaps closed. WebP codec workspace can allocate under its separate 8 MP
guard before player-level admission rejects >4 MP. Total native/WASM workspaces,
Canvas copies, encoded blobs and browser/device pressure are outside FrameCache.
Silent Worker exit has no reliable browser exit event: a subsequent/pending
request fails by its deadline (15 s decode / 30 s archive); explicit ZIP Close
uses the 2 s fallback. Extreme hostile inputs remain resource sensitive despite
bounds. OEM capability/picker/fullscreen behavior can differ. The Android reports
above cover Edge and Quark; they do not establish equivalent results in every
browser or on every device.

Architecture verdict: **Yes**, existing input/decoder/player/viewport/archive/
renderer separation is preserved. **Milestone 6: PASSED. Ready for Milestone 7 —
V0.1 Release.** Milestone 7 is not started; no V0.1 release or tag is created here.
