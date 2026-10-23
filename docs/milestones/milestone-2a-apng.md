# Milestone 2A: APNG decoder integration

**Status: PENDING ANDROID VALIDATION.** Implementation and local desktop checks
are complete. Android acceptance has not been reported for this milestone. Do not infer Android APNG support
from the previous WebP milestone or from a desktop mobile viewport.

## Architecture and dependency boundary

The production path is `browserFile → VirtualFile → FormatDetector →
APNGAnimationDecoder → APNGDecoder transport → Dedicated Worker → parser adapter
→ createImageBitmap(single-frame PNG Blob) → APNGCompositor → transferred RGBA
→ AnimationSequence → existing FrameBuffer/ByteBudgetFrameCache → existing
AnimationPlayer → existing CanvasRenderer → Viewer`.

The format implementation lives in `src/formats/apng/`. The detector and Viewer
choose a decoder; the player, cache, renderer and generic media interfaces do not
import vendor APNG types or implement APNG-specific playback branches.

`apng-js` is pinned to **1.1.5**, under the MIT license. Only its container parser
and compressed `frame.imageData` PNG Blobs are used. `createImages`, `getPlayer`,
`Frame.createImage`, the vendor Player and animated HTMLImageElement playback are
not used. AniView owns decode scheduling, composition, caching and presentation.
The adapter handles the published UMD package's differing Node/Vite default
interop without replacing the approved dependency or its implementation.
The npm package has no runtime dependencies and an unpacked size of 44,899 bytes.
Both its own MIT license and the bundled EventEmitter MIT notice are retained
under `third_party/licenses/apng-js/` and in the public third-party notices.

## Detection, parsing and input limits

Detection uses binary signatures. A PNG signature followed by an `acTL` chunk is
APNG; an ordinary PNG stays PNG regardless of `.png` or `.apng` extension. Static
PNG produces a specific recognized-but-not-animated message in this milestone.

Before invoking the vendor parser, AniView validates chunk sizes and CRCs, IHDR
and APNG metadata, sequence numbers, required data, frame count and rectangle
bounds, blend/dispose enumerations and chunk ordering. Unknown critical chunks,
invalid metadata and corrupt data produce stable application error categories.
Resource checks precede canvas allocation: encoded input is limited to 64 MiB,
one full RGBA canvas to 8 MiB, animation frames to 10,000, chunks to 100,000 and
estimated cumulative inflation work to 1 GiB (including filter bytes/Adam7
passes). The 8 MiB frame bound matches the generic cache requirement that two
frames fit in its default 16 MiB budget. These are explicit conservative policy
limits, not a claim that every valid PNG is supported.
Shared ancillary metadata is limited to 2 MiB, and aggregate reconstructed PNG
size to 128 MiB, counting repeated metadata and per-frame IDAT overhead before
the vendor parser builds Blobs. The latter limits logical decode work; Blob
storage may be shared and this estimate does not claim actual heap allocation.

All frame descriptors and compressed PNG Blobs may be parsed at open. Full RGBA
frames are **not decoded upfront**. The temporary source copy protects against
the vendor parser rewriting IHDR while constructing standalone frame PNGs.
Vendor APNG/Frame objects do not cross the parser adapter boundary.

## Worker decode and composition

The Worker checks `createImageBitmap` and `OffscreenCanvas`. Missing capability
or an unavailable 2D context produces `APNG_RUNTIME_UNAVAILABLE`; no fallback
silently moves this work onto the UI thread.

Each `next()` decodes exactly one compressed frame Blob. The temporary bitmap
passes to the compositor, whose `finally` closes it even on errors. The compositor
maintains one canvas. It applies the preceding frame's disposal before drawing
the next frame, and emits an independent full-canvas RGBA buffer before that
frame's eventual disposal.

| Operation | Implementation |
| --- | --- |
| SOURCE | Clear only the target rectangle, then draw; transparent source pixels replace old content. |
| OVER | Draw with Canvas `source-over`. |
| NONE | Keep the canvas for the next frame. |
| BACKGROUND | Clear the preceding frame rectangle to transparent black. |
| PREVIOUS | Save and restore one rectangle from immediately before that frame. |
| First-frame PREVIOUS | Treat as BACKGROUND. |
| Offsets/partial frames | Draw into the validated frame rectangle; emit the full canvas. |

