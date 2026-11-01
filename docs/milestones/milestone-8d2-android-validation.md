# Milestone 8D2 — Android product validation

Status: **PENDING ANDROID VALIDATION**,2026-11-01. No8D2 phone result is recorded.
Candidate comes from feat/v0.2-video-to-animation after desktop implementation,
tests and product browser validation. The exact frozen commit/HTTPS URL is supplied
with the test request and retained in ignored local freeze metadata.

## Evidence boundary and environment

This is a normal **production build without HMR**, under/AniView/, served via
trusted temporary public HTTPS. Not GitHub Pages and not USB loopback. User
prefers wireless. Keep the computer awake/online. No certificate bypass or
selected-media upload. The static preview has a named synthetic fixture allowlist,
GET/HEAD only; samples and downloads remain ignored artifacts, not production.

8D1 passed both browsers' codec/sampling/PAR/150-frame/cleanup technical matrix.
That is inherited evidence, not these new product steps. The prior36.7s Quark
timer gap was closed by user confirmation of no actual jank/test interruption;
retain raw values and context rather than infer main-thread stalls.8D2 diagnostics
add bounded raw/visible/wall-clock/hidden context. Do not repeat full technical
stress or all cancellation phases unless the product reveals a new failure.

## Download helpers

The dedicated preview exposes/AniView/validation/video-animation/:

| Download | Use |
| --- | --- |
| small.mp4 | H.264,64×48,1.2s, trim/FPS/three targets |
| vp9.webm | VP9 representative conversion |
| par.mp4 | coded64×48/display128×48; Quark compatibility |
| landscape.mp4 |1920×1080,1.2s; actual480→360/720 size change |
| medium.mp4 |320×240,~10s; default5s clip for Cancel/rerun and frame preflight |
| rotation.mp4 |90° orientation alternative |

These are inherited original8D1 synthetic sources delivered for product testing;
they are not new decoder research or user media.

## Each of Android Edge and Quark

1. Home → **Convert video** → choose small.mp4. Native Play/Pause/seek,
   Set Start/End or numeric fields: use nonzero start0.200 and end1.000 seconds.
   Select GIF, FPS10; note preflight sampled frames/output size, Convert.
2. Check actual result dimensions/duration/frames/Loop forever. Preview using
   AniView Play/Pause, Close back to the same result. Download twice; both distinct
   names must remain and both files must open. Downloads/Files is sufficient;
   Gallery indexing is not an AniView guarantee.
3. Choose Animated WebP, FPS15 (observe estimate change), Convert/Preview/back.
   Choose APNG, Convert/Preview/back. All3 H.264 targets must succeed.
4. Choose landscape.mp4, change output480→360 or720 and convert once; check actual
   planned/result dimensions. Choose vp9.webm and convert to WebP once.
5. Choose par.mp4 (especially Quark); native visual proportions, displayed128×48,
   preflight/output128×48 must agree. Convert to any one target and Preview.
6. Choose medium.mp4, leave a moderate/default5s clip. Convert → immediately
   Cancel → same-settings Convert again succeeds. No need to catch Finalizing.
7. At least one browser: medium.mp4, Animated WebP/FPS30/end5.100 yields153 sampled frames;
   Convert must be disabled with a reduce-duration/FPS message. Restore end5/FPS15.
8. Choosing these replacement sources also tests A→B cleanup; check a successful
   old result does not remain attached to a new video. Picker cancellation should
   preserve the current source/result.
9. After success copy **Video conversion diagnostics → Summary JSON**, once per
   browser. Then Home and copy Resource diagnostics → Raw JSON's
   **lastVideoAnimationCleanup**, plus global activeWorkers/Bitmaps/ArchiveSessions.

Report each browser's results, any jank/reload/crash, retained/playable downloads,
and the two short diagnostic objects. An open workspace normally owns one source
URL and one successful result URL;0 URLs is required after Home, not while retained.

## Cleanup gate

After Home all must be0: activeVideoSourceWorkers, activeEncoderWorkers,
activeOutputDecoderWorkers, activeSamples, activeCanvases, activeImageData,
ownedRgba, awaitingAck, activeObjectUrls, cleanupErrors. Global active Workers,
bitmaps and archive sessions also0. Preserve soft/hard-close evidence honestly.
No source filename, full path, bytes or pixels belong in diagnostic replies.

## Coverage, pending

| Product gate | Edge | Quark |
| --- | --- | --- |
| Native source preview / trim / FPS | PENDING | PENDING |
| H.264→GIF/WebP/APNG | PENDING | PENDING |
| VP9→representative WebP | PENDING | PENDING |
| Size change / no-upscale | PENDING | PENDING |
| Rotation/PAR, especially Quark | PENDING | PENDING |
| Preflight over-limit advice | PENDING (one browser required) | PENDING (one browser required) |
| Cancel→rerun | PENDING | PENDING |
| AniView Preview→Back preserves result | PENDING | PENDING |
| Two distinct retained/playable downloads | PENDING | PENDING |
| Replacement / Home cleanup | PENDING | PENDING |
| Response / reload / crash | NOT MEASURED | NOT MEASURED |

QQ is optional and not yet tested. No phone results or final feature-complete/
release decision can be inferred from desktop passes.

**Milestone8D2: PENDING ANDROID VALIDATION. V0.2 NOT RELEASED.**
