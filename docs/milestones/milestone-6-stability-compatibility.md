# Milestone 6 — Stability & Compatibility

**Status: PENDING ANDROID STABILITY VALIDATION.** This milestone freezes major
product features. Desktop stability work is implemented and measured below;
new Android acceptance is required before PASSED. Earlier Android milestones
are historical evidence, not substitutes for background/foreground and stress
acceptance of this build. No Milestone 7 tagging, release or release notes.

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
| A. Media Stress | Boundary static formats, two-slot large APNG, 1000-frame animations, controlled rejection, logical long durations | New large/long sample check pending |
| B. Lifecycle Stress | 100 rapid switches, immediate open/close, late native/decode responses, latest load/step ownership | New switch/close check pending |
| C. Archive Stress | 1008 entries, 96 mixed media, local 100 MiB ZIP, corrupt/encrypted/unsupported recovery, current-only extraction | New many-entry/recovery check pending |
| D. Interaction Stress | Play+zoom, step/reconstruction+viewport, keyboard burst, fullscreen repetition, resize, interruption | Touch/orientation check pending |
| E. Browser Compatibility | Installed Edge full regression and stress; installed Chrome core smoke | Edge or Chrome + Quark P0 pending; QQ/Xiaomi reduced matrix pending |
| F. Page Lifecycle | Synthetic visibility, genuine desktop tab hide, delayed first frame; injected-clock no-catch-up policy | Actual app switch/lock screen pending |
| G. Error Recovery | Bad loose files/ZIP, limits, missing capability, Worker error/messageerror/send failure/timeout; later good file opens | New recovery smoke pending |
| H. Long-running Stability | Six-round soak with 570 sequential file transitions and source/ZIP replacement | Real-device reasonable-pressure session pending |

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
| Android Edge or Chrome | P0 | Pending new real-device stability acceptance |
| Android Quark | P0 | Pending new real-device stability acceptance |
| Android QQ | P1 | Pending reduced smoke |
| Xiaomi Browser | P1 | Pending reduced smoke |

Required shared capabilities: Canvas 2D, AbortController, ResizeObserver, Pointer
Events and animation-frame scheduling. Animations require Worker; WebP also
requires WASM; APNG requires Worker Blob/ImageBitmap/OffscreenCanvas decoding.
Static viewing needs Blob/ImageBitmap. GIF uses typed-array composition and does
not require OffscreenCanvas. Fullscreen is optional and feature detected.
Missing capabilities show a categorized message; no browser-name routing/fallback.

New P0 Android check: use Edge/Chrome and Quark, open six-format media or
`validation/stability/mixed-96.zip`, verify play/pause, stepping, file navigation,
pinch/pan, orientation and Close/reopen. Open `long-1000.webp` and one boundary
static/APNG sample individually. While playing, switch apps for 10–30 s and
return; the same logical position should resume without rapid hidden-time catch-up.
Repeat while paused, which must stay paused. Lock/unlock in at least one browser
if convenient. Check `recovery.zip` can skip damaged/encrypted/unsupported entries.
`phone-12mp-rejected.jpg` should give a clear limit message and allow another file.
Send the browser results and final runtime/cache JSON; do not combine extreme
loads to deliberately exhaust the device. QQ/Xiaomi need only the reduced
media/ZIP/controls/touch/orientation smoke if available.

## Publication and remaining risks

Implementation publication, actual Actions/Pages result and deployed checks are
recorded after completion; a workflow file alone is not proof of success.

The browser can retain heap pages and native/GPU allocations after logical
cleanup. Native bitmap decode cannot be force-aborted; completion is joined and
late bitmaps closed. WebP codec workspace can allocate under its separate 8 MP
guard before player-level admission rejects >4 MP. Total native/WASM workspaces,
Canvas copies, encoded blobs and browser/device pressure are outside FrameCache.
Silent Worker exit has no reliable browser exit event: a subsequent/pending
request fails by its deadline (15 s decode / 30 s archive); explicit ZIP Close
uses the 2 s fallback. Extreme hostile inputs remain resource sensitive despite
bounds. OEM capability/picker/fullscreen behavior can differ; no actual Android
stability result is claimed before the user tests this deployed version.

Architecture verdict: **Yes**, existing input/decoder/player/viewport/archive/
renderer separation is preserved. Remaining release-readiness blocker: new
Android P0 stability acceptance. Milestone 7 is not started.