The default PNG IDAT image is included only if its fcTL marks it as the first
animation frame. A hidden default image is excluded from animation metadata and
output. The animation starts with a transparent canvas in either case.

Raw `delay_num / (delay_den || 100) * 1000` is preserved, including zero. The
adapter restores these values rather than accepting apng-js's player-specific
short-delay substitutions. Existing generic scheduling imposes its documented
10 ms floor while keeping the source frame duration unchanged. `num_plays = 0`
maps to infinite `loopCount`; nonzero values are total plays.

## Ownership, reset and close

Long-lived Worker state consists of compressed frame Blobs/descriptors, one
composition canvas and at most one PREVIOUS rectangle backup. No decoded history
or ImageBitmap array is retained. One decoded bitmap and one outgoing RGBA buffer
are temporary. `postMessage(response, [rgba])` transfers the output buffer to the
main thread; the compositor retains no emitted buffer. The generic frame disposer
drops ImageData references when the cache evicts them.

The existing default cache remains **16 MiB / six frames**, including the current
frame. Existing prefetch pulls sequentially only while capacity remains. No APNG
cache, prefetch loop, player or renderer is added. Canvas/bitmap/backup memory is
additional to cache bytes; these counters do not measure browser process RSS.

Reset clears canvas, index and disposal backup. Loop/replay starts a new stream on
the existing sequence. Request IDs and one pending request per transport instance
prevent ambiguous responses. Closing invalidates consumers and terminates the
Worker if work is pending, rejecting stale promises and releasing compressed
metadata/canvas/backup. Opening another file uses another session.

## Fixtures and validation

See [`tests/fixtures/README.md`](../../tests/fixtures/README.md) for generated
fixture responsibilities and external source/license details. Small committed
synthetic APNGs exercise full/partial frames, transparent SOURCE, alpha OVER,
all disposal operations, first PREVIOUS, hidden default, delays, finite/infinite
loops and a 100-frame bounded stream. Full-canvas expected RGBA arrays are
independent test expectations, not decoded production caches.

The separate real-world sample is Holger Will's public-domain bouncing beach
ball: 63,435 bytes, 100×100, 20 frames, 75 ms/frame, infinite loop. Downloading
the current Commons original can yield a differently optimized byte stream with
the same animation; the observed local sample SHA-256 is
`ce0905f339f44370c0fecc226ef4b422d86f06a3ec4f194e5cfb9d0b50aafb2e`.

`tools/apng/browser-scenario.mjs` drives the actual Viewer through the existing
native Edge CDP harness. It observes changing Canvas pixels, pause/resume,
replay, full loops, finite end, close/reopen/recovery, static PNG/corrupt errors,
responsive layout and DPR. Tiny fixture frames are checked byte-for-byte from
the real Worker, including browser PNG decoding and OffscreenCanvas composition.
Only tiny fixture pixels and numeric metrics are retained by test instrumentation.
The harness records parse-ready time, selection-to-first-presentation time
(including polling), per-frame decode/composition time, bounded cache peaks,
closed bitmap counts and bounded PREVIOUS backups.

