# Milestone 2B: GIF integration

Status: **PENDING ANDROID VALIDATION**. Desktop conformance and cross-format
checks pass. Android acceptance must be supplied by the user before PASSED or
starting Milestone 3. PLAN.md, AGENTS.md and earlier milestone documents remain
unchanged.

## Architecture and dependency

VirtualFile -> binary detection -> GIFAnimationDecoder -> dedicated module
Worker -> omggif LZW/palettes/transparency -> GIF compositor -> full RGBA
DecodedFrame -> existing FrameBuffer/FrameCache -> AnimationPlayer ->
CanvasRenderer. No GIF-specific cache, player, renderer or scheduler. The upper
layers have no GIF playback branches. No production native animated image,
ImageDecoder, WASM, network decoding or media upload is used for GIF.

Exact dependency: **omggif 1.0.10**, MIT, 38,509 unpacked bytes, no runtime
dependencies. Upstream is old and minimally maintained; its limited surface is
isolated behind typed adapters and structural validation. It works in a Vite
module Worker with no DOM requirement or Pages server dependency. The GIF Worker
is about 12.25 kB; the main bundle grows about 2.64 kB. The MIT notice is in
`third_party/licenses/omggif/LICENSE` and deployed `third-party-notices.txt`.

## Approved interlace adaptation

The valid 3x4 interlace fixture failed omggif 1.0.10: it advanced only one pass
per wrap, failing to skip empty passes on short images. Chromium decoded it
correctly. Work paused under task section 66; the user explicitly approved
adapter-level row reordering before integration continued.

`gif-frame.ts` temporarily disables the vendor interlace flag, retains omggif
for LZW/palettes/transparency, then maps rows with starts 0/4/2/1 and steps
8/8/4/2. Transparent pixels preserve underlying pixels. Flags are restored on
failure too. A transient scratch buffer is bounded to one logical canvas, only
for interlaced frames. No new codec/dependency. Heights 1-17, offsets,
transparency and local palettes have exact unit and real Chromium pixel checks.

## Composition and disposal decision

Each output is a complete logical canvas. Transparency skips the pixel. Before
the next image: disposal 0/1 retains pixels; 2 clears only the preceding
rectangle; 3 restores its saved pre-draw rectangle. PREVIOUS saves only that
region (at most one canvas), releases it on the next operation, and handles
first-frame PREVIOUS from transparent initial pixels. Reset releases history.

GIF89a describes disposal 2 as restoration to the logical-screen background.
AniView deliberately follows **observed Chromium GIF compatibility** instead:
initial pixels and the disposal-2 rectangle are transparent, even with an opaque
global background. Opaque-background and transparent-index fixtures compare
exact RGBA with Chromium. This decision is independently tested rather than
inherited from APNG. Native decoding appears only in test tooling as an oracle.

## Duration and loop policy

GIF delays are centiseconds: 0/1cs normalize to 100ms; 2cs and above use
`delay * 10ms`. This policy stays in the adapter; the generic player receives
positive millisecond durations. ImageDecoder exposes raw delays, so cannot
establish presentation normalization. Test tooling also samples native animated
`<img>` screenshots: 0/1cs remain roughly 100ms (desktop samples ~104/110ms).
Screenshot sampling is too coarse for an exact 20ms measurement; the explicit
2cs->20ms contract is unit/Worker tested.

No loop extension means one total play; zero repeats means infinite; N means
N+1 total plays. NETSCAPE2.0 and ANIMEXTS1.0 are accepted. Browser checks assert
exact decoded counts at finite/absent-loop end and exercise Replay. Single-frame
GIF87a without GCE displays as one ordinary sequence frame.

## Memory, errors and ownership

All frames are **not decoded to RGBA upfront**. Retained state is compressed
source, bounded frame descriptors, vendor reader, one compositor canvas and
optional PREVIOUS region. Vendor per-frame indices, interlace scratch and output
copy are transient. Requested RGBA ArrayBuffers transfer to the main thread.
Evicted ImageData references are cleared; close terminates the Worker and drops
source/history. GIF uses no ImageBitmaps. Abort/close races cannot yield stale
frames.

