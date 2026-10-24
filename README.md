# AniView

Local Animated Media Viewer for mobile and desktop browsers.

**Project status: early development / Milestones 1–6 PASSED.**
Milestone 7A UI polish is implemented; new Android Edge/Quark UI acceptance is pending.
The viewer supports Animated WebP, APNG and GIF with Play/Pause, Replay, looping,
Previous/Next Frame and a current-frame count. All animated formats use the same
bounded cache, player and renderer. Single-frame GIF is supported. JPEG, static
PNG and static WebP use native decoding and the same Canvas viewer, without an
animation player or frame cache.
See the [WebP vertical slice](docs/milestones/milestone-1-webp-vertical-slice.md)
and [APNG integration notes](docs/milestones/milestone-2a-apng.md).
See [GIF integration notes](docs/milestones/milestone-2b-gif.md) for timing,
disposal compatibility, the approved interlace adaptation and acceptance status.
See [Viewer UX notes](docs/milestones/milestone-5-viewer-ux.md) for static-image
ownership, viewport interactions, frame stepping, limits and validation status.
See [stability and compatibility notes](docs/milestones/milestone-6-stability-compatibility.md)
for the browser matrix, resource limits, lifecycle policy and stress procedures.
See [release UI notes](docs/milestones/milestone-7a-release-ui-polish.md) for the
icon controls, responsive screenshots and current acceptance status.

Use **Fit**, **1:1**, zoom buttons, wheel zoom and mouse drag; on touchscreens,
pinch, drag or double-tap. Double-click/tap toggles Fit and a closer detail view.
100% means one image pixel per CSS pixel. A new file opens in Fit; animation
frame changes preserve the current view. Animations initially open paused,
preserving the previous viewer behavior; Play starts playback and Replay restarts
and plays. Frame stepping pauses playback and never loops at an endpoint.
Fullscreen is available when the browser supports it. Controls remain visible
normally and hide after inactivity in fullscreen; interaction reveals them.
The header contains Fullscreen, More and Close. Frame-step controls use bar/triangle
icons; file navigation uses chevrons with an **Image N / Total** count. Button
tooltips and accessible names describe each action. Static images omit playback
and frame controls.

When focus is on the image surface: Space toggles playback, Left/Right step
frames, Shift+Left/Right change files, `0` selects Fit, `1` selects 100%, and
`+`/`-` zoom. Focused controls retain their native keyboard behavior.

Choose **选择图片** on mobile or **Open Images** on desktop. The standard picker
uses `image/*`; its gallery/directory interface depends on the browser and system.
Select multiple files or drag files into the desktop page, then use Previous/Next File,
More → Remove from list, Choose more images and Clear session. Files are opened on demand
from a temporary list (up to 1,000 items); removing an item never deletes the
device file. Cancelling selection preserves the list; Close clears it.
See [Input Experience](docs/milestones/milestone-3-input-experience.md) for the
final Android picker validation matrix. QQ, Quark, Chrome, Edge and Xiaomi
passed user-reported selection, playback and multi-file navigation checks.

Use the secondary **Open ZIP** action (**打开 ZIP 压缩包** on mobile) to browse
images and animations inside a local ZIP without extracting it to your device. Entries keep
their archive order and nested names. Only the current image is extracted;
Previous/Next File and playback use the same viewer as ordinary images. Opening a ZIP
replaces the current list; selecting ordinary images replaces the archive.
Close archive releases its resources. Password-protected entries are identified,
but password entry is not available yet. ZIP processing stays entirely local.
See [ZIP archive notes](docs/milestones/milestone-4-zip-archive.md) for limits,
supported entry discovery, validation and the completed Android acceptance record.

Supported formats: GIF, Animated WebP, APNG, JPEG, static PNG and static WebP.
The broad system image picker does not imply HEIC/TIFF/BMP/SVG/AVIF support.
Files are processed locally in your browser; viewing requires no media uploads,
accounts or backend. No analytics is included. Static files are limited to 64 MiB
encoded, 4,194,304 pixels and 16,384 pixels per edge; oversized images are rejected
before native decoding. There is no conversion, editing or export.
Animation scheduling suspends while the page is hidden. Returning resumes only
when it was playing before backgrounding; paused media stays paused, with no
attempt to catch up all hidden-time frames. Browser/device memory pressure can
still prevent an otherwise supported file from opening. APNG needs Worker
ImageBitmap decoding and OffscreenCanvas; GIF does not require OffscreenCanvas.

