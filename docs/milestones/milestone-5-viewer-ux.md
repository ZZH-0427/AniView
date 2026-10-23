# Milestone 5: Viewer UX

**Status: Milestone 5 PASSED.** Implementation, local checks, combined desktop
acceptance, GitHub Actions/Pages and actual production checks pass. The user
confirmed the complete Android Viewer checklist passed in Quark and Edge on
2026-10-23. Milestone 6 is not started.

## Architecture and opening behavior

The existing `VirtualFile → MediaSession → BinaryFormatDetector` input path now
ends in `src/formats/open-media.ts`, which returns a discriminated static or
animation capability. WebP/APNG/GIF still use their existing Worker adapters,
`AnimationSequence`, `FrameBuffer`, `ByteBudgetFrameCache` and `AnimationPlayer`.
The old `openAnimation()` entry remains available to the isolated WebP spike.

JPEG/PNG/static WebP instead use `StaticImageSource → ImageBitmap →
CanvasRenderer`, with no fake one-frame sequence, animation player, timing or
frame cache. The UI branches on static/animation capabilities, not GIF/APNG/WebP
codec details. Loose files, dropped files and `ArchiveEntryVirtualFile` all use
this same opener and viewer. ZIP continues to extract only the current entry;
opening metadata or a mixed-media ZIP never eagerly decodes its static images.

`src/pages/Viewer/use-viewer-media.ts` owns one keyed media lifetime and the
player/source/renderer resources. `Viewer.tsx` renders controls and delegates
actions. Viewport calculations and gesture state live under `src/renderer/`;
the fullscreen controller and keyboard mapping are separate Viewer modules.
No decoder, cache or format-specific player was replaced for these controls.

Opening a new animation initially presents frame 1 **paused**, matching the
previous formal viewer. Play/Resume starts scheduling; Replay resets to frame 1
and starts playback. A different file gets its own default paused state rather
than inheriting the old file's playback state. Existing normalized finite and
infinite loop behavior remains automatic once playback starts. A static source
opens Ready and has no animation controls or frame counter.

## Viewport: Fit, Actual and Custom

`ViewportController` owns immutable observable snapshots containing content and
viewport dimensions, `mode`, `scale`, `fitScale`, `offsetX/Y` and zoom bounds.
Scale maps image pixels to **CSS pixels**, independently of display DPR.

Fit uses `min(viewportWidth / imageWidth, viewportHeight / imageHeight)` and
centers the image, including upscaling tiny images. Actual/100% is scale 1: one
image pixel per CSS pixel, without resizing the image resource. Custom records
manual zoom. Fit and Actual remain explicit modes so resize/orientation changes
can preserve the requested behavior.

The minimum interactive zoom is `min(fitScale, 1)` so Actual remains reachable
when Fit enlarges a small image. The maximum is `max(8, 2 * fitScale)`: normally
at least 800%, but tiny images may require more simply to fit and still receive
a bounded 2×-Fit detail view. These limits bound the transform, not backing-store
dimensions. During resize, Custom/Actual preserve their current scale and visual
center when possible; Custom may remain below a newly larger Fit minimum until
the next explicit zoom. Fit always refits and centers.

Each axis centers content when it fits. Larger content is clamped between the
viewport's far edge and zero, preventing panning it entirely away. A new file
resets Fit; animation-frame updates do not reset scale or offsets. Window resize,
mobile orientation and fullscreen changes update the existing viewport rather
than reopening media or resetting playback.

## Mouse and touch interactions

Zoom buttons multiply/divide scale by 1.25 around the viewport center. Wheel
zoom uses the pointer position, with pixel/line/page delta normalization and
bounded exponential sensitivity. Pointer-centered zoom preserves the image
coordinate under that point unless an edge clamp prevents it. Wheel cancellation
is surface-local and occurs only when zoom changes.

