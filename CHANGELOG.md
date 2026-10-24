# Changelog

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
