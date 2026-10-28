# libwebp WASM rebuild tools

These are rare codec-maintenance tools, **not** npm/Vite build dependencies.
Normal development uses the committed `.mjs` and `.wasm` files with Node.js 24.

Validated host: Windows x64, Python 3.14, Emscripten 6.0.13, CMake 4.4.4,
Ninja 1.13.2. Python 3.9+ with pip and network access is required for setup.
The SDK download is approximately 800 MB plus extracted files. All tools and
build intermediates stay in `.tools/`, which Git, ESLint and Vite's dev watcher ignore.

From the repository root:

```powershell
python tools/webp-wasm/setup.py
python tools/webp-wasm/build.py
```

`setup.py` verifies the exact emsdk release-source archive, then installs and
activates **6.0.13 locally**, without `--permanent`, `--global` or system installs.
The SDK includes its own Node/Python for compiler tooling. AniView's npm commands
continue to use the formal `D:\tool\nodejs` installation; do not source the SDK
environment globally. Setup also installs pinned CMake/Ninja into a local target.

`build.py` downloads a SHA256-pinned libwebp commit archive if needed, checks the
compiler version, invokes emcmake/CMake/Ninja, and copies only the final runtime
and codec/SDK license files into versioned directories. It never changes npm
dependencies or overwrites the aggregate production notices. After updating the
codec or toolchain, review `THIRD_PARTY_NOTICES.md` and
`public/third-party-notices.txt`, including C runtime subcomponents.

Outputs:

- `src/formats/webp/wasm/aniview-webp.mjs`
- `src/formats/webp/wasm/aniview-webp.wasm`
- `third_party/licenses/libwebp/{COPYING,PATENTS,AUTHORS}`
- `third_party/licenses/emscripten/LICENSE`

The separately maintained `public/third-party-notices.txt` is redistributed by
Vite/Pages and also covers React, ZIP, other codecs and generated build helpers.

The adjacent `.d.mts` is a hand-maintained declaration for the deliberately small
C bridge API. Update it when changing exported bridge functions. Generated glue
is excluded from lint; the bridge, declarations and all application TypeScript
remain reviewed/checked. No upstream source checkout or SDK is committed.

## M8B1 animation encoding spike

The same libwebp **1.6.0** runtime now links `libwebpmux` and keeps all existing
decoder exports. No second WebP library or runtime binary is introduced. Separate
decoder/encoder Workers instantiate that same artifact with separate heaps. The
bridge adds create/input/add/finalize/output/destroy functions for a dedicated
encoding Worker, plus an active-encoder count and `mallinfo().uordblks` live-byte
proxy. `WebPAnimationEncoder` is worker-oriented and is not a normal navigation
or conversion UI entry.

Fixed spike options are lossless, `exact=1`, method 0, mixed encoding disabled,
transparent background and canonical total plays passed to `loop_count`.
Each add uses the rounded cumulative start timestamp, and finalize supplies the
rounded total end timestamp. A reusable `WebPPicture` input is filled from the
current RGBA frame and converted in-place to the ARGB byte layout; there is no
additional C input-frame allocation. The sole encoded-output WASM→JS copy is
an exact-range `HEAPU8.slice`; the Worker subsequently transfers that buffer.

Rebuild with the existing command above. The first Windows sandbox link attempt
could not execute the existing `llvm-objcopy.exe`; the same build succeeded
outside the sandbox after the current user's explicit 8B1 authorization was
verified. No executable was renamed, substituted or downloaded to bypass policy.

The unchanged pinned toolchain produced:

| Artifact | Decoder-only bytes | Combined decoder/encoder bytes |
| --- | ---: | ---: |
| `aniview-webp.mjs` | 29,865 | 33,054 |
| `aniview-webp.wasm` | 138,564 | 394,132 |

The C/CMake changes and generated binary are reviewed together. Linking the
encoder increases codec payload size; Worker/WASM loading must remain lazy.
libwebp and Emscripten versions and license texts are unchanged.

Run the direct bridge regression with the formal installed Node.js:

```powershell
node tools/webp-wasm/encoder-check.mjs
```

It instantiates the real WASM with the generated runtime's heap-growth policy,
then uses the existing C decoder for decode-back. It covers visible/hidden RGB,
alpha 0/1/64/127/128/200/254/255, 20/27/100/250/500/1000 ms, total plays 0/1/2/3,
10/50/100/200 frames and two 1024²/1920×1080/2048² canvases. Reports remain local
in `.tools/conversion/webp-bridge-report.json`. This is not a browser or Android
acceptance substitute. Its elapsed timing includes decode-back and is not an
encoder-only benchmark. Heap capacity is not exact live allocation; the sampled
allocator value is not a measured transient allocation peak or browser RSS.

**Observed upstream limitations are intentional test cases:** adjacent identical
frames can be coalesced (six inputs become three with durations 47/350/1500 ms),
Even keyframe options do not disable the earlier identical-frame skip path.
This must not be reported as exact arbitrary frame-count preservation. Upstream
also makes a single visual frame static, dropping its duration and loop; the
AniView bridge now prevents that semantic loss with a minimal RIFF wrapper.
Because `WebPMuxAssemble` itself strips a single full-canvas ANMF, the wrapper
reuses its already encoded VP8L chunk and writes VP8X/ANIM/one ANMF with SOURCE
and NONE disposal. It neither re-encodes pixels nor modifies the mature codec.
Single-frame total plays 0/1/2/3 and durations 0/20/27/100/250/500/1000 ms all
decode back exactly. Wrapping adds one compressed-container copy within WASM
only for an otherwise-static output; the WASM→JS path still copies only once.
Six identical inputs also correctly retain their 1897 ms total and play count 2
when coalesced to one visual frame; the original frame count is still not kept.
See the pinned `src/mux/anim_encode.c` and the
[WebP animation API](https://chromium.googlesource.com/webm/libwebp/+/refs/heads/main/src/webp/mux.h)
and [container specification](https://developers.google.com/speed/webp/docs/riff_container).

## Real browser integration check

Use the official Google sample from
<https://www.gstatic.com/webp/animated/1.webp>. Save it as
`.tools/fixtures/animated.webp`; do not add it to Git. Expected SHA256:
`8afc28fef9bba14b5eecbbc6bb8b4379dc96b6ebc3e0845607ced41b7dda337c`.
This file is referenced for engineering validation only; it is not redistributed.

Start Vite in another terminal, then:

```powershell
node tools/webp-wasm/browser-check.mjs "http://127.0.0.1:5173/AniView/?spike=webp"
```

Repeat with `npm run build` + `npm run preview` at port 4173, then against
`https://ZZH-0427.github.io/AniView/?spike=webp` after deployment. An optional second
argument selects a different local animated WebP. `EDGE_PATH` may override the
installed Edge executable. No Playwright or browser downloads are required.

The script uses native Node WebSocket/CDP, targets real Dedicated Workers and
observes their WASM network traffic. It checks input and output buffer detachment,
five distinct frame canvases, timestamp durations, reset reproducing frame 1,
close, corrupt input, recovery, and phone/desktop layout. Tiny numeric metrics and
screenshots go only into ignored `.tools/browser-results/`. It does not upload
the sample or filenames. Reports are local integration evidence, not unit tests.

See [the milestone notes](../../docs/milestones/milestone-1a-webp-wasm.md) for
ownership, limits and measured baseline.