An isolated Milestone 1A Animated WebP engineering spike is available through
`?spike=webp`; this is not production playback support. Its build, ownership and
validation details are in [the technical notes](docs/milestones/milestone-1a-webp-wasm.md).

## Development

Install Node.js 24 LTS (see `.nvmrc`) with npm, then:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173/AniView/`.

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:browser
npm run test:release-ui
npm run preview
```

`test` runs Vitest once for CI; `test:watch` enables watch mode. The baseline tests
use React's static rendering API in Node, so no simulated DOM dependency is needed.
Production output is generated in `dist/` and is ignored by Git.
Browser checks use an installed Edge on Windows or Chrome on Linux; `BROWSER_PATH`
can select an existing executable. No browser is downloaded. `test:release-ui`
checks icon/menu semantics, responsive layouts, diagnostics and short resource smoke.

Normal viewing renders no developer diagnostics. With `?debug=1`, Image,
Resource and (when applicable) Archive diagnostics appear as collapsed panels.
Expand a panel for grouped numeric values, then expand **Raw JSON** only when
the original complete counters are needed. Diagnostics remain local and do not
change playback, memory limits or cleanup.

## GitHub Pages

Vite uses `/AniView/` as its base in development and production. Future runtime
assets must use Vite imports, `new URL(..., import.meta.url)` or
`import.meta.env.BASE_URL` rather than hard-coded root URLs.

Repository: [ZZH-0427/AniView](https://github.com/ZZH-0427/AniView).

Select **GitHub Actions** in **Settings → Pages → Build and deployment → Source**.
The Pages workflow runs
`npm ci`, lint, typecheck, tests, the build, core browser regression and release UI
browser regression on pushes to `main`. It uploads
`dist/` with the official Pages artifact action and deploys with `deploy-pages`.
Pull requests run validation only. Manual runs deploy only from `main`.

The expected production URL is [AniView](https://ZZH-0427.github.io/AniView/).
Check the **Validate and deploy Pages** workflow in the repository's **Actions**
tab for the actual validation and deployment result.
Do not commit `dist/` or maintain a `gh-pages` source branch.

## Module boundaries

- `src/app/` and `src/pages/`: React shell, Home and Viewer.
- `src/input/virtual-file.ts`: source-independent byte reads, including ranges.
- `src/input/`: shared browser-file adapters for standard selection and file drops.
- `src/archive/`: lazy Worker-backed ZIP metadata, entry policy and VirtualFile source.
- `src/formats/`: binary detection, unified opening, Worker-backed animation adapters and native static-image sources.
- `src/media/`: animation/frame contracts, resource policy and categorized errors.
- `src/media/media-session.ts`: page-lifetime ordered references and file navigation.
- `src/player/`: bounded prefetch/cache, presentation clock and frame inspection.
- `src/renderer/`: viewport geometry, mouse/touch gestures and Canvas drawing.

Animation sequences expose fresh incremental frame streams for replay. Consumers
own yielded frames and must dispose of them on eviction. Frames are normalized
to fully composited canvas-sized images so codec blend/disposal details stay in
the decoder adapter. Renderer calls borrow a frame synchronously. The player
owns sequence cleanup and a byte-bounded cache (16 MiB / six frames normally).
Larger frames receive exactly two frames of cache capacity, up to a 32 MiB
automatic ceiling. Explicitly configured budgets remain strict.
Backward inspection uses cached neighboring frames or resets and reconstructs
sequentially within the same budget. Static ImageBitmaps are explicitly closed
when switching, removing or closing files. Viewport redraws reuse the current
pixels and do not decode the image again.

The shared WebP Worker lives with its format adapter under `src/formats/webp/`.
ZIP metadata and extraction use a separate Worker; ZIP libraries are loaded only
after Open ZIP. See `PLAN.md` for the architecture
and roadmap, and `AGENTS.md` for development rules.