Single-pointer dragging pans, using pointer capture to survive leaving the
surface. Two pointers use their distance ratio and moving midpoint for one
combined zoom/pan transform. Pointer cancel/lost capture clears gesture state;
teardown releases captures/listeners. The surface owns `touch-action: none` so
pinch manipulates the image rather than browser page zoom. Controls and the rest
of the document retain ordinary behavior. No swipe-to-change-file action exists.

Double-click or a recognized double-tap toggles Fit ↔ 2×-Fit detail centered on
the gesture position. Touch taps are time/distance bounded; moving, multi-touch
and cancel paths do not count as double taps. Synthesized mouse double-clicks
immediately following touch are suppressed to avoid applying the toggle twice.

Geometry updates are independent of React's render cycle. Renderer invalidation
coalesces viewport redraws through requestAnimationFrame. A new animation frame
consumes a pending redraw synchronously, avoiding two continuous render loops.
Zoom/pan reuse the current source pixels rather than decoding or producing a
full RGBA buffer on each move.

## Frame inspection and reconstruction

Animation controls expose Previous Frame, Next Frame and `Frame N / Total`, with
one-based UI numbering. Stepping pauses a playing animation and remains paused.
First/last boundaries clamp without looping. Controls reflect busy decode or
reconstruction and do not enqueue an arbitrary history of step requests.

A cached target is borrowed immediately. Normally up to two previous neighbors
share the existing cache with current/forward frames. An evicted target resets
the same decoder sequence and reconstructs sequentially from frame 0. Forward
misses reuse the current incremental cursor. `FrameBuffer.prepare()` reserves
capacity before each pull and releases old frames while advancing; it never
retains every reconstructed RGBA frame or allocates a separate history cache.

The normal cache remains 16 MiB / six frames, with the established automatic
current+next policy up to 32 MiB for large frames. Two-slot inspection can retain
one previous neighbor; resuming restores forward-prefetch capacity. Cache-hit
and reconstruction counters are diagnostics rather than a product timeline.

During reconstruction the renderer retains its previously copied pixels while
the UI says Reconstructing previous frame. Generation checks invalidate results
on Replay, close or a new file. Closing disposes the sequence to interrupt Worker
work before joining pending pulls. Late frames are released, not painted into a
replacement viewer. A failed reconstruction leaves the last presentation paused
with an error and allows Replay to reseed the decoder. Replay's existing reset
and play behavior, per-frame durations and finite/infinite loops remain intact.

## Static native decoding and ownership

`src/formats/static/static-image-source.ts` reads a source-independent VirtualFile,
creates a short-lived Blob with a detected MIME type and calls native
`createImageBitmap(blob, { imageOrientation: 'from-image' })`. Canvas remains the
rendering surface; native animated `<img>` playback is not involved. There are no
object URLs or encoded-byte caches in StaticImageSource. Browser native decode
is asynchronous; no additional codec dependency or Worker is installed.

`StaticImageSource` owns exactly one ImageBitmap and exposes its oriented native
width/height. Its idempotent `dispose()` closes the bitmap and removes the abort
listener. Switch, remove, Clear and Close invoke cleanup. Native decoding cannot
be actively aborted; a bitmap that resolves after cancellation is immediately
closed before any source is exposed. Media transitions join unfinished opening
and cleanup so stale resources cannot render into a subsequent file.

The renderer synchronously borrows and copies the current image/frame into one
private canvas. This canvas and the DPR display backing store are additional
bounded memory, outside the animation cache or static bitmap. Disposal shrinks
their backing stores. This ownership model does not promise immediate browser
RSS reduction after objects are closed or dereferenced.

JPEG orientation is delegated to the browser, not a new EXIF parser. Actual
installed Edge 155 checks used original quadrant JPEGs with orientations 2, 3,
6 and 8: both native and real Viewer pixels were correct; orientations 6/8
reported 20×40 instead of the stored 40×20. The user subsequently confirmed the
Android checklist, including the supplied orientation-6 example, passed in Quark
and Edge. Exact pixel measurements above remain desktop results.