Shared cache policy is unchanged: normally 16 MiB / six frames; large frames
receive exactly two-frame capacity up to 32 MiB. Cache budget does not represent
total browser memory: compressed data, compositor, vendor workspace and
transient transfer buffers also exist and are bounded independently.

GIF limits: 64 MiB input, 16 MiB logical RGBA canvas, 10,000 frames, 1 GiB total
full-canvas output work, 1,000,000 sub-blocks per chain. Validation precedes vendor
parsing/allocation: headers, palettes, rectangles, blocks, trailer, code size
and control metadata. Sub-block traversal retains only its first view.
Unsupported user-input graphics/plain-text extensions fail clearly. Vendor
short/overlong LZW warnings become CORRUPTED_FILE. Worker operations time out
after 15s and terminate, including pathological vendor decoding. This is bounded
browser processing, not a formal proof of every malformed LZW stream. Errors
do not poison subsequent opens.

## Desktop verification

Windows, installed Node 24.22.1 / npm 11.19.1, Edge 155 headless. Fixtures test
disposal, interlace, palettes, loops, GCE defaults, timing, malformed structures/
LZW, resource ceilings, ownership and transport races. Real Worker checks
compare every small frame against Chromium RGBA; native decoding stays in tests.
Clean `npm ci`, lint, typecheck, 128 tests across 17 files and production build
all pass. Of those tests, 40 are GIF adapter/compositor cases plus GIF87a binary
detection coverage. Native pixel comparison covers 26 tiny fixtures.

Real sample: Marvel's unchanged rotating Earth, 1,001,718 bytes, 400x400,
44 frames, 65,536 total plays. Provenance/license/hash: `tests/fixtures/README.md`.
Two complete loops observed; peak 6 frames / 3,840,000 bytes within 16,777,216;
underruns 0. Desktop decoder ready ~1ms, first decode/composition ~2.8ms,
mean ~1.15ms, max ~2.9ms. Selection to paused Viewer ~122ms includes CDP polling,
not isolated codec latency. These are not Android performance claims.
A generated 100-frame stream separately exercises eviction: peak 6 frames /
144 bytes, underruns 0.

WebP, APNG, GIF formal Viewer and WebP spike pass desktop checks: open/play/
pause/resume/replay/close/reopen, changing Canvas, loops, recovery, transfers,
390/1280 viewports, DPR and no page/network errors. Existing Worker assets and
WebP WASM retain `/AniView/` paths.

Reproduce after `npm ci`, `npm run build`, `npm run preview`:

```sh
node tools/gif-generate.mjs
node tools/webp-wasm/browser-check.mjs "http://127.0.0.1:4173/AniView/?debug=1" .tools/fixtures/rotating-earth.gif gif
node tools/webp-wasm/browser-check.mjs "http://127.0.0.1:4173/AniView/?debug=1" .tools/fixtures/bouncing-beach-ball.png apng
node tools/webp-wasm/browser-check.mjs "http://127.0.0.1:4173/AniView/?debug=1" .tools/fixtures/animated.webp viewer
node tools/webp-wasm/browser-check.mjs "http://127.0.0.1:4173/AniView/?spike=webp" .tools/fixtures/animated.webp spike
```

Installed Edge/CDP; no browser/package download. Detailed reports/screenshots
remain ignored in `.tools/browser-results`. Repeat against Pages after Actions;
workflow existence alone is not deployment evidence.

## Android acceptance still required

On at least one mainstream Chromium browser and the user's usual Android
browser, open `https://ZZH-0427.github.io/AniView/?debug=1`. Select a real GIF,
play complete loops for about a minute, inspect transparency/partial disposal
for trails, then Pause/Play, Replay, Close/reopen. Record browser, dimensions/
frame count, behavior, stutter/crash, cachedFrames range and paused metrics JSON.
Include a transparent or partial-frame GIF where available. Desktop success
does not close this item.

Limitations: delay normalization, resource ceilings and pending Android results.
No seek/timeline or new input UX is added. Do not begin Milestone 3 yet.

References: [GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt),
[omggif source](https://github.com/deanm/omggif/blob/master/omggif.js).
