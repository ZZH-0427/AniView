# Milestone 8D1 — Android validation

Status: **FUNCTIONAL/CLEANUP PASS — Quark foreground timer anomaly review pending.**
Date: 2026-11-01. Results below are user-reported physical Android browser runs,
not remotely observed phone sessions.

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

[Open frozen 8D1 engineering preview](https://internal-wanna-lopez-natural.trycloudflare.com/AniView/experiments/video-source/?debug=1)

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
rejections. Android results are recorded separately below. The asset/fixture checksum freeze and desktop reports
are ignored artifacts under `.tools/video-source/`.

## First Android results

Both summaries identify content build8d1-c8c7e145cf58, secure context true,
HMR false. Edge155 completed all groups; Quark10.2.0.995 / Chromium123 on Android16
stopped on par.mp4→APNG in Run correctness, then did not run the final three groups.

| Evidence | Edge | Quark |
| --- | --- | --- |
| Successful rows | 21 (benchmark appears twice) | 10 |
| Cancelled rows | 1 | 0 |
| Failure | None | VIDEO_SOURCE_LIMIT / probing / par.mp4→APNG |
| Workers created / terminated | 86 / 86 | 41 / 41 |
| Peak app samples / canonical RGBA | 2 / 1 | 2 / 1 |
| Maximum observed source samples | 151 | 21 |
| Maximum observed source pixels | 12,441,600 | 6,220,800 |
| Maximum heartbeat gap | 71.3ms | 48.3ms |
| Final active Worker / bitmap / archive / URL | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Final source sample / Canvas / ImageData / RGBA / ACK | All0 | All0 |
| cleanupErrors | 0 | 0 |
| Source disposition | softClosed=true, hardTerminated=false | softClosed=true, hardTerminated=false |
| Native/GPU memory | UNKNOWN | UNKNOWN |

Edge's extra successful benchmark row is a repeat, not a missing case. Quark's
six AVC/VP9 conversions and first four correctness cases (VFR, B-frame, rotation,
portrait) passed. No aggregate success is inferred for cases after its PAR failure.

The follow-up now confirms native PAR loss: requested/supported display128×48,
but native decoder callback and library sample both display64×48. Their aspect
ratios differ, so a harmless proportional representation is ruled out. The
separate Canvas→VideoFrame constructor preserves128×48. Sample close1/1,
iterator return, Input disposal and Worker termination all succeeded. The
original source-limit error was the adapter's geometry mismatch guard, not
evidence of memory exhaustion. See the [root cause and guarded adapter fix](milestone-8d1-quark-par-followup.md).

### Isolated follow-up — par-geometry-1

[Separate one-frame numeric probe](https://internal-wanna-lopez-natural.trycloudflare.com/AniView/par-followup/index.html)

**Completed in Quark.** Original probe instructions were: Run PAR probe once, then Copy JSON. Edge was optional for a
same-device comparison. This reads only the original named tiny PAR fixture.
It records track/config, first native decoder frame, yielded library sample,
display ratio and Canvas→VideoFrame display-size preservation. A diagnostic
VideoDecoder subclass observes geometry without altering config or frame content.
Public sample.draw produces only numeric corner/hash evidence; no pixels are
posted to the main thread or uploaded. The native frame stays library-owned;
sample close, iterator return, Input dispose and Worker termination are recorded.

`tools/video-source/par-geometry-probe.mjs` builds only a separate follow-up
directory; the original frozen candidate and its30 checksums stay unchanged.
Desktop Edge156 trusted-HTTPS verification passed. It is not Quark evidence.
Classification and the adapter-only correction are recorded in the linked
follow-up. No Mediabunny source/behavior patch, dependency change or resource-limit
increase was necessary. Native decoder config support alone remains insufficient.

## Current candidate — phone functional/cleanup results received

Build **8d1-122e82b97f04** is separate from the unchanged original artifact.
It permits only a complete, unadjusted native frame with explicit coherent
track PAR; existing public draw maps it to track-derived output dimensions.
All other ambiguous size/crop mismatches remain rejected.

[Targeted retest entry](https://departments-til-caps-listening.trycloudflare.com/AniView/experiments/video-source/?debug=1)

- Edge: Run PAR matrix → Run correctness → Close results → Copy summary.
  Expected12 PASS,0 cancellation, failures empty.
- Quark: Run PAR matrix → Run correctness → Run1080p resize → Run150-frame test
  → Run cancel→rerun → Close results → Copy summary.
  Expected17 PASS,1 cancellation, failures empty.

The user ran **all seven groups** on both browsers, not just these requested
subsets. Both new summaries have23 PASS,1 cancellation and no failures. Both
report94/94 Workers, final0 active resources/URL/sample/Canvas/ImageData/RGBA/ACK,
cleanupErrors0, and confirmed soft close. Quark's trackParFallbackSamples11 and
Edge's0 distinguish exercised native-omission and native-correct paths. Both
have peak2 app samples/1 canonical RGBA; native/GPU memory remains UNKNOWN.
The [normalized reports](milestone-8d1-android-results-2026-11-01.json) bind these
observations to the new content build. No prior-candidate coverage is substituted.

### Remaining timing anomaly

Edge's heartbeat max is57.400000095ms; Quark's is36674.5ms. The user confirms
Quark remained foreground with no tens-of-seconds inability to click/scroll and
no visible jank in either browser. Backgrounding is not an accepted explanation.
The harness measures setInterval callback gaps across conversion and decode-back,
not a PerformanceLongTask trace; Summary contains no per-row timing context.
No diagnosis of browser throttling, clock anomaly or actual UI blocking is yet
established. Only the largest-gap rows of the existing export are needed next.

[Local existing-export reader](https://departments-til-caps-listening.trycloudflare.com/AniView/heartbeat-readback/index.html)

Keep the original Quark test tab. Click **Export diagnostics**, then open the
reader and select that downloaded JSON; **Copy short JSON**. It parses in one
Worker, has an8MiB cap, emits only bounded numeric case/timing fields and uses no
upload/persistence or new conversion. The candidate is unchanged. Desktop HTTPS
checks passed with real57-case export, invalid JSON, oversize rejection and a
synthetic large-gap ordering example; the synthetic row is not phone evidence.

## Original full protocol — each of Android Edge and Quark

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

## Current coverage record — build8d1-122e82b97f04

| Gate | Android Edge | Android Quark |
| --- | --- | --- |
| Secure context / no HMR / correct frozen ID | PASS | PASS |
| AVC API/config/init/first decode/draw | PASS | PASS |
| AVC→GIF/WebP/APNG | PASS | PASS |
| VP9 API/config/init/first decode/draw | PASS | PASS |
| VP9→GIF/WebP/APNG | PASS | PASS |
| VFR / B-frame | PASS | PASS |
| Rotation / portrait / PAR | PASS | PASS; native omission path observed11 samples |
| Trim/tail/origin / no-upscale | PASS | PASS |
| 1080p-class resize / photo quality oracle | PASS | PASS |
| 150-frame workload | PASS | PASS |
| Cancel→rerun / stale isolation | PASS | PASS |
| Cleanup / repeated-use stability | PASS;94/94 Workers | PASS;94/94 Workers |
| Heartbeat / visible jank | 57.4ms; no visible jank | 36674.5ms; user reports foreground/no visible jank; timing review pending |

A VP9-only failure requires capability/config/initialization/first-frame-stage
evidence and a scope decision; no FFmpeg fallback. Any wrong B-frame/VFR visual
identity, grid/count/tail/orientation error, leak or progressive crash prevents
overall PASS. No Android gaps are silently filled from desktop.

**Milestone 8D1: PENDING TIMING-ANOMALY CLASSIFICATION. Functional and cleanup gates passed.**
**Milestone 8D2 has not started. V0.2 NOT RELEASED.**