## Resource and Canvas safety

`src/media/resource-policy.ts` shares the existing decoder source/full-frame
ceilings with static opening: **64 MiB encoded**, **4,194,304 decoded pixels**
(16 MiB at RGBA8) and **16,384 pixels per edge**. The encoded guard runs before
format detection/read. Oversized archive entries keep ARCHIVE_ENTRY_TOO_LARGE;
ordinary oversized input uses RESOURCE_LIMIT_EXCEEDED, without extracting it.

Before invoking native decoding, minimal JPEG marker/SOF scanning skips bounded
APP metadata; PNG reads IHDR; static WebP validates VP8X/VP8/VP8L dimensions and
container extents. No JPEG pixel codec or full EXIF implementation is added.
Native output dimensions are validated again and rejected results are closed.
A missing ImageBitmap capability produces a clear normalized error. Huge
50,000×50,000 JPEG metadata is rejected before calling the native decoder.

Renderer source dimensions have a separate safety check. Display Canvas backing
stores are capped at 8,192 per edge and 16,777,216 pixels, scaling DPR down when
necessary. Zoom does not multiply backing-store dimensions. This prevents an
enormous zoom transform or high DPR from requesting an equally enormous Canvas.

## Fullscreen, keyboard and responsive UI

The fullscreen controller checks `requestFullscreen`, `exitFullscreen` and
`fullscreenEnabled`; unsupported browsers retain ordinary viewing. It tracks
`fullscreenchange`, including browser exit. Promise rejection shows a recoverable
notice. A real user activation initiates entry/exit through the labeled button.

Normal-mode controls stay visible. In fullscreen, inactivity hides chrome after
2.5 seconds. Pointer/key interaction reveals it; control hover/focus holds it
visible. Loading, decode/reconstruction and errors keep critical information
visible. UI fades respect prefers-reduced-motion; user-requested image animation
continues normally. Fullscreen resizes the existing viewport and does not reopen
the current file.

| Key | Action when the image surface has focus |
| --- | --- |
| Space | Play/Pause animation |
| Left / Right | Previous / Next Frame |
| Shift+Left / Shift+Right | Previous / Next File |
| 0 | Fit |
| 1 | Actual / 100% |
| + or = / - | Zoom In / Out |
| Escape | Exit fullscreen |

Shortcuts ignore editable elements and focused controls, modifiers such as
Ctrl/Alt/Meta, and composition input. Buttons retain keyboard focus and native
activation behavior; disabled states reflect boundaries and pending work.
Icon zoom controls have accessible labels and visible focus indicators.

Controls wrap and retain 44px targets. Long filenames use ellipsis with the full
name available through the title; nested archive names do not displace Close.
The expanded list actions can collapse to preserve mobile space. Narrow and
landscape layouts preserve a Canvas surface, with special fullscreen landscape
layout and safe-area padding. Debug JSON is confined to a scrollable region
only when `?debug=1` is supplied.

## Fixtures and local validation

No new runtime dependency was added. `tools/static/generate-fixtures.mjs` creates
original CC0 quadrant JPEG/PNG/WebP and EXIF variants with the installed Edge
encoder, without downloading browsers or media. Generation also verifies native
orientation, quadrant colors and ImageBitmap.close. Small fixtures are committed;
malformed/oversized variants are created in test memory or ignored browser output.

`tools/viewer/generate-fixtures.mjs` reuses the original lossless red/green WebP
payloads to produce a **200-frame, 9,644-byte** WebP. It also creates a **six-entry,
2,349-byte** ZIP ordered JPEG → GIF → PNG → APNG → static WebP → animated WebP.
These and orientation-6 JPEG are hosted under `public/validation/viewer/` for
Android checks. No downloaded artwork or large performance archive is published.

