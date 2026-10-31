# Milestone 8C1 — Android validation

Status: **PASSED — accepted with documented limitations**. Fresh 8C1 tests, not
prior 8A/8B results, establish the observed WebCodecs AVC and native MP4 paths.

New Android numeric results have now been received. Edge recorded two APNG jobs
with `WORKER_FAILED`, initially leaving the acceptance gate open. Do not discard those
failures because other jobs succeeded. The user subsequently confirmed all
playback/visual/recovery checks were normal and localized both failures to the
**second cancellation test (held finalization)**. The original failure rows are
no longer available; do not request them again or invent their contents.

## Engineering preview

Production build, `/AniView/` subpath, no HMR, no Pages deployment. Temporary
trusted HTTPS tunnel to the isolated static preview on port 4220:

`https://cruel-tires-retire.loca.lt/AniView/experiments/video/?debug=1`

This temporary Localtunnel hostname was created on 2026-10-31 and can expire/change. The
computer and tunnel must remain running. Phone and computer need internet; the
tunnel does not require the same Wi-Fi. The HTTP LAN address is **not** the
Android WebCodecs acceptance URL. No browser-security flags or TLS exceptions.

## Required new test, separately in Android Edge and Quark

1. Open the HTTPS URL. If Localtunnel first shows **Tunnel website ahead!**,
   enter the host IP printed on that page (`114.220.203.147` for this session)
   and press **Continue**. This is the provider's visitor form, not a certificate
   exception; enter no personal credentials. In AniView check `Secure context:
   true` and `HMR: false`.
2. Press **Run capability probe**. Record API presence and exact AVC candidates;
   a supported configuration alone is not a successful encode.
3. Press **Run small**. All three source formats should complete. Play each MP4
   using its native video controls. Verify motion/frame order, white transparency
   background and smooth alpha edges on the APNG/WebP red-circle fixtures.
4. Press **Run medium** (~1MP ×4 frames for each of the three formats). Wait for
   all results; play each MP4. Observe touch response, stalls, reloads/crashes.
5. Press **Test encode cancel → rerun**, then **Test held finalization cancel →
   rerun**. Each records a cancellation followed by a successful fresh job.
   The second test holds the real MP4 finalization callback before hard-stop.
6. Press **Run odd dimensions** (319×241 →320×242). Check the complete picture
   and white right/bottom padding; it must not be cropped or stretched by export.
7. Press **Close results**; copy **Summary JSON**. All source/encoder/runtime
   Workers, active bitmaps, archives and object URLs should now be zero.

No files need be picked/downloaded. Fixtures are generated locally in the phone.
The UI retains local numeric observations only. No filenames, pixels, media
bytes, passwords, or diagnostic uploads. Native playback observations remain
manual and must be reported separately from automatic decode-back.

## Evidence table

| Check | Android Edge | Android Quark |
| --- | --- | --- |
| Trusted HTTPS / secure context / no HMR | Reported true /false | Reported true /false |
| Worker VideoEncoder + VideoFrame APIs | Reported present; real encodes completed | Reported present; real encodes completed |
| Supported exact AVC configuration | Reported supported; full chosen config not supplied | Reported supported; full chosen config not supplied |
| Actual GIF/APNG/WebP →MP4, small + medium | Confirmed normal; two failures isolated to held-finalization test | Confirmed normal; no recorded failures |
| Native video playback | User confirmed normal | User confirmed normal |
| White alpha composite / odd dimensions | User confirmed normal | User confirmed normal |
| VFR timestamps, durations, total duration | Successful jobs: maximum errors7 /7 /10µs | Successful jobs: maximum errors7 /7 /10µs |
| Encode + actual-finalizing cancel →rerun | Initial encode cancel confirmed; finalization retest3/3, no failures; historical two failures retained below | Initial encode cancel confirmed; finalization retest1/1, no failures |
| Responsiveness / no reload or crash | User confirmed normal | User confirmed normal |
| Zero cleanup/resource counters after Close | Confirmed by Summary JSON | Confirmed by Summary JSON |

## Received numeric evidence

These are user-reported real Android observations of the frozen `3c156ce` build,
not desktop emulation. Browser versions were not supplied in this reply. Counts
aggregate multiple runs/retries, rather than identifying individual workloads.

| Observation | Edge | Quark |
| --- | ---: | ---: |
| Jobs started /completed /cancelled /failed | 17 /11 /4 /2 | 17 /10 /7 /0 |
| Completed GIF /APNG /WebP jobs | 2 /3 /6 | 2 /3 /5 |
| Actual MP4 codec strings | `avc1.42000d`, `avc1.420020` | `avc1.64000d`, `avc1.640020` |
| Maximum sampled mean RGB error /p95 | 1.2446614583 /2 | 0.7604166667 /2 |
| Maximum encodeQueueSize /owned VideoFrames | 2 /1 | 2 /1 |
| Owned frames balanced /active frames | true /0 | true /0 |
| Visible heartbeat maximum gap | 38ms | 60.7ms |
| Workers created /terminated | 48 /48 | 44 /44 |
| Active decoder /encoder /runtime Workers | 0 /0 /0 | 0 /0 /0 |
| Active bitmaps /archives /object URLs | 0 /0 /0 | 0 /0 /0 |
| Decoder /cleanup errors | 0 /0 | 0 /0 |

