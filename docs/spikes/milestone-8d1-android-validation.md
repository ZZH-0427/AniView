# Milestone 8D1 — Android validation

Status: **PENDING — user deferred real-phone testing for several hours.**
Date: 2026-11-01. No new Edge/Quark8D1 phone result is recorded.

## Frozen engineering candidate

- Branch: `feat/v0.2-video-to-animation`.
- Implementation `76cec92`; regression checkpoint `c8fec6b`.
- Content build: **`8d1-c8c7e145cf58`**.
- Production build, HMR false; separate engineering page, no GitHub Pages deployment.
- Main/v0.1.0/production remain unchanged. V0.2 is NOT RELEASED.
- Scope: MP4/AVC and opaque SDR8 VP9 WebM → existing GIF/WebP/APNG encoders.
- Real phone video input is not established by8A/8B/8C or desktop results.

User preference for this round is **wireless**, not USB. The unused private ADB
daemon was stopped. The preview uses normal trusted public HTTPS over a temporary
Cloudflare tunnel; it is not plain LAN HTTP, public Pages, or a permanent service.
Only built static files and named public/original fixture media are served via
GET/HEAD; POST uploads are rejected. Selected local files remain in the browser.

Entry, when the user is ready:

[Open frozen 8D1 engineering preview](https://airlines-bikes-boc-gossip.trycloudflare.com/AniView/experiments/video-source/?debug=1)

Keep the computer awake/online; phone and computer may share Wi-Fi. No cable,
custom CA installation, certificate bypass or unsafe browser flags are required.
The tunnel may need transport recovery after sleep/network loss. Such recovery
must preserve the artifact/build identity; do not change source or rebuild it
while accepting the phone results.

## What has actually been checked

Desktop Edge156 opened this HTTPS origin with a normal trusted certificate,
Secure context true, HMR false, actual AVC/VP9 Worker decode/draw/readback,
successful target decode-back, and no overflow at320/390/1280px. That is
**desktop HTTPS evidence**, not Android public-HTTPS validation.

The local57-case suite has41 successes,10 cancellations and6 expected typed
rejections; actual Android codec support, native memory symptoms, quality and
cleanup remain pending. The raw asset/fixture checksum freeze and desktop reports
are ignored artifacts under `.tools/video-source/`.

## Practical test, later — each of Android Edge and Quark

There is no need to select/download source files or understand low-level settings.
Wait for each button group to finish before starting the next. Use a fresh tab per
browser so the Summary JSON covers only this round.

1. Open the entry. Confirm **Secure context: true**, **HMR: false**, build
   **8d1-c8c7e145cf58**. If a certificate warning, inaccessible page, wrong build
   or insecure context appears, stop and report it.
2. **Run H.264 matrix**: GIF, WebP and APNG all report PASS.
3. **Run VP9 matrix**: the same three targets all report PASS. If VP9 fails, stop
   that browser and retain its failure stage; do not substitute an older result.
4. **Run correctness**: real VFR, genuine B-frame presentation order,90° rotation,
   portrait, real PAR, positive/negative origin, mid-video trim and odd tail.
   These use expected barcodes/corners and decode-back automatically.
5. **Run 1080p resize**:480/720 cases and the photographic case complete. Observe
   whether taps/scrolling remain responsive, or there is severe jank/reload/crash.
6. **Run 150-frame test**:320×240,10s at15 FPS. It must finish with150 canonical
   frames and the continuous expected visual IDs. Both browsers are the preferred
   coverage; if one cannot finish, report the actual error rather than lowering
   the limit silently.
7. **Run cancel → rerun**: the first job should cancel, then the small APNG rerun
   should PASS. A CANCELLED row here is expected, not a failure.
8. **Close results**. Copy **Summary JSON** (Copy summary button), once per browser.
   Raw long per-frame JSON is unnecessary. Report any visible jank/reload/crash,
   and optionally phone/browser versions.

Expected complete per-browser summary:20 PASS outcomes,1 cancellation,
`failures: []`, source/encoder/inspector active Workers0, active bitmaps/archives0,
active URLs0, source active samples/Canvas/ImageData/owned RGBA/ACK0,
cleanupErrors0. Native/GPU bytes remain `null/UNKNOWN`, not measured zero.
A hard-stop disposition must be reported distinctly; it is not a measured
individual-close balance.

If Copy summary is unavailable, select the Summary JSON text or use
**Export diagnostics**. That saves a local diagnostic JSON; the application
does not upload it. If a failure occurs, retain the failing row's code, stage and
capability chain (or export diagnostics) before refreshing; do not paste all
successful raw fingerprints.

Optional output visual inspection: Download last output after a chosen group and
open it with the ordinary AniView Viewer separately. This is additional evidence;
the automated marker/corner/timing oracle remains the technical test.

## Coverage record

| Gate | Android Edge | Android Quark |
| --- | --- | --- |
| Secure context / no HMR / correct frozen ID | PENDING | PENDING |
| AVC API/config/init/first decode/draw | PENDING | PENDING |
| AVC→GIF/WebP/APNG | PENDING | PENDING |
| VP9 API/config/init/first decode/draw | PENDING | PENDING |
| VP9→GIF/WebP/APNG | PENDING | PENDING |
| VFR / B-frame | PENDING | PENDING |
| Rotation / portrait / PAR | PENDING | PENDING |
| Trim/tail/origin / no-upscale | PENDING | PENDING |
| 1080p-class resize / photo quality | PENDING | PENDING |
| 150-frame workload | PENDING | PENDING |
| Cancel→rerun / stale isolation | PENDING | PENDING |
| Cleanup / repeated-use stability | PENDING | PENDING |
| Heartbeat / jank / reload / crash | NOT MEASURED | NOT MEASURED |

A VP9-only failure requires capability/config/initialization/first-frame-stage
evidence and a scope decision; no FFmpeg fallback. Any wrong B-frame/VFR visual
identity, grid/count/tail/orientation error, leak or progressive crash prevents
overall PASS. No Android gaps are silently filled from desktop.

**Milestone 8D1: PENDING ANDROID VALIDATION.**
**Milestone 8D2 has not started. V0.2 NOT RELEASED.**
