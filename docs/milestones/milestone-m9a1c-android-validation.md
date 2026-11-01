# M9A1c — Android localization acceptance

Status: **PASSED**, 2026-11-01.
Method: user-reported completion of this frozen candidate's fresh Android Edge
and Quark lightweight product UI checklist. No earlier milestone result is
reused as a pass here. User response: **“测试完成，均无问题”**.

Frozen candidate: `9d377b5ec0a98e487ac26faa2751f750e9153b26`.
Page: https://email-farming-ins-cached.trycloudflare.com/AniView/
Small sample: https://email-farming-ins-cached.trycloudflare.com/AniView/validation/video-animation/small.mp4

The candidate's `release-candidate.json` records `sourceDirty:false`.
Local manifest `.tools/localization/frozen.json` hashes all35 artifact files
in `.tools/localization/site-9d377b5`; dedicated preview port4246.
It is a production build, without Vite HMR, not a GitHub Pages deployment.
Temporary secure HTTPS access
uses the existing local preview/tunnel workflow. No selected media is sent to
the preview server; sample downloads are procedural local test fixtures.
The HTTPS entry/HTML dependencies/favicon/candidate identity (9 paths) matched
their frozen hashes; small.mp4 matched the original2187-byte procedural file.
Installed desktop Edge independently confirmed `secureContext:true`, HMR false,
Chinese switching, video conversion and Preview return, with no page exception.
This desktop connectivity check is separate from the Android acceptance result.
The frozen artifact was not modified during acceptance.

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
| Language switch / layout | Pass | Pass |
| Selected source/settings retained | Pass | Pass |
| Conversion/result retained | Pass | Pass |
| Preview return focus/Download visibility | Pass | Pass |
| Home and no crash/reload | Pass | Pass |

One-browser minimum-image helper/invalid-Trim coverage: confirmed through the
user's all-items completion response; the browser used for this supplemental
check was not specified. No additional per-browser measurements are inferred.
No anomaly was reported. No long JSON, repeat codec matrix or stress test was
required for this lightweight language/layout acceptance.

M9A1c is closed. M9A2 has not started. V0.2 is not released; main, the v0.1.0
tag and GitHub Pages remain unchanged. This closure changes documentation only.
