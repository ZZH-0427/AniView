# Milestone 8C1 — Android validation

Status: **PENDING ANDROID VALIDATION**. Prior 8A/8B phone results do not establish
WebCodecs AVC encoding or native MP4 playback support.

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
| Trusted HTTPS / secure context / no HMR | Pending | Pending |
| Worker VideoEncoder + VideoFrame APIs | Pending | Pending |
| Supported exact AVC configuration | Pending | Pending |
| Actual GIF/APNG/WebP →MP4, small + medium | Pending | Pending |
| Native video playback | Pending | Pending |
| White alpha composite / odd dimensions | Pending | Pending |
| VFR timestamps, durations, total duration | Pending | Pending |
| Encode + actual-finalizing cancel →rerun | Pending | Pending |
| Responsiveness / no reload or crash | Pending | Pending |
| Zero cleanup/resource counters after Close | Pending | Pending |

Requested reply: browser/version if convenient; small/medium three-format results;
native playback and alpha/padding appearance; both cancel→rerun results; any
stalls/reloads/crashes; one final Summary JSON per browser. Do not repeat old
8B tests. Do not mark 8C1 PASSED until this table has real evidence.