Run with the formally installed Node 24 environment:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
node tools/webp-wasm/browser-check.mjs 'http://127.0.0.1:5173/AniView/?debug=1' .tools/fixtures/bouncing-beach-ball.png apng
node tools/webp-wasm/browser-check.mjs 'http://127.0.0.1:5173/AniView/?debug=1' .tools/fixtures/animated.webp
node tools/webp-wasm/browser-check.mjs 'http://127.0.0.1:5173/AniView/?spike=webp' .tools/fixtures/animated.webp
```

Repeat browser scenarios against the production build and Pages URL. APNG adds
one Vite-resolved module Worker and no WASM runtime asset. WebP's Worker/WASM
and `?spike=webp` remain part of regression validation. Recorded results below
are actual executions, separate from these reproduction commands.

### Recorded local desktop results (2026-10-23)

Using installed Node 24.22.1/npm 11.19.1, `npm ci`, lint, typecheck, all **74 tests
in 14 files**, and the Vite production build passed. The initial Windows `npm ci`
attempt encountered a native-module lock held by the preview process; stopping
the validation servers allowed a clean install and the complete checks to pass.
No Player, FrameBuffer, FrameCache or CanvasRenderer runtime code changed.
A generic zero-duration scheduling regression was added to the existing player
tests. Browser DPR checks wait for asynchronous ResizeObserver sizing.

Real Edge 155 production-preview checks passed for WebP Viewer, WebP spike and
APNG. Six tiny fixture cases produced **19 exact full-canvas RGBA frame matches**
through the real Worker, PNG decoder and OffscreenCanvas, including raw timing
assertions. Both default-image cases, finite end/replay, infinite loops,
static-PNG distinction, corrupt input recovery, 390/1280 layouts and DPR passed.

The real beach-ball sample (63,435 bytes, 100×100, 20 frames) completed five loops
over about eight seconds, with six cached frames, 240,000 peak cached bytes and
zero underruns. Selection to decoder-ready receipt was ~25.8ms; selection to the
paused first presentation was ~119.3ms (including 100ms CDP polling granularity).
Worker parse/canvas initialization was ~5.2ms. Per-frame decode/composition mean
was ~0.58ms, observed range ~0.2–1.0ms. These are single-run desktop observations,
not Android benchmarks or latency guarantees.

The generated 100-frame stream completed its full ~10s loop with six cached
frames, 98,304 peak cached bytes, a 16,777,216-byte budget and zero underruns.
Independent Worker instrumentation observed 271 bitmaps across the APNG suite:
maximum one simultaneously live bitmap, zero after each frame emission.
The PREVIOUS fixture's observed backup was four bytes (one 1×1 region).
Reports/screenshots remain ignored under `.tools/browser-results/`.

### Recorded CI and production results (2026-10-23)

Implementation commit `95570655ae59712d7d7b7a643cfc2d1858cdac9d` was published to
`origin/main` without history rewriting. GitHub Actions run
[39913895009](https://github.com/ZZH-0427/AniView/actions/runs/39913895009)
completed successfully: npm ci, lint, typecheck, tests, build, Pages artifact and
deployment all passed. No workflow or repository-settings change was needed.

Real Edge checks against `https://ZZH-0427.github.io/AniView/?debug=1` passed the
entire APNG scenario, including all 19 exact fixture-frame pixel matches and the
complete 100-frame loop. The WebP Viewer and `?spike=webp` also passed their full
regression scenarios. APNG Worker and WebP Worker/WASM returned HTTP 200 beneath
`/AniView/`, with no observed resource 404s, page exceptions or console errors.

For the same beach-ball sample, production desktop selection-to-ready was
~516.5ms, selection-to-first-presentation ~546.8ms (including CDP polling), Worker
parse/canvas setup ~4.8ms, and mean decode/composition ~0.59ms (range ~0.2–1.4ms).
Network/Worker startup makes these different from the local preview results.
Cache peaks stayed at six frames / 240,000 bytes for the real sample and six
frames / 98,304 bytes for the long stream, with zero underruns. Independent bitmap
instrumentation again observed 271 frame emissions, one maximum live bitmap and
zero remaining after each emission; the PREVIOUS test backup peaked at four bytes.
These results complete desktop, CI and Pages validation. Android APNG remains
pending the new user real-device checklist below.

## Android acceptance and limitations

After desktop validation, CI and Pages succeed, status is **Milestone 2A:
PENDING ANDROID VALIDATION** until new user-reported APNG testing is available.
Open `https://ZZH-0427.github.io/AniView/?debug=1` on Android, select an APNG
(the public-domain beach ball can be saved from its Commons original), confirm
the APNG label and play through loops. Check transparent backgrounds, absence of
trails/ghosting and correct partial-frame positions. Test Pause/Resume, Replay,
Close/Reopen; report browser, sample, stutter/crash observations and cache JSON.

This route requires Worker image decode and OffscreenCanvas support. Final
gallery/files picker behavior remains Milestone 3; the temporary accept filter
only broadens to the two supported formats. GIF, seek/timeline, ZIP, conversion
and export are outside this milestone. No Android result is inferred from WebP
acceptance.

Primary references: [PNG Third Edition](https://www.w3.org/TR/png-3/),
[apng-js source](https://github.com/davidmz/apng-js),
[beach-ball author/provenance](https://commons.wikimedia.org/wiki/File:Animated_PNG_example_bouncing_beach_ball.png),
[WPT APNG tests](https://github.com/web-platform-tests/wpt/tree/master/apng).
