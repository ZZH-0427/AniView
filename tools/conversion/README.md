# Unified animation conversion spike tools

Milestone 8B1 is an architecture/encoder experiment on the V0.2 feature branch.
It provides no conversion product entry, format selector or download workflow.
Sources are original procedural fixtures; conversion, validation and reports stay
local. These tools do not deploy Pages, modify main or create a release.

## Build with the installed environment

Use the established **Node.js 24 / npm** installation. On the validated Windows
host this is `D:\tool\nodejs`; do not switch npm commands to an Emscripten SDK's
Node or download a temporary Node/browser. Existing native-module users such as
a Vite dev server should be stopped before `npm ci` on Windows.

From the repository root:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
node node_modules/vite/bin/vite.js build --config tools/conversion/vite.config.mjs
```

The builds are separate. Ordinary `npm run build` produces `dist/` with the
existing Viewer and static-image GIF Creator. The explicit conversion config
produces ignored `.tools/conversion-site/`, uses the `/AniView/` base and includes
third-party notices. It does not add the experiment to normal navigation or
eagerly import conversion encoders into ordinary Viewer startup.

The WebP bridge uses the committed libwebp 1.6.0 runtime. Rebuilding its C/WASM
requires the separately documented [codec toolchain](../webp-wasm/README.md),
not a normal npm build prerequisite. No new APNG runtime dependency is required.

## Desktop checks

After the separate engineering build, run the complete installed-Edge suite:

```powershell
node tools/conversion/run-browser.mjs
node tools/conversion/check-canonical.mjs
node tools/conversion/benchmark.mjs
node tools/webp-wasm/encoder-check.mjs
```

The browser runner starts its own loopback static server on **4211**, launches
the already installed Edge through CDP, and closes both afterwards. `BROWSER_PATH`
can select another installed browser; no browser is downloaded. A shorter matrix
run is available as `node tools/conversion/run-browser.mjs --smoke` and does not
replace the full run.

The full suite covers the three-by-three source/target matrix, procedural alpha
and visual scenes, loop/timing cases, many/large frames, cancellation/rerun and
stale-job cleanup. Worker probes check transfer detachment. Test-only Node zlib
and an independent chunk/CRC parser validate APNG outputs; no oracle library is
added to a product bundle. The direct WASM check exercises the real encoder and
existing decoder, including 10/50/100/200-frame memory observations.
The canonical check adds explicit decoder/stream equivalence coverage beyond
the main source/target conversion matrix.

Reports, outputs, screenshots and fresh browser profiles remain ignored under
`.tools/conversion/`. Principal reports are `report.json`, optional
`smoke-report.json`, and `webp-bridge-report.json`. Generated media is test data,
not user-provided media or a shipped product fixture.

## Android production preview

**Android product/lifecycle acceptance must use a production preview without
Vite HMR.** After the engineering build, keep the computer awake and run:

```powershell
node tools/conversion/preview.mjs --host 0.0.0.0 --port 4210
```

Connect phone and computer to the same Wi-Fi, substitute the current computer
IPv4 address, and open:

```text
http://COMPUTER_IP:4210/AniView/experiments/conversion/?debug=1
```

The server serves only the built engineering artifact through GET/HEAD, accepts
no uploads and provides no Vite client or HMR. It is not a Pages deployment.
Stop it with Ctrl+C after acceptance. A restricted agent environment may require
launching the LAN server outside that sandbox for phone access.

In **Android Edge and Quark**, run **small** first, then **medium**:

| Harness button | Workload | Directions |
| --- | --- | --- |
| Run small | 6 × 64×48 | GIF → WebP, GIF → APNG, APNG → WebP, WebP → APNG |
| Run medium | 40 × 320×240 | The same four directions |

The harness generates each source locally; no gallery/file selection is needed.
Check progress, heartbeat, page response and output decode-back results. Also
test Cancel → rerun. Stop escalating after a tab reload, crash or memory-pressure
failure. Copy the completed JSON and report browser, workload, responsiveness,
any reload and the Worker/resource cleanup result.

The JSON reports the actual Worker `CompressionStream('deflate')` capability.
An unsupported target returns `TARGET_ENCODER_UNSUPPORTED`, with no silent
compression fallback. **Real Android Edge and Quark acceptance is pending**;
desktop results and the earlier 8A2 Android results do not replace it. QQ is
optional additional evidence, not an 8B1 gate.

## Reading the metrics

- `peakRgbaFrames` measures the one transferable canonical RGBA frame under
  broker backpressure. Decoder composition/native buffers, WebP private working
  memory and compressed output are separate; this is not total browser memory.
- WASM heap length is **capacity**, not exact live allocation. Allocator-live
  values sampled at frame/finalization checkpoints are not transient allocation
  peaks or OS RSS/GPU measurements.
- APNG writes compressed chunks directly into bounded growing output. Its
  `peakScanlineBytes` counts the extra filter-byte allocation; read-only RGBA row
  views share the current frame buffer. Compressed-frame byte totals are output
  accounting, not retained compressed-frame allocations.
- Conversion `totalMs` excludes procedural source generation and decode-back;
  those stages are reported separately. The direct WASM tool's elapsed time
  includes decode-back. Async/native scheduling affects wall-clock timings.
- Tiny fidelity cases use whole-frame fingerprints; larger cases use bounded
  samples. A sampled PASS is not proof that every large-frame pixel was compared.
  GIF has quantization/1-bit-alpha/timing limits. Do not treat output size alone
  as a cross-format quality ranking.

## Measured fidelity and coverage limits

The recorded libwebp `exact=1` bridge runs preserved the tested RGBA values at
alpha **0, 1, 64, 127, 128, 200, 254 and 255**, including hidden RGB at alpha zero
(`hiddenRgbMismatches = 0`). No hidden-RGB loss was observed in those tests.

**Adjacent identical WebP frames can coalesce.** The direct bridge check measured
six paired-duplicate inputs becoming three frames with durations 47/350/1500 ms;
six identical inputs became one 1897 ms frame. Total visual duration and play
count were retained, but encoded frame count was not. Strict frame-by-frame
round-trip checks must distinguish this limitation from a timing or loop error.

APNG's opt-in canonical RGBA path is deliberately narrow: all frames must be
independent full-canvas SOURCE/NONE, with non-interlaced RGBA8 PNG data containing
only IHDR/IDAT/IEND and filter 0. It streams stored straight RGBA directly. Other filters, regions,
composition histories or color/profile chunks retain the existing Canvas path,
where premultiplication/readback can round semi-transparent RGB. The experiment
does not claim arbitrary APNG canonical equivalence from the narrow exact path.
`directRgbaFrames` / `canvasReadbackFrames` in source/decode-back metrics identify
the path actually used; ordinary Viewer decoding remains unchanged by default.

The direct bridge memory cases are **10/50/100/200 × 320×240** and **two frames**
at 1024², 1920×1080 and 2048². Those measured opaque procedural workloads and
sampled allocator checkpoints are not a proof for every image pattern or an
unmeasured transient maximum. Full browser cases add alpha/scenes and conversion
checks, but large-image fidelity remains sampled. Real Android memory and
capability acceptance must still be supplied separately.

The current spike guards are at most 200 frames, 2048 per side, 4,194,304 canvas
pixels, 15,360,000 frame-pixels and 64 MiB source/output limits. They are
conservative experiment limits, not a newly selected conversion product policy.
