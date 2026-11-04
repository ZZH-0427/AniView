# Changelog

## 0.2.0 - Prepared, not yet released

- Create GIF from static JPEG/PNG/WebP images; reorder, set timing/loops,
  preview and download. Direct WebP/APNG creation is deferred.
- Convert GIF, Animated WebP and APNG between formats and to one-cycle, silent
  H.264 MP4 with transparency composited to white.
- Convert supported MP4/H.264 and WebM/VP9 profile 0 videos to GIF/WebP/APNG,
  with trim/presets, bounded workloads, cancellation, Preview and Download.
- English / 简体中文 UI with workspace-preserving language changes.
- Cross-feature lifecycle/resource checks and real Android Edge/Quark RC smoke.

See [release notes](docs/releases/v0.2.0.md) and the
[approval/preparation record](docs/releases/v0.2.0-release-preparation.md).

## 0.1.0 - 2026-10-25

First public AniView release.

### Added

- Local Animated WebP, APNG and GIF playback with pause/resume, replay and
  frame-by-frame inspection.
- Static JPEG, PNG and WebP viewing in the same responsive Canvas viewer.
- Multiple image selection, desktop drag and drop, file navigation and local
  ZIP browsing with on-demand entry extraction.
- Zoom, pan, Fit, actual size, touch gestures and optional fullscreen.
- Compact icon controls and optional, initially collapsed local diagnostics.

### Reliability

- Bounded animation frame retention, Worker-based decoding/archive work and
  resource cleanup when switching or closing files.
- Background playback suspension, recoverable file errors and practical limits
  for untrusted media and ZIP input.

### Known limitations

- No password entry UI, RAR/7z, conversion, export, timeline seeking or thumbnails.
- Supported files remain subject to processing limits and device/browser memory.

### Licensing

No project license is granted for AniView v0.1.0 (`UNLICENSED`). Third-party
components remain subject to their respective licenses.

See [release notes](docs/releases/v0.1.0.md) and
[release QA](docs/releases/v0.1.0-qa.md) for validation evidence.
