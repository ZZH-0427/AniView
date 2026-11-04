# AniView

A browser application for viewing, creating and converting animated media.
Images, videos and ZIP entries are processed **locally on your device**.

**[Open AniView](https://zzh-0427.github.io/AniView/)** ·
[Releases](https://github.com/ZZH-0427/AniView/releases) ·
[V0.2 release notes](docs/releases/v0.2.0.md)

This source tree prepares **0.2.0**. Production remains on the previous release
until the explicit release approval and deployment gates pass. See the
[release preparation record](docs/releases/v0.2.0-release-preparation.md).

## Supported workflows

| Input | View / preview | Create or convert |
| --- | --- | --- |
| JPEG/JPG, PNG, static WebP | Static Canvas viewer | Create animation input: generate GIF |
| GIF, Animated WebP, APNG | Application-controlled Canvas animation | Convert to either other animated-image format, or MP4/H.264 |
| MP4/H.264 | Native source preview, when supported | GIF, Animated WebP or APNG |
| WebM/VP9 profile 0 | Native source preview, when supported | GIF, Animated WebP or APNG |
| ZIP | Browse supported image entries | Open an entry in the normal viewer/conversion workflow |

Format detection inspects file signatures and container metadata. A system picker
showing other file types does not make them supported. APNG commonly uses `.png`.

## View images and ZIPs

Choose images from the device picker, or drag images onto the desktop app. Multiple
selection creates a temporary list with Previous/Next File, append, remove and
clear controls. The mobile picker and its gallery, albums, directories and Camera
entry depend on the browser and OS.

Animations open paused. Play/Pause, Replay and Previous/Next Frame provide
playback and frame inspection; static images omit animation controls. Use Fit,
1:1, zoom, pan, pinch and double-tap, plus fullscreen where supported. Frame changes
preserve the view; changing files restores Fit. The player uses bounded frame
retention rather than retaining every decoded frame.

Open a ZIP to browse without extracting it manually. Metadata is read first and
the current entry is extracted on demand. Password-protected entries are identified
and can be skipped, but **password entry/playback is not supported**. Corrupted,
unsupported and excessive workloads produce recoverable errors where possible.
RAR and 7z are unsupported. Removing an item never deletes the original file.

## Create animation

Add **2–200 static JPEG/PNG/WebP images**, reorder or remove them, set frame
durations and loop count, then **Generate GIF**. Preview uses the shared viewer;
returning from Preview preserves the list, settings and result. Download saves a
local file with a distinct name for each download request.

The creator currently generates GIF only. To obtain Animated WebP or APNG, save
the GIF, reopen it in the viewer and use **More → Convert animation**. Direct
multi-target image creation is deferred. GIF has a 256-color palette, binary
transparency, no dithering and centisecond timing; converting it later cannot
recover colors or alpha discarded during GIF creation.

## Convert animation and video

From an animated image, choose **More → Convert animation**. GIF, Animated WebP
and APNG can convert to either of the other two formats. Results have Preview,
Back and Download controls; returning to the source preserves file/ZIP navigation.

MP4 export uses browser-provided H.264 encoding in a secure context. It exports
**one animation cycle, without audio**, composites transparency onto white, and
uses lossy video compression. Odd dimensions receive white padding to even
dimensions, without cropping or stretching.

**Convert video** accepts supported MP4/H.264 and WebM/VP9 profile 0 files:
**8-bit SDR opaque video only; audio is ignored**. Choose a trim interval, an
available FPS/resolution preset and GIF, Animated WebP or APNG output. No upscaling
is applied. Output is limited to 150 sampled frames, a 30-second selected interval
and a 720-pixel long side, with additional workload limits below. Repeated equal
frames may be merged, so output frame count can differ from the sampling plan.

Cancel releases the active job and permits another attempt. Lists, selected files
and generated results are temporary memory state: a full page reload returns to
Home and does not restore media or results. Downloads are managed by the browser;
some Android browsers save to Downloads without adding the file to the gallery.

## Language and privacy

The interface supports **English / 简体中文**. A saved language choice takes
priority; otherwise browser language selects the initial locale, with English as
fallback. Browser-native pickers, video controls and downloads follow browser/OS
language. Switching the app language preserves the active workspace.

AniView has no media-upload backend, account system, analytics or diagnostic
upload. Application assets are downloaded from the hosting site. Selected file
bytes, decoded frames, ZIP contents and output media remain local. Only the UI
language preference is saved in local storage; media is not persisted there.
Optional `?debug=1` diagnostics are local and initially collapsed. They do not
relax resource limits; ordinary pages omit diagnostics.

## Browser requirements and validation

The viewer requires local File/Blob APIs, Canvas 2D, Pointer Events,
ResizeObserver, AbortController and animation-frame scheduling. Animation/ZIP
processing uses module Web Workers. Animated WebP requires WebAssembly; static
images and APNG need relevant ImageBitmap/OffscreenCanvas support. APNG encoding
requires Worker-side `CompressionStream('deflate')`. Fullscreen is optional.

Video conversion additionally requires a **secure context** (HTTPS or trusted
localhost), usable Worker WebCodecs and browser/OS codec support. Source preview
and output encoding support are detected separately; API presence alone does not
guarantee a particular file is supported. Unsupported capabilities receive a
compatibility message.

V0.2 validation includes desktop Edge automated/browser checks and real Android
Edge and Quark workflows. Earlier viewer checks also covered Chrome, QQ and
Xiaomi browsers; these are not claims of complete V0.2 conversion coverage.
See the [qualified RC audit](docs/milestones/milestone-m9a2-v0.2-stability-rc-audit.md)
and [Android record](docs/milestones/milestone-m9a2-android-rc-validation.md).
No app-observable resource leaks were detected in the validated flows;
native/GPU memory is not fully observable.

## Processing limits

| Workflow | Principal limits |
| --- | --- |
| Image viewing | 64 MiB encoded image; static images up to 4,194,304 pixels and 16,384 pixels per edge |
| Display Canvas | 8,192 pixels per edge; 16,777,216 backing pixels |
| Viewing list / ZIP | 1,000 images; ZIP 512 MiB encoded, 10,000 entries, 64 MiB per uncompressed entry |
| Static images → GIF | 2–200 images; 16 MiB combined source; 2,048 pixels per side, 4,194,304 pixels per frame; 15,360,000 total frame-pixels |
| Animation conversion / MP4 | Up to 200 frames; 2,048 pixels per side, 4,194,304 pixels per frame; 15,360,000 total frame-pixels; source/output each 64 MiB; MP4 duration up to 30 seconds |
| Video → animation | Source/output each 64 MiB; coded side up to 2,048 and coded pixels up to 2,073,600; output long side up to 720; 150 sampled frames; 30 seconds selected; 15,360,000 output frame-pixels |

Archive ratios, observed video decode work, deadlines and decoder memory have
additional guards. Supported files can still exceed a device's available memory.
Viewer/archive details remain in the [viewer limit reference](docs/releases/v0.1.0-limits.md);
conversion limits are recorded in the V0.2 milestone audits.

## Development

Use **Node.js 24 LTS** and **npm**. `.nvmrc`, package engines and Actions agree.

```sh
npm ci
npm run dev
```

Open the Vite URL, normally `http://localhost:5173/AniView/`.

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:browser
npm run test:release-ui
npm run preview
```

Browser checks use installed Edge on Windows or Chrome on Linux; `BROWSER_PATH`
selects an installed executable. The harness downloads no browser. `test:watch`,
`test:stress` and `test:soak` are also available. Generated media stays outside
the production artifact. Vite development uses HMR and may reload after a mobile
background WebSocket disconnect; use a production build/preview for lifecycle
acceptance.

Vite base is **`/AniView/`**. GitHub Actions validates clean installation, lint,
types, tests, build and browser regressions. Pushes to `main`, or manual workflow
runs on `main`, deploy through official Pages actions. Pull requests validate
only; release branches and tags do not automatically deploy. `dist/` is generated
and not committed. Architecture and working rules: [PLAN.md](PLAN.md),
[AGENTS.md](AGENTS.md).

## Licensing

AniView's own code remains **UNLICENSED**, with `private: true` and no root
LICENSE granting reuse, modification or redistribution rights. Third-party
licenses apply to their respective components and do not license AniView itself.

Components include libwebp/Emscripten, apng-js, omggif, gifenc, zip.js, React,
React DOM and unmodified **Mediabunny 1.65.0 (MPL-2.0)**. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
[retained license texts](third_party/licenses/) and the
[deployed notice collection](https://zzh-0427.github.io/AniView/third-party-notices.txt).
Corresponding MPL source is linked there. Browser/OS H.264 codec availability
does not constitute a patent license grant from AniView.

## Deferred work

Direct multi-target image creation, password ZIP UI, RAR/7z, advanced animation
editing, custom FPS/resolution and additional languages are deferred. No release
date is promised for these features.