Edge's failure list is exactly two `{source:"apng",error:"WORKER_FAILED"}` rows.
These are transport-level categories, not evidence of an unsupported H.264
configuration. The summary lacks failing phase, size, request/event detail, and
last accepted frame. It cannot distinguish a Worker-script fetch failure, Worker
crash/message failure, timeout or harness interaction. Zero decoderErrors alone
does not identify the cause. The provider previously returned transient408s;
that is a hypothesis to investigate, not an established Android root cause.

## Focused follow-up without changing the phone build

The accepted artifact hashes were preserved. Installed desktop Edge repeated the
exact APNG small/medium/odd cases three times each: **9/9 successful**, followed
by both actual button-driven cancellation→WebP reruns succeeding. All resources
cleared. This does not dismiss or reproduce the Android failures.

A separate loopback-only proxy intentionally returned408 for the fixture Worker,
then for the video Worker. Each produced `WORKER_FAILED`, zero decoderErrors,
null last accepted metrics and complete cleanup; removing each injected fault
allowed the same APNG job to succeed. This demonstrates the generic error can
have an infrastructure cause, **not** that the actual phone failures did.
Controlled artifacts stay ignored under `.tools/video/worker-load-control/`.

This first follow-up did not change codec policy, source decoders, session
ownership, limits or served engineering assets. The user's later clarification
is recorded above. At that point 8C1 remained pending; 8C2/8D1 had not started.

## Targeted diagnostic preview — `finalize-trace-1`

Original files at the original URL remain byte-identical to their accepted hash
manifest. A separate production build is served under `/AniView/followup/`:

`https://cruel-tires-retire.loca.lt/AniView/followup/experiments/video/index.html?debug=1`

This adds only local failure evidence: job/phase, Worker role and module boot
marker, active request operation/id/elapsed time, accepted-frame count, and
native-flush/mux stage. It preserves the original120s request timeout, cancellation
mechanism, codecs, frame ownership and limits. Source decoders, Player,
MediaSession and CreationSession are unchanged. Diagnostic callbacks are optional
and exceptions cannot alter transport cleanup or encoding. No exception text,
filenames, URLs or media are included. Failure JSON may show numeric response
statuses for known static Worker resources when the browser exposes them;
missing/zero status is not proof of an HTTP failure. No automatic retry hides
failures and no diagnostics are uploaded or persisted.

New controls in installed desktop Edge prove:

- Small and medium each succeed through all three source formats.
- Three actual held-finalization cancellations occur after20 accepted frames,
  at `phase:held-finalizing`, `finalizePhase:mux-finalizing`, followed by successful
  WebP reruns. Resources return to zero.
- Intentionally refusing the fixture or held-encoder script identifies that
  role with `error-event`, `moduleBooted:false`, zero accepted frames.
- A separate test deliberately suppresses the held marker and accelerates the
  **lab-only** timeout to1s. It reports `request-timeout`, `operation:finish`,
  `moduleBooted:true`,20 accepted frames, `finalizePhase:mux-finalizing`, and cleans
  up. This is an injected control, not a reproduction of the phone cause.

802 unit tests in64 files pass (750 original +52 new); lint, typecheck, ordinary
and separate production builds pass. The separate HTTPS page was independently
checked with normal certificate validation, real encoding/readback/native
playback and zero application errors. These observations do not settle the
historical Edge failures.

Requested focused reply: in **Edge**, press **Test held finalization cancel →
rerun** three times, waiting for the automatic WebP result/PASS before each next
press. In **Quark**, one run verifies the diagnostic build. No small/medium/odd
or other earlier acceptance needs repeating. On any FAIL, copy **Failure JSON**
immediately and stop that browser's repeat; otherwise Close results and copy
Summary JSON. The summary must identify `diagnosticVersion:finalize-trace-1`.
The request above is retained as the test protocol; completed results follow.

## Completed focused Android results and acceptance

The user reports **Edge3/3 and Quark1/1 passed** on the separate frozen
`finalize-trace-1` production build (`cbf6fec`). Counts match the requested single
button path exactly: Edge6 jobs =3 cancellations +3 completed WebP reruns; Quark2
jobs =1 cancellation +1 completed rerun. Both report no failures. The false
`encodeCancelled` field in these focused summaries is expected: this page did
not rerun the first cancellation test; that gate was already confirmed in the
original full test on both browsers.