Formal local environment: installed Windows Node **v24.22.1**, npm **11.19.1**.
`npm ci`, lint, typecheck, tests and build pass: **33 files / 405 tests**, including
70 static/policy tests, two archive-error regressions, 12 step tests, 42 renderer/
viewport/gesture tests and four keyboard tests. Existing tests remain enabled.

Real installed Edge 155 focused checks pass: static **10 groups**, frame-step
**18 groups**, viewport/gesture/fullscreen **27 groups**. Static Viewer checks
cover seven actual pixel/orientation fixtures, static↔GIF transitions, no static
animation controls/cache/Worker, Close/reopen, Remove/Clear, missing capability,
oversized metadata, corruption recovery and a deliberately delayed real native
bitmap completing after Close. Final static bitmap counts were **15 created /
15 closed / live 0 / peak 1**, with both GIF Workers terminated.

The focused long-animation step checks cover WebP/APNG/GIF, cached previous
frames, evicted-target reconstruction, bounded history, Replay and late response
invalidation after Next File/Close. Existing WebP viewer, APNG, GIF, input/drop,
ZIP and isolated WebP spike browser regressions pass after preserving the
archive-specific oversized-entry error. Reports and screenshots remain ignored
under `.tools/browser-results/`.

The combined installed Edge 155 suite passed **64 groups**: ten static, 18 step,
27 viewport/gesture/fullscreen and nine integration groups. Six-format ZIP entries
opened with the appropriate static/animation controls, current-only extraction
and Fit reset. Widths 320/390/768/1280 had no horizontal overflow, accessible Close
with long filenames and correct DPR2 backing. The combined run ended with **18
Workers created / 18 terminated / active 0**, peak two including ZIP, and **29
static bitmaps created / 29 closed / live 0 / peak 1**. All 5,835 observed RGBA
transfers detached; APNG bitmap instrumentation peaked at one and returned to zero.

Observed browser UI step latencies (including animation-frame polling):

| Format | Cache-hit previous | First reconstructed previous | Peak frames / bytes | Underruns |
| --- | ---: | ---: | --- | ---: |
| WebP, 200 frames | 0.6 ms | 14.8 ms | 6 / 96 | 0 |
| APNG, 100 frames | 0.7 ms | 33.4 ms | 6 / 98,304 | 0 |
| GIF, 100 frames | 0.6 ms | 15.5 ms | 6 / 144 | 0 |

The WebP was stepped backward from around frame 150 to frame 20; APNG/GIF were
returned from frame 50+ to their first exact pixels. Cached neighboring steps
avoided reset; misses decoded sequentially without growing retained history.
Next File and Close both invalidated a deliberately delayed real Worker response.
These are tiny generated desktop cases, not real-file Android benchmarks.

The native fixture-only decode check observed approximately **0.4–1.1 ms** for
these tiny images on desktop Edge; it is not a realistic phone-photo benchmark
or Android result. Main-thread viewport operations reuse current pixels. Cache
statistics and created/closed resource counts support ownership checks, not a
claim that browser RSS must immediately decrease.

## Publication and Android acceptance

Implementation commit: `038386a03d9f733459d6a8ffe667efe26cb18362`
(`feat: add advanced viewer interactions`). It was published to main using the
established Git Data API fallback with verified blob/tree/commit hashes and a
non-force ref update. No repository settings, workflow or dependency changes
were needed.

