# AniView

A client-side web viewer for animated and static images, with first-class
Animated WebP, APNG and GIF playback on mobile and desktop.

## Live Demo

**[Open AniView](https://zzh-0427.github.io/AniView/)**

Choose local images or a ZIP archive. Media processing happens in your browser.

## V0.2 Feature Branch — Unreleased

The `feat/v0.2-static-to-gif` branch adds static-image GIF creation and
**Viewer → More → Convert animation** for GIF, Animated WebP and APNG.
Conversion supports six cross-format directions, Preview and unique repeated
downloads. It keeps the original source and ZIP session. Same-format targets
are disabled. Limits and format tradeoffs are described in the
[8B2 productization record](docs/milestones/milestone-8b2-animation-conversion-productization.md).
Milestone 8B2 passed fresh Android Edge/Quark product acceptance; the public
demo above remains v0.1.0. V0.2 is not released.

`feat/v0.2-animation-to-video` additionally contains the isolated
[8C1 MP4/H.264 technical spike](docs/spikes/milestone-8c1-animation-to-mp4.md),
which passed desktop and fresh Android Edge/Quark acceptance with documented
limitations. It adds no video export control to the product; 8C2/8D1 have not started.
Engineering build/test/HTTPS preview instructions are in [tools/video](tools/video/README.md).

## Features and Supported Formats

| Media | Supported formats |
| --- | --- |
| Animated images | Animated WebP, APNG, GIF, including single-frame GIF |
| Static images | JPEG/JPG, PNG, static WebP |
| Archive input | ZIP containing supported images |

Animated formats use AniView's decoding and playback pipeline rather than
browser-native animated `<img>` playback as the baseline. All three animation
formats share playback, bounded frame caching and Canvas rendering.

- Play, pause, resume, replay and inspect individual frames.
- Browse multiple selected or dropped images with Previous/Next File.
- Fit, actual size, zoom, pan, pinch and double-tap/double-click.
- Use fullscreen when the browser provides it.
- View images inside a ZIP without manually extracting the archive.
- Use a responsive, icon-first viewer with accessible names and keyboard controls.

## How to Use

1. On a phone, tap **选择图片**; on desktop, choose **Open Images** or drag files
   onto the page. Multiple image selection is supported.
2. An animation opens paused on its first frame. Press Play to start; Replay
   restarts and plays. Static images open without animation controls.
3. Use the file chevrons around **Image N / Total** to change images. Use the
   bar/triangle controls to step animation frames.
4. Add more images through the image-list options. **More → Remove from list**
   removes a reference from the temporary list; it does not delete the file on
   your device. Close clears the current viewing source.

The exact system picker interface, available albums, directory access and Camera
entry are controlled by the browser/OS. Cancelling a picker preserves the current
list. A broad image picker can show formats that AniView does not support.

## ZIP Support

Choose **Open ZIP** (**打开 ZIP 压缩包** on mobile) to browse a local archive.
Entries retain their archive order and nested names. Metadata is read first;
only the current image entry is extracted. Opening a ZIP replaces the ordinary
image list, and choosing ordinary images replaces the archive.

Encrypted entries are identified separately from corrupted entries, and you can
continue to other images. **Password entry UI is not included in v0.1.0.** ZIP
browsing is subject to resource and integrity checks. RAR and 7z are unsupported.

## Viewer Controls

| Action | Controls |
| --- | --- |
| Animation | Previous Frame, Play/Pause, Next Frame, Replay; current frame counter |
| Files | Previous File, Image N / Total, Next File |
| View | Zoom out/in, percentage, Fit, 1:1, drag/pinch, double-tap/double-click |
| Viewer | Fullscreen when supported, More, Close |

Hover over an icon for its title. **1:1** means one image pixel per CSS pixel.
A new file opens in Fit; frame changes preserve the current view. Frame stepping
pauses playback and stops at the endpoints. Older frames may be reconstructed
rather than permanently retained, keeping frame inspection bounded-memory.

With focus on the image surface, Space toggles playback, Left/Right step frames,
Shift+Left/Right change files, `0` selects Fit, `1` selects actual size, and
`+`/`-` zoom. Escape exits fullscreen. Focused controls retain their native
keyboard behavior. In fullscreen, controls hide after inactivity and reappear
with interaction.

## Privacy and Local Processing

Image and ZIP contents are processed locally in the browser. AniView has no
backend media-upload API and does not require an account. It does not upload
selected media, archive passwords or diagnostics, and includes no analytics.
The browser still downloads the website's application assets from GitHub Pages.

AniView applies resource limits to untrusted media and ZIP input. These limits
do not guarantee that every file will open on every device or under memory pressure.

## Browser Compatibility

| Environment | Validation coverage |
| --- | --- |
| Desktop Edge | Complete Viewer regression, stress/soak, lifecycle and UI checks |
| Desktop Chrome | Core cross-browser checks and release UI checks |
| Android Edge | User-reported core viewing, ZIP, stability, UI and final RC smoke |
| Android Quark | User-reported core viewing, ZIP, stability, UI and final RC smoke |
| Android QQ | Earlier GIF/input functionality; reduced coverage |
| Xiaomi Browser | Earlier WebP/input functionality; reduced coverage |

Other browsers may work but are outside this validation matrix. Final Android
smoke passed in Edge and Quark by user report; details are in the
[release QA record](docs/releases/v0.1.0-qa.md).
Detailed evidence is in the [stability](docs/milestones/milestone-6-stability-compatibility.md)
and [UI acceptance](docs/milestones/milestone-7a-release-ui-polish.md) records.

The viewer requires Canvas 2D, Pointer Events, ResizeObserver, AbortController,
animation-frame scheduling and local File/Blob APIs. Animated formats and ZIP
use module Web Workers. Animated WebP also requires WebAssembly. Static images
need `createImageBitmap`; APNG needs Worker-side `createImageBitmap` and
OffscreenCanvas. GIF does not require OffscreenCanvas. Fullscreen is optional.

## Resource Limits and Known Limitations

| Resource | Current limit |
| --- | --- |
| Encoded image or extracted media entry | 64 MiB |
| Static image pixels | 4,194,304 |
| Static image edge | 16,384 pixels |
| Display Canvas backing | 8,192 pixels per edge; 16,777,216 pixels total |
| Viewing list | 1,000 images |
| ZIP | 512 MiB encoded; 10,000 entries; 64 MiB per uncompressed entry |

Other archive/path/compression and decoded-frame limits apply. See
[v0.1.0 resource limits](docs/releases/v0.1.0-limits.md). Browser memory pressure
can prevent a supported file from opening. Playback suspends while the page is
hidden and preserves prior playing/paused intent on return.

v0.1.0 does not include password entry for encrypted ZIPs, RAR/7z, conversion,
static-image-to-animation creation, video, converted-file export, timeline or
arbitrary frame seeking, or a thumbnail gallery. HEIC, TIFF, AVIF, SVG and BMP
are not supported formats. These are scope limits, not advertised features.

## Development and Validation

Use **Node.js 24 LTS** with **npm**. `.nvmrc` and package engines specify Node 24.

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

`test:watch` enables Vitest watch mode. Browser checks use an installed Edge on
Windows or Chrome on Linux; `BROWSER_PATH` selects another installed executable.
The harness downloads no browser. Optional `test:stress` and `test:soak` commands
are documented in the stability record. Generated test data stays outside the
production public tree.

For development, `?debug=1` enables initially collapsed, local diagnostics with
optional Raw JSON. It neither disables safety limits nor uploads diagnostics.
Ordinary viewing renders no diagnostic panels.

Vite uses **`/AniView/`** in development and production. The GitHub Actions Pages
workflow validates clean installation, lint, types, tests, build and browser
regressions. Main builds deploy through the official Pages actions; pull requests
validate only. `dist/` is generated and is not committed. Architecture and
contribution rules are in [PLAN.md](PLAN.md) and [AGENTS.md](AGENTS.md).

## Licensing

No project license is granted for AniView v0.1.0. The source repository is
publicly viewable, but the project does not grant permission to reuse, modify,
redistribute or commercially redistribute AniView code unless separately
authorized. The package metadata is `UNLICENSED`, and no root LICENSE is provided.

Third-party components remain governed by their respective licenses.

### Third-party Components

AniView uses libwebp/Emscripten, apng-js, omggif, zip.js, React and React DOM.
Versions, purposes and license sources are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); retained license texts are under
[`third_party/licenses/`](third_party/licenses/). The deployed application also
includes [third-party notices](https://zzh-0427.github.io/AniView/third-party-notices.txt).

Third-party notices do not grant a license to AniView's own code.

## Roadmap

Future work may include password ZIP UI, static images to animation, GIF/WebP/APNG
conversion, animated images to video, video to animated formats and export
workflows. None is available in v0.1.0, and no release dates are promised.

## Current Version

**0.1.0 — 2026-10-25.** See the
[release notes](docs/releases/v0.1.0.md),
[release QA record](docs/releases/v0.1.0-qa.md) and
[GitHub Release](https://github.com/ZZH-0427/AniView/releases/tag/v0.1.0).
