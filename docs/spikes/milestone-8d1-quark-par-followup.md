# 8D1 Quark PAR follow-up — 2026-11-01

Status: **PAR FIX PHONE VERIFIED / FUNCTIONAL AND CLEANUP PASS / TIMER REVIEW PENDING**.
Original candidate: `8d1-c8c7e145cf58`. New candidate: `8d1-122e82b97f04`.
Overall8D1 is not passed;8D2 has not started. V0.2 is not released.

## Physical-phone evidence

The user supplied `par-geometry-1` from Quark10.2.0.995 / Chromium123 / Android16.
This is a real phone report, not an emulation. Secure context true, HMR false.

| Point in pipeline | Coded dimensions | Visible rectangle | Display dimensions |
| --- | --- | --- | --- |
| Parsed track | 64×48 | — | 128×48; PAR2:1 |
| Requested decoder config | 64×48 | — | displayAspect128×48 |
| Supported decoder config | 64×48 | — | displayAspect128×48 |
| Native decoder callback, before library copy | 128×48 | (0,0),64×48 | **64×48** |
| Public library sample | 64×48 (visible-size getters) | (0,0),64×48 | **64×48** |
| Separate Canvas→VideoFrame constructor | 64×48 | (0,0),64×48 | **128×48** |

The native callback already has the wrong display aspect ratio:4:3 instead of8:3.
This is not a harmless proportional representation of128×48. The config probe
reported support but actual decoding failed to honor PAR. The later library
sample carries the same missing adjustment; its Canvas-copy constructor can
preserve explicit display dimensions on this device. Thus the observed loss is
located at native decode output, not introduced by AniView navigation, HMR,
resource exhaustion or the library copy. The underlying Quark/Chromium/device
decoder implementation responsible is not isolated further by this evidence.

Native coded stride/padding can differ from the visible region;128 coded pixels
must not be interpreted as128 visible source pixels. No actual native/GPU bytes
are measured by this probe. Native/API failures are not inferred from UA alone.

Public sample.draw into128×48 succeeded with all four color corners present:
`[199,17,46,255]`, `[43,209,68,255]`, `[38,58,213,255]`, `[222,203,38,255]`.
Hash773286677 is an observation, not a cross-browser pixel-equality claim.
The sample was acquired/closed1/1; iterator returned, Input disposed, Worker
terminated, errors empty. The original VIDEO_SOURCE_LIMIT was AniView's
geometry-mismatch guard, not evidence of an out-of-memory condition.

## Minimum adapter correction

The [geometry guard](../../src/video-source/sample-geometry.ts) permits a missing
native PAR adjustment only when all of these hold:

- Track explicitly declares nonsquare pixels with coherent upright display size.
- Sample visible rectangle starts at0,0 and exactly covers the coded source.
- Sample square-pixel dimensions exactly equal unadjusted source dimensions.
- Sample upright display size matches those unadjusted dimensions after rotation.
- Rotation and flip exactly match track metadata.
- Existing coded/display dimensions and area bounds remain active.

The existing public `sample.draw(context,0,0,plan.width,plan.height)` already maps
the full visible image to track-derived output geometry. The fix changes only
the adapter's decision to admit that proven shape. It adds no image, Canvas,
VideoFrame or RGBA copy and retains every source-workload/output limit. Crops,
dynamic sizes, ambiguous geometry or inconsistent metadata remain rejected.
Other distinct but proportional display geometries remain conservatively gated;
this is not a blanket relaxation for every spec-permitted native representation.

This is an AniView adapter normalization, not a fix to Mediabunny behavior.
Mediabunny remains pinned1.65.0; no upgrade/fork/vendor/source patch or production
VideoDecoder monkeypatch is used. Player, existing image decoders/encoders,
CreationSession, ConversionSession and MediaSession are unchanged. There is no
browser-name branch or new dependency. `trackParFallbackSamples` makes use of the
guarded path visible in local diagnostics.

