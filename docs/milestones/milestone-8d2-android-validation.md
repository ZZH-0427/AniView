# Milestone 8D2 — Android product validation

Status: **PASSED**,2026-11-01: user-reported fresh Android Edge/Quark product
acceptance, including separate after-Home resource snapshots. Accepted candidate:
`455556891da173a8a8735dcd98cfa68c46a5f798` on feat/v0.2-video-to-animation.
No implementation/build changed during acceptance; subsequent closure is docs-only.

## Evidence boundary and environment

This is a normal **production build without HMR**, under/AniView/, served via
trusted temporary public HTTPS. Not GitHub Pages and not USB loopback. User
prefers wireless. The temporary endpoint was
`https://die-get-press-asbestos.trycloudflare.com/AniView/?debug=1`.
No certificate bypass or
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

## Executed lightweight protocol — each of Android Edge and Quark

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

The user confirmed all tests passed, repeat downloads were retained/available,
and no jank or similar problems occurred, and supplied both short objects for
each browser. An open workspace normally owns one source
URL and one successful result URL;0 URLs is required after Home, not while retained.

## Cleanup gate

After Home all must be0: activeVideoSourceWorkers, activeEncoderWorkers,
activeOutputDecoderWorkers, activeSamples, activeCanvases, activeImageData,
ownedRgba, awaitingAck, activeObjectUrls, cleanupErrors. Global active Workers,
bitmaps and archive sessions also0. Preserve soft/hard-close evidence honestly.
No source filename, full path, bytes or pixels belong in diagnostic replies.

## Supplied results and interpretation

The [normalized original numeric snapshots](milestone-8d2-android-results-2026-11-01.json)
retain each successful-result and after-Home object. This is user-operated
physical-phone evidence, not an automated phone trace or reused8D1 result.

| Last reported job | Edge | Quark |
| --- | --- | --- |
| Target | GIF | Animated WebP |
| Started / completed / cancelled |9 /8 /1 |8 /7 /1 |
| Source display |320×240 |320×240 |
| Selection |0…5s,10FPS |0…5s,15FPS |
| Planned / sampled / actual output frames |50 /50 /50 |75 /75 /75 |
| Output frame-pixel workload |3,840,000 |5,760,000 |
| Observed source samples / pixels |76 /5,836,800 |76 /5,836,800 |
| Peak app samples / canonical RGBA |2 /1 |2 /1 |
| Last-job raw / visible heartbeat gap |52.3000000715ms |55.1000000238ms |
| Hidden during last job / >1s gap records |false /[] |false /[] |
| Source disposition |softClosed true /hardTerminated false |softClosed true /hardTerminated false |
| URLs while retaining source and result |2 |2 |
| After-Home Workers created / terminated |52 /52 |46 /46 |
| After-Home active Workers/bitmaps/archives |0 /0 /0 |0 /0 /0 |
| After-Home session resources/URLs/ACK/errors |All0 |All0 |

Both success objects already have0 live source/encoder/output decoder Workers,
samples/Canvas/ImageData/RGBA/ACK and cleanup errors. Their two URLs are expected:
one native source preview and one retained result. Separate after-Home snapshots
prove both were revoked. The counters belong to distinct sessions and are not
summed into an invented browser-wide total. Edge's extra completed job is not
a failure or missing coverage.

The supplied last jobs use a square-pixel source, so their PAR fallback0 does
not reveal whether a preceding PAR job needed the compatibility branch. The
user's complete-protocol confirmation supplies8D2 native preview/estimate/output
PAR acceptance;8D1's separately recorded fallback11 remains inherited technical
evidence. No8D2 per-PAR fallback number is fabricated. Similarly, no individual
direction timings/bytes or fresh browser versions/model were supplied. The
heartbeat values above are last-job observations, not whole-suite maxima.

## Coverage — passed by fresh product confirmation and supplied snapshots

| Product gate | Edge | Quark |
| --- | --- | --- |
| Native source preview / trim / FPS | PASS | PASS |
| H.264→GIF/WebP/APNG | PASS | PASS |
| VP9→representative WebP | PASS | PASS |
| Size change / no-upscale | PASS | PASS |
| PAR product proportions / displayed and output dimensions | PASS | PASS |
| Preflight over-limit advice | PASS via overall protocol confirmation; one browser required, not individually attributed | Same shared gate |
| Cancel→rerun | PASS; cancellation+success recorded | PASS; cancellation+success recorded |
| AniView Preview→Back preserves result | PASS | PASS |
| Two distinct retained/playable downloads | PASS | PASS |
| Replacement / Home cleanup | PASS; numeric snapshot | PASS; numeric snapshot |
| Response / reload / crash | No problems reported | No problems reported |

QQ remains optional/not tested. Independent270°/flip phone fixtures, full VFR/
B-frame/stress/source-rejection campaigns were not repeated and were not part of
the lightweight8D2 phone gate. Core technical evidence stays in8D1. Native/GPU
memory is still UNKNOWN. The precise browser used for the shared over-limit step
was not individually identified; the user confirmed the complete requested
protocol and existing exact boundary tests remain passed. No additional phone
rerun is needed to close this declared scope.

**Milestone8D2: PASSED / CLOSED.** Core V0.2 conversion features are complete on
the feature branch. **V0.2 NOT RELEASED**: no main merge/tag/release/Pages deployment
or stability/release-preparation work is initiated by this closure.
