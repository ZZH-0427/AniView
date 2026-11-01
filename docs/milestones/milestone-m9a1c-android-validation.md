# M9A1c — Android localization acceptance

Status: **PENDING ANDROID LOCALIZATION VALIDATION**.
Both Android Edge and Quark need fresh lightweight product UI acceptance.
No result from an earlier milestone is reused as a pass here.

The dedicated preview candidate will be identified by its frozen
`release-candidate.json` and local hash manifest. It is a production build,
without Vite HMR, not a GitHub Pages deployment. Temporary secure HTTPS access
uses the existing local preview/tunnel workflow. No selected media is sent to
the preview server; sample downloads are procedural local test fixtures.

## Minimal test, each browser

1. Switch English → 简体中文 at the top of Home; enter 转换视频/Convert video.
2. Select the small video. Set nondefault Trim (e.g. Start0.2/End1.0) and FPS
   (e.g.20 for Animated WebP). Switch back to English. Confirm source, Trim,
   FPS and target remain; labels/helpers update immediately.
3. Convert; Preview → Close/Back. Result stays available, Preview gets its
   focus indication and Download stays in view. Switch language again; return
   Home. No clipped/overlapping text or unintended mixed owned UI.
4. In one browser also choose one static image in Create GIF: the minimum-image
   helper and disabled Generate update in both languages. In Convert video,
   make End earlier than Start: the localized error stays beside Trim and
   clears after correction. No need to generate a new GIF or repeat codec tests.

| Result | Android Edge | Android Quark |
| --- | --- | --- |
| Language switch / layout | Pending | Pending |
| Selected source/settings retained | Pending | Pending |
| Conversion/result retained | Pending | Pending |
| Preview return focus/Download visibility | Pending | Pending |
| Home and no crash/reload | Pending | Pending |

One-browser helper/invalid-Trim coverage: Pending.
User confirmation should record the results and any anomaly; no long JSON,
stress matrix or redundant codec measurements are required.
