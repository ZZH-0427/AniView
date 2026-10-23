# Milestone 1: formal Animated WebP vertical slice

The production path is `browserFile → VirtualFile → WebPAnimationDecoder → shared
libwebp Worker → AnimationSequence → FrameBuffer/ByteBudgetFrameCache →
AnimationPlayer → CanvasRenderer → Viewer`. The existing 1A C bridge, WASM,
Worker protocol and asset resolution are reused without recompilation. The
`?spike=webp` diagnostic remains independent of production UI/controller logic.

## Decoder and ownership

`src/formats/webp/webp-animation-decoder.ts` implements AnimationDecoder. Each
fresh `frames()` stream resets the existing Worker context, then pulls next frames
sequentially. Replay and loops do not reread encoded input or recreate WASM.
WebP's nonzero loop count already specifies total plays (container specification:
the animation process repeats loopCount - 1 times); zero maps to generic infinite
playback. Player sees no WebP metadata, pointers or timestamp conventions.
Frame durations come from the existing adapter's cumulative-timestamp difference.

The adapter turns transferred RGBA into ImageData. Frame `dispose()` nulls its
image reference; the media contract explicitly permits null for disposed frames.
Only the consumer owns yielded frames. Sequence disposal closes the transport
and terminates its instance. During in-flight work, termination rejects pending
operations; no stale frame is rendered. UI teardown cancels an unfinished open,
and player/buffer generations invalidate asynchronous completions.

## Bounded cache and producer

Default configurable budget: **16 MiB and at most 6 frames**, current frame included.
This is conservative headroom, not a claim of an optimal budget for all devices.
For 672×1024 RGBA, one frame is 2,752,512 bytes and six are 16,515,072 bytes.
The byte limit is primary; frame count additionally prevents many tiny frames
from turning into an effectively decode-all cache. Two frames must fit or opening
fails with OUT_OF_MEMORY; callers may configure another explicit budget.

FrameBuffer reserves capacity using canvas dimensions before each pull, with one
decode in flight. Prefetch starts when opening/reseeding and replenishes as soon
as an old displayed frame is evicted, independently of the presentation clock.
There is no unbounded queue or decoded-frame array. A rejected insertion stays
caller-owned and is disposed. Replacement, eviction and clear release ownership.
Pause can finish bounded prefetch, but the producer stops at either limit.
Close clears cached frames immediately, cancels decoding via sequence disposal,
then joins the producer/iterator. Late results are disposed instead of inserted.

## Player clock

AnimationPlayer uses injected requestAnimationFrame/performance.now scheduling.
Per-frame deadlines accumulate durationMs rather than restarting a timer after
decoding each frame. Pause stores remaining presentation time; resume retains it.
Zero/sub-10ms durations use a documented 10ms scheduling floor, without changing
the source model. Late callbacks never arbitrarily drop frames: one sequential
frame is presented per callback. Lateness over 250ms or a buffer underrun rebases
the deadline rather than causing an uncontrolled catch-up burst. Underruns are
counted once per starvation episode. End waits for the final frame's duration;
looping resets/reseeds the same sequence. Replay also clears completed-play count.

The current frame is retained until its successor is presented. Replay must not
use an old index to evict a frame from the newly reseeded cache; a regression test
covers that case. Clock, source/Worker and renderer failures stop scheduling and
release the buffer. Controlled-source tests do not pretend to execute WASM.

## Renderer and UI

CanvasRenderer owns surface dimensions, DPR, fit/centering and zoom/pan transform
state, independently of timing. It copies the borrowed frame's current pixels to
one internal HTML canvas, so resize/redraw retains no borrowed frame object.
This pixel copy and the visible DPR canvas are additional bounded rendering
memory, outside the decode cache. Clear/dispose releases these canvas backing
stores. Zoom/pan calculations exist; user gestures/controls are deferred.

Home offers a minimal standard file input. Viewer shows filename, dimensions,
frame count, state, frame index and Play/Pause/Replay/Close. A `debug=1` query
reveals numeric cache/underrun diagnostics for validation, not normal product UI.
No frame scheduling or codec logic lives in React. Filenames are rendered as text.

## Input limitation and Android acceptance

The user reported Android 1A success with a 672×1024, 193-frame file near 31ms/frame
(decode+copy ~28.6ms, request→Canvas ~32.3ms). This motivated independent bounded
prefetch; these are historical spike observations, not a new production benchmark.
The existing `.webp,image/webp` accept filter may still show Camera / Files or a
restricted WebP subset. TODO: redesign Gallery / Files / Archive entry points in
the Input Experience milestone; no Android picker hacks are added here.

On 2026-10-23 the user reported testing the deployed formal Viewer in Android
Chrome, Edge, Xiaomi's built-in browser and Quark. The user reported all requested
functions usable, automatic repetition after each complete play, and no observed
stutter or crashes. This is user-reported real-device functional evidence, not an
independently instrumented Android benchmark. Browser versions were not supplied.
Automatic repetition is expected when the file's normalized loopCount is zero;
the existing unit tests separately cover finite total-play counts.

**Phone-file cache acceptance remains pending.** Confirmation of the exact
672×1024, 193-frame test file, observed cached-frame range, peakBytes, peakFrames,
maxBytes and underruns has been requested. The file exists only on the phone.
Use `/AniView/?debug=1`, play through at least two complete loops and for about a
minute, then pause and copy the diagnostic JSON. Do not substitute theoretical
six-frame byte calculations, desktop observations or the historical 1A smoke
test for these measurements.

## Validation and remaining scope

Run npm lint, typecheck, test and build. Real browser validation uses the existing
native-CDP harness in Viewer mode:

```sh
node tools/webp-wasm/browser-check.mjs 'http://127.0.0.1:5173/AniView/?debug=1'
node tools/webp-wasm/browser-check.mjs 'https://ZZH-0427.github.io/AniView/?debug=1'
node tools/webp-wasm/browser-check.mjs 'https://ZZH-0427.github.io/AniView/?spike=webp'
```

Use an optional second argument for another local file. The official 300×225,
100-frame sample completed a full desktop loop with six cached frames and peak
1,620,000 bytes; no underrun in that run. Reports live in ignored `.tools/`.
The script explicitly excludes Replay's index reset from full-loop detection.

Commit `3134823959f6e8aacced074fbe03bdea6c6d1cec` passed local lint, typecheck,
23 Vitest tests and the production build using installed Node 24.22.1/npm 11.19.1.
Local development and preview browser checks passed. GitHub Actions run
[39897902334](https://github.com/ZZH-0427/AniView/actions/runs/39897902334)
completed successfully, including build, Pages artifact upload and deployment.
The deployed formal Viewer passed real Edge checks for continuous playback,
Canvas pixel changes, pause/resume, replay, a full loop, bounded cache,
close/reopen, 390/1280 viewport layouts and DPR sizing. Worker/WASM responses
were HTTP 200 under `/AniView/`, with no observed page exceptions, console errors
or resource 404s. The production spike also passed decoding, reset, corrupt input
and recovery checks. Desktop results do not replace Android cache measurements.

No APNG/GIF, ZIP, seek, previous-frame navigation, conversion, PWA or final mobile
input UX is implemented. WASM linear memory may grow without shrinking; freeing
C allocations or dropping cache references does not promise immediate RSS change.
Milestone 1 remains BLOCKED on phone-file confirmation and cache observations.
The Android functional report and production deployment checks are recorded
above; do not begin Milestone 2 until the remaining acceptance evidence arrives.