[Actions run 39967969974](https://github.com/ZZH-0427/AniView/actions/runs/39967969974)
completed successfully: Node 24, npm ci, lint, typecheck, 405 tests, build, official
Pages artifact upload and deployment all passed.

Real installed Edge checks at `https://ZZH-0427.github.io/AniView/?debug=1`
passed all **64 Viewer UX groups** on the deployed build, including the real
Fullscreen API, trusted mouse/touch input, native static image decode, exact EXIF
pixels, three-codec stepping, delayed-response cancellation and six-format ZIP
navigation. All four 320/390/768/1280 production screenshots were inspected with
readable controls and no horizontal overflow. A final narrow-screen layout check
also confirmed every button was at least 44×44 CSS pixels and no words were
split inside the frame-control labels.

Production resource counts: **18 Workers created / 18 terminated / final 0 /
peak 2**; **29 static ImageBitmaps created / 29 closed / final 0 / peak 1**.
All **5,748 RGBA transfers** detached correctly. The 1,435 observed APNG frame
emissions had at most one live bitmap, and zero after emission. Mixed ZIP
extraction counts progressed one entry at a time from one to six; maximum
retained output was 9,644 bytes, not all six entry contents.

Production previous-frame cache-hit observations were approximately **0.8 / 0.7 /
0.8 ms** for WebP/APNG/GIF; first reconstruction was **29.4 / 32.3 / 14.6 ms**.
These include UI commit/animation-frame polling. All three stayed at a maximum
six cached frames with zero underruns. They are individual desktop observations,
not isolated codec latency or Android measurements.

The six existing browser suites also passed against Pages: WebP Viewer (eight
groups), APNG (15), GIF (11), input/drag-drop/MediaSession (33), ZIP (40) and
isolated WebP spike (nine). Static expectations were updated to successful static
viewing; format conformance, loop, cancellation and resource checks remain enabled.

Initial network resources contained only main JS/CSS, with no ZIP runtime. The
30 observed runtime asset responses were all HTTP 200 beneath `/AniView/`, with
no observed page exceptions, console errors or resource 404s. An independent
HTTP/hash check matched every built JS/CSS/Worker/WASM asset, favicon and all
three public Android samples to their local build bytes. No root-hosting
assumption or application router was introduced. The final main bundle is about
273.2 kB / 84.1 kB gzip; ZIP remains a separate lazy session chunk and Worker.

Android status: **Passed, user-reported real-device acceptance (2026-10-23)**.
The user tested the deployed Viewer in Android Quark and Edge and confirmed:

> 在夸克和edge上进行了测试，未发现任何问题，你列出的注意点均通过了我的检测

| Android browser | Complete Viewer checklist | Reported issues |
| --- | --- | --- |
| Quark | Passed (user-reported) | None |
| Edge | Passed (user-reported) | None |

This satisfies the mainstream Chromium plus usual Android browser requirement.
The accepted checklist at `https://ZZH-0427.github.io/AniView/?debug=1` covered:

- `validation/viewer/long.webp`: Play/Pause, Next/Previous Frame around frame 50+,
  repeated backward inspection after history is evicted, then Replay.
- `validation/viewer/mixed-media.zip`: all three static and three animated formats;
  Previous/Next File, mode/controls changing with media, Close/reopen.
- `validation/viewer/orientation-6.jpg`: portrait-oriented JPEG, with blue/red on
  the top row and yellow/green on the bottom row.

For static and animated images, the checklist also covered pinch, one-finger
pan after zooming, double-tap, Fit, 100%, portrait↔landscape and fullscreen where
supported; frame changes preserve the view and file changes reset Fit. Static
images have no playback/step controls, and stepping during playback pauses it.

The user reported no issues with the checklist, which included checking for
stutter and crashes. Device/browser versions, per-browser Fullscreen API
availability and new playback/step/viewport JSON were not separately supplied.
This is user-reported functional acceptance, not an independently observed
Android run or a new Android memory/latency measurement. The measured resource
counts and timings above remain desktop evidence.

## Remaining scope

There is no arbitrary seek/timeline, swipe file navigation, slideshow, editing,
conversion, encoding, export or HEIC/TIFF/AVIF support commitment. No new password
UI or change to ZIP metadata-first/current-only extraction is included.

Viewer UX remains separated from format-specific decoding and playback. Local,
desktop, CI/Pages, production and Android acceptance have passed: **Milestone 5
is closed. Ready for Milestone 6 — Stability & Compatibility.** Milestone 6 work
requires a separate task and has not started.
