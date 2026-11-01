# Video → Animation engineering tools (8D1)

This is an isolated technical spike. It adds no ordinary Home/Viewer action and
does not deploy to GitHub Pages. V0.2 is not released. Android acceptance is pending.

## Reproduce

Use the installed Node.js 24 / npm environment and committed lockfile:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run build:video-source-spike
npm run test:video-source-spike
npm run preview:video-source-spike
```

The production preview defaults to
`http://127.0.0.1:4230/AniView/experiments/video-source/?debug=1`.
It serves only built assets and the named fixture manifest/media, accepts GET/HEAD,
and rejects uploads. A normal LAN HTTP address is not a valid WebCodecs acceptance
origin. Phone tests need trusted HTTPS or an explicitly approved trustworthy
localhost transport; never disable TLS/browser security.

Generate local fixture artifacts first:

```powershell
$env:FFMPEG_PATH = 'C:\path\to\ffmpeg.exe'
node tools/video-source/generate-fixtures.mjs
```

The executable is an **external fixture generator/oracle only**. No FFmpeg/WASM,
binary, wrapper package, or fallback is imported into AniView. This workstation's
ignored copy came from the official imageio-ffmpeg 0.7.0 Windows wheel
([publisher](https://pypi.org/project/imageio-ffmpeg/0.7.0/)), SHA256
`7a22b45f60321d4172bdf2bc61f716bce4c81b85727bd59c7c7e371055a6a440`;
its executable identifies as FFmpeg 7.1 / Gyan essentials. Tool provenance stays
under ignored `.tools/video-source/fixture-tool/`, not npm dependencies.

The photographic quality fixture uses the existing local
`.tools/video/nasa-blue-marble.jpg`: the NASA Apollo 17 image from
[this NASA source](https://www.nasa.gov/wp-content/uploads/2023/03/as17-148-22727_lrg_0.jpg?resize=600,600).
It is a credited photographic derivative, not an original synthetic image.
Temporal/barcode/corner fixtures are original procedural RGB. Generated media,
external executables, profiles, reports and screenshots remain ignored.

## Fixture and oracle design

| Fixture | Purpose |
| --- | --- |
| cfr.mp4 / vp9.webm | AVC / VP9 six-target matrix; barcode IDs and colored corners |
| vfr.mp4 | Real VFR PTS 0/.1/.4/.45/1 seconds; end1.03 |
| bframes.mp4 | Real x264 B-frames: independent FFmpeg showinfo/debug_ts records14 B pictures and PTS≠DTS |
| rotation.mp4 / portrait.mp4 | 90° metadata and1080×1920 portrait |
| par.mp4 | SAR2:1, coded64×48 → display128×48 |
| nonzero.webm / negative.mp4 | +5 second origin; −.2 second preroll/edit offset |
| long.mp4 / long-gop.mp4 | 32-second mid-trim; rejected >5-second keyframe preroll |
| benchmark.mp4 | 320×240, 10/50/100/150 output frames at15 FPS |
| 1080.mp4 / photo.mp4 | 1920×1080 source →480/720 long-edge quality |
| dense-1080.mp4 | Independent decoded-source-work rejection despite small output |
| 4k.mp4 / hdr-tagged.mp4 / audio.mp4 | Metadata rejection before actual video decode |

The marker strip is a robust 8-bit grayscale barcode; RGB corners verify upright
rotation/PAR/resize. The expected active marker comes from the independently
prescribed source timeline, not from the decoder's reported frame identity.
Source/target numeric fingerprints compare existing GIF tolerance or exact
WebP/APNG composed RGBA at selected sample times. No raw frame history is kept.

## PAR compatibility follow-up

The Android Quark probe exposed missing display PAR at native decode output.
The adapter now admits only a coherent track-declared PAR plus complete,
unadjusted visible frame, then uses existing full-frame draw into track-derived
dimensions. No library patch, extra Canvas/frame or resource-limit change.
`Run PAR matrix` checks that fixture against all three existing encoders.
See [evidence and the targeted phone protocol](../../docs/spikes/milestone-8d1-quark-par-followup.md).

To preserve an existing acceptance artifact, build/serve a separate candidate:

```powershell
npm run build:video-source-spike -- --outDir .tools/video-source-par-site
node tools/video-source/preview.mjs --root .tools/video-source-par-site --port 4232
node tools/video-source/run-browser.mjs --root .tools/video-source-par-site --output .tools/video-source/par-desktop
node tools/video-source/test-par-compat.mjs
```

The final command uses a test-only native decoder metadata-omission shim and
real encoder/decode-back oracles; it is desktop regression evidence, not a
production decoder replacement or Android test result.

The actual 90kHz-vs-µs boundary experiment is documented in the spike record.
Both source relative PTS and the requested grid use round-half-up integer µs;
selection remains previous/active, not nearest. Quantization is at most0.5µs.

## Pipelines and evidence

One VideoSource Worker performs metadata/range reads, Mediabunny decoding,
current/lookahead sampling, public sample.draw, one reusable output Canvas and
RGBA8 readback. Main transfers a single canonical buffer to the existing target
Worker and grants the next credit only after encoder acceptance.

Decode-back uses the existing AniView animation decoder plus a separate numeric
inspector Worker **after conversion Workers close**. Peak two tracked Workers is
not a statement about browser codec/GPU threads.

`node tools/video-source/run-browser.mjs` runs the installed desktop Edge matrix.
`--smoke` runs the six main directions plus VFR/B-frame/rotation.
`node tools/video-source/measure-bundle.mjs` records raw/gzip sizes and a
standalone same-public-symbol Mediabunny input probe. Shared/minifier effects
prevent exact additive attribution.

Cancellation has cooperative Input/iterator/sample cleanup and a one-second
hard-termination fallback. Hard termination is explicitly recorded; it does not
fabricate balanced sample-close counters or native-memory measurements. Reset
closes the prior Worker before recreating it; epoch checks reject stale reads.

The source-work proxy includes application-observed source samples (including
probe/observable preroll), not every internally decoded/prefetched frame. The
crossing sample has already been decoded when its counter rejects the job.
Native/GPU bytes and internal reference-frame count remain UNKNOWN.

## Phone gate

Use the frozen production build, not Vite HMR. The screen and Summary JSON show a
content-derived build ID. Current user preference is wireless HTTPS; USB is not
required for this round. Do not change/rebuild the artifact while phone acceptance
is underway. Full results and practical steps belong in:

- [Technical record](../../docs/spikes/milestone-8d1-video-to-animation.md)
- [Pending Android acceptance](../../docs/spikes/milestone-8d1-android-validation.md)

Preserve Edge/Quark per-browser summaries and report every untested combination.
No prior 8A/8B/8C result substitutes for video-input acceptance.