## Verification

- 13 added guard regressions: native omission, normal PAR,90/180/270 rotation,
  flip, crop/dynamic changes, ambiguous display sizes, missing/incoherent PAR,
  invalid/oversized dimensions and rotation mismatch.
- 71 test files /889 tests passed, preserving the previous876.
- Lint, typecheck, ordinary production build and isolated candidate build passed.
- Final candidate's full57 desktop outcomes:41 success,10 cancellation,
  six expected typed rejections;189/189 Workers, active0, errors empty.
- [Native omission regression](../../tools/video-source/test-par-compat.mjs):
  real desktop decoding with a **test-only** decoder-output shim removes PAR
  display metadata, then exercises actual GIF/WebP/APNG encoders and decode-back.
  All three outputs are128×48 and match timing/barcode/corner/pixel oracles.
  Fallback observed11 samples;12/12 Workers terminated, active0, cleanupErrors0.
  This desktop shim is not Android evidence and is not shipped in the candidate.
- Trusted public HTTPS: actual AVC→APNG and VP9→WebP decode/draw/readback and
  target verification passed; no overflow at320/390/1280px,8/8 Workers closed.

The original30 frozen asset/fixture hashes were checked unchanged. The new
artifact lives separately under ignored `.tools/video-source-par-site/` and its
own preview port4232. Source code, test checkpoints and public Pages are not
interchangeable with a phone result for a particular content build.

## Targeted phone retest protocol and actual result

[New frozen candidate](https://departments-til-caps-listening.trycloudflare.com/AniView/experiments/video-source/?debug=1)

Confirm build **8d1-122e82b97f04**, Secure context true, HMR false. Use a fresh
tab per browser; wait for each group. This is a production build, not Pages.

- **Edge:** Run PAR matrix, then Run correctness. Expected12 PASS,0 cancelled.
  This covers the newly admitted PAR path's three targets and geometry regression.
- **Quark:** Run PAR matrix, Run correctness, Run1080p resize, Run150-frame test,
  Run cancel→rerun. Expected17 PASS,1 expected cancellation. The original six
  AVC/VP9 target passes remain evidence for the original build; do not mislabel
  them as rerun on the new candidate.
- Each browser: Close results, Copy summary. Report any jank/reload/crash. On
  failure stop and retain the failed case/code/stage before refreshing.

Both summaries must have no failures and final0 active source/encoder/inspector
Workers, bitmap/archive/URL, source samples/Canvas/ImageData/RGBA/ACK and cleanup
errors. A positive trackParFallbackSamples on Quark confirms the native omission
path was exercised.0 can instead mean a particular run honored PAR natively;
report the actual value rather than manufacturing a compatibility-path count.

The user exceeded the requested subsets and completed the entire seven-group
sequence on the new candidate in **both** browsers:23 PASS,1 expected cancellation,
failures empty,94/94 Workers terminated, all active resources/ACK and cleanup
errors0. Quark's fallback count11 proves the formerly failing native omission
path is now exercised successfully against all three output encoders. Edge's
fallback count0 confirms the native-correct path also passes. Peak app samples2,
canonical RGBA1; source disposition softClosed=true/hardTerminated=false.

The [normalized physical-phone evidence](milestone-8d1-android-results-2026-11-01.json)
retains both reports. PAR correction and functional/cleanup acceptance are passed.
Edge heartbeat max57.400000095ms; Quark max36674.5ms. The user explicitly confirms
Quark stayed foreground, no tens-of-seconds inability to tap/scroll, and neither
browser had visible jank. Thus the large Quark timer gap cannot be attributed
to backgrounding or silently treated as measured foreground blocking. The
original harness has only setInterval elapsed gaps, no visibility/long-task trace.
The existing export's largest-gap row is requested for localized evidence review.

Overall8D1 remains pending that responsiveness evidence classification, not PAR
or another codec rerun. Keep both candidates, main, v0.1.0 and Pages unchanged.
