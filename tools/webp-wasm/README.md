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
and license notices into versioned directories. It never changes npm dependencies.

Outputs:

- `src/formats/webp/wasm/aniview-webp.mjs`
- `src/formats/webp/wasm/aniview-webp.wasm`
- `third_party/licenses/libwebp/{COPYING,PATENTS,AUTHORS}`
- `third_party/licenses/emscripten/LICENSE`
- `public/third-party-notices.txt` (redistributed by Vite/Pages)

The adjacent `.d.mts` is a hand-maintained declaration for the deliberately small
C bridge API. Update it when changing exported bridge functions. Generated glue
is excluded from lint; the bridge, declarations and all application TypeScript
remain reviewed/checked. No upstream source checkout or SDK is committed.

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
