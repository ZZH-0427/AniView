# Milestone 8C1 — Android validation

Status: **PENDING ANDROID VALIDATION**. Prior 8A/8B phone results do not establish
WebCodecs AVC encoding or native MP4 playback support.

New Android numeric results have now been received. Edge recorded two APNG jobs
with `WORKER_FAILED`, so the acceptance gate remains open. Do not discard those
failures because other jobs succeeded. Manual native-playback/visual observations
and the two failure rows have been requested; no full-suite rerun was requested.

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
| Actual GIF/APNG/WebP →MP4, small + medium | Successes in all formats; two APNG Worker failures unresolved; per-size confirmation pending | Successes in all formats; no recorded failures; per-size confirmation pending |
| Native video playback | Pending | Pending |
| White alpha composite / odd dimensions | Pending | Pending |
| VFR timestamps, durations, total duration | Successful jobs: maximum errors7 /7 /10µs | Successful jobs: maximum errors7 /7 /10µs |
| Encode + actual-finalizing cancel →rerun | Both cancellation flags true; manual rerun confirmation pending | Both cancellation flags true; manual rerun confirmation pending |
| Responsiveness / no reload or crash | Pending | Pending |
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

No codec, source decoder, session ownership, limits or served engineering assets
were changed in response to these logs. The next step depends on the two real
FAIL rows and the user's native-playback/visual observations. 8C1 remains
**PENDING ANDROID VALIDATION**; 8C2/8D1 have not started.

Requested reply: browser/version if convenient; small/medium three-format results;
native playback and alpha/padding appearance; both cancel→rerun results; any
stalls/reloads/crashes; one final Summary JSON per browser. Do not repeat old
8B tests. Do not mark 8C1 PASSED until this table has real evidence.