| Focused observation | Edge | Quark |
| --- | ---: | ---: |
| Held-finalization cancel →rerun attempts | 3/3 pass | 1/1 pass |
| Jobs /completed /cancelled /failed | 6 /3 /3 /0 | 2 /1 /1 /0 |
| secureContext /HMR /API /configSupported | true /false /true /true | true /false /true /true |
| Actual rerun MP4 codec | `avc1.42000d` | `avc1.64000d` |
| Finalizing cancellation observed | true | true |
| Timestamp /frame-duration /total-duration max error | 7 /7 /10µs | 7 /7 /10µs |
| Sampled mean RGB error max /p95 | 0.1993489583 /0 | 0.3364583333 /1 |
| Encode queue /owned-frame peak | 2 /1 | 2 /1 |
| Owned frames balanced /active | true /0 | true /0 |
| Visible heartbeat maximum gap | 24.6ms | 23.4ms |
| Workers created /terminated | 18 /18 | 6 /6 |
| Active decoder /encoder /runtime Workers | 0 /0 /0 | 0 /0 /0 |
| Active bitmaps /archives /object URLs /cleanup errors | 0 /0 /0 /0 | 0 /0 /0 /0 |

Exact compact user-reported summaries:

```json
{"diagnosticVersion":"finalize-trace-1","secureContext":true,"hmr":false,"apiPresent":true,"configSupported":true,"sources":{"gif":0,"apng":0,"webp":3},"codecs":["avc1.42000d"],"jobsStarted":6,"jobsCompleted":3,"cancellations":3,"activeDecoderWorkers":0,"activeEncoderWorkers":0,"cleanupErrors":0,"activeObjectUrls":0,"failures":[],"encodeCancelled":false,"finalizingCancelled":true,"maxTimestampErrorUs":7,"maxDurationErrorUs":7,"maxTotalDurationErrorUs":10,"meanRgbErrorMax":0.19934895833333333,"p95RgbErrorMax":0,"maxEncodeQueue":2,"ownedVideoFramesActive":0,"ownedFramesBalanced":true,"peakOwnedVideoFrames":1,"heartbeatMaxGapMs":24.600000023841858,"resources":{"workersCreated":18,"workersTerminated":18,"activeWorkers":0,"peakWorkers":2,"bitmapsCreated":0,"bitmapsClosed":0,"activeBitmaps":0,"peakBitmaps":0,"archiveSessionsOpened":0,"archiveSessionsClosed":0,"activeArchiveSessions":0,"entryExtractionsStarted":0,"entryExtractionsCompleted":0,"entryExtractionsDiscarded":0,"staleResultsDiscarded":0,"decoderErrors":0,"staticDecodeErrors":0,"archiveErrors":0,"cleanupErrors":0}}
```

```json
{"diagnosticVersion":"finalize-trace-1","secureContext":true,"hmr":false,"apiPresent":true,"configSupported":true,"sources":{"gif":0,"apng":0,"webp":1},"codecs":["avc1.64000d"],"jobsStarted":2,"jobsCompleted":1,"cancellations":1,"activeDecoderWorkers":0,"activeEncoderWorkers":0,"cleanupErrors":0,"activeObjectUrls":0,"failures":[],"encodeCancelled":false,"finalizingCancelled":true,"maxTimestampErrorUs":7,"maxDurationErrorUs":7,"maxTotalDurationErrorUs":10,"meanRgbErrorMax":0.33645833333333336,"p95RgbErrorMax":1,"maxEncodeQueue":2,"ownedVideoFramesActive":0,"ownedFramesBalanced":true,"peakOwnedVideoFrames":1,"heartbeatMaxGapMs":23.399999976158142,"resources":{"workersCreated":6,"workersTerminated":6,"activeWorkers":0,"peakWorkers":2,"bitmapsCreated":0,"bitmapsClosed":0,"activeBitmaps":0,"peakBitmaps":0,"archiveSessionsOpened":0,"archiveSessionsClosed":0,"activeArchiveSessions":0,"entryExtractionsStarted":0,"entryExtractionsCompleted":0,"entryExtractionsDiscarded":0,"staleResultsDiscarded":0,"decoderErrors":0,"staticDecodeErrors":0,"archiveErrors":0,"cleanupErrors":0}}
```

Combined with the complete three-format small/medium, native playback,
alpha/padding, initial cancellation and recovery checks already confirmed by the
user, this satisfies the fresh Android acceptance gate. Browser versions and
process/GPU memory were not measured in these replies. The original two Edge
Worker failures remain historical **not reproduced / root cause unconfirmed**;
the lost details do not support claiming a codec bug, an infrastructure cause,
or a bug fix. Diagnostic-only revisions did not establish a corrective fix.
Their successful repeated cancellation/rerun path and zero leaks are the closure
evidence; retain the incident as a productization risk if it recurs.

**Milestone 8C1: PASSED.** The technical architecture is accepted with documented
limits for productization. 8C2 and8D1 have not started. The temporary preview and
tunnel are closed after recording these completed phone results; the URLs above
are historical test origins, not product endpoints or promised live services.
