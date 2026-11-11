# M10E — Android RC validation record

2026-11-11. **M10E: PENDING ANDROID RC VALIDATION.**
Android Edge: **PENDING**. Android Quark: **PENDING**.
New phone cleanup JSON: **NOT PROVIDED**. No previous milestone phone result is
relabeled as this RC's acceptance. M10E is not PASSED/RC-READY; M10F is NOT STARTED.

## Current frozen candidate

Product build source: `733df1984919e318348a88c512d68743990bdca6`, the clean
workflow-cleanup commit on `feat/v0.3-native-security-backport`.
`release-candidate.json` says sourceDirty=false, version 0.2.0 and UNLICENSED.
Later documentation commits are not the source identity of this held build.

[RC asset manifest](../research/m10e-android-rc-asset-manifest.json):
59 assets, 6,049,630 bytes; canonical UTF-8/LF SHA256
`bf8208541f8c26d34c119e6d67baabcd494827656bbf0ec081153332e0f0d93c`.
One new production build was executed and frozen. Compared with the S2 desktop
manifest, only release-candidate.json changes; the other 58 assets are identical.
The S2 two-build reproducibility result belongs to d31abd8, not to this new commit.

Frozen SevenZip remains 26.05 with the selected 26.06 RAR3/InBuffer security
backport and original RAR4 filename patch, built with Emscripten 6.0.13.
WASM: `f0e358b356a3f05372842be90d1023ce148bc82c268922ebf7cad4758641137c`.
JS: `19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d`.
Actual memory: 16 MiB initial / 64 MiB maximum, growth enabled, nonshared. Input 15 MiB,
selected output 4 MiB, known dictionary 4 MiB, operation 15 s and all other limits remain.
No native rebuild or runtime replacement occurs in this preparation task.

[NATIVE-SECURITY-01](../research/m10e-v0.3-security-license-audit.md#native-gate-native-security-01)
remains **CLOSED — VERIFIED BACKPORT WITH INDEPENDENT LINUX HARNESS**.
[Run 43009589916](https://github.com/ZZH-0427/AniView/actions/runs/43009589916)
and [Linux 20/20 evidence](../research/m10e-s2-linux-harness-evidence.json) are
retained. This independently built harness is not the frozen Windows product WASM.
The [S2 record](milestone-m10e-s2-native-security-backport.md) retains the original
Windows 4551/WSL checkpoints. The successful one-time workflow was subsequently
removed by authorized forward commit 733df19; its Git history, source and evidence remain.

## HTTPS handoff and desktop verification

Frozen page:
<https://ctrl-subtle-where-bullet.trycloudflare.com/AniView/?debug=1&rc=733df1984919e318348a88c512d68743990bdca6>

Public synthetic sample catalog:
<https://ctrl-subtle-where-bullet.trycloudflare.com/AniView/validation/rc-v03/>

This temporary Cloudflare tunnel serves an immutable production snapshot under
/AniView/, not GitHub Pages. The PC and tunnel must stay running and online.
An expired/unreachable URL is an access problem to report, not an Android FAIL/PASS.
Do not substitute an older milestone link. Both phone browsers must use this
same candidate; the build and samples must not change between their tests.

[Preparation evidence](../research/m10e-android-rc-preparation-evidence.json)
records fresh lint/typecheck, 95 files / 1191 tests, production build, 20-asset native
distribution verification, real HTTPS transport and desktop browser results.
The desktop HTTPS results do not constitute Android acceptance. Runtime ownership
counters do not measure total browser/native/GPU/system memory.

## Minimal Android matrix — not yet performed

Use Android Edge and Quark, each covering A/B/C. No full codec/native negative
matrix, stress run or video benchmark is requested. Only public synthetic fixtures
are required; do not provide personal files or passwords.

| Sequence | Steps in each browser |
| --- | --- |
| A — Creator | Download mixed-static.zip, extract in the phone file manager, then select its static JPEG/PNG/WebP images in Create animation. Generate GIF, Animated WebP and APNG; Preview representative output(s), return, Download and confirm saved result(s) open. Return Home. Do not import the delivery ZIP directly into Creator. |
| B — Archives | Open password-mixed.zip directly in AniView; its first GIF is public, so Next reaches an encrypted item. Try a wrong public test password, then aniview-test; verify Viewer, navigation and return. Open either normal-rar5.rar or headers.7z, enter Viewer and return; headers.7z also uses aniview-test. Return Home. |
| C — Lifecycle | Cancel once or replace an archive source, close/reopen and successfully read a media entry. For example, cancel the headers.7z password prompt, close the archive, reopen and unlock. Switch EN/ZH and check the password controls under the soft keyboard. Close all media/archives and return Home. |

The catalog also retains mixed.zip and normal.7z for ordinary/reopen checks.
Legacy RAR4 is optional, not an extra required matrix; its public password is
password and its text-only listing is expected. Each sample's size/SHA is in the
preparation evidence and the catalog. Report any exact error code/step, noticeable
stall, reload or crash, and confirm the candidate used.

## Home cleanup evidence required from each browser

After completing A/B/C, close all media/archives and return Home. Expand Resource
diagnostics → Raw JSON and copy the existing output separately for Edge and Quark.
Do not edit its values or paste personal passwords. Check fields actually present:

- Runtime activeWorkers, activeBitmaps, activeArchiveSessions and cleanupErrors.
- lastExtendedArchiveCleanup activeExtendedArchiveWorkers, activeWasmInstances,
  activeArchiveSessions, activeExtraction, pendingAccess, currentExtractedBytes,
  activeObjectUrls and cleanupErrors.
- Other present creation/archive/conversion snapshots: active Worker/Bitmap/
  Canvas/ImageData/RGBA/ACK/VideoFrame/URL ownership, pending reads and cleanupErrors.

Active/pending/current ownership values and cleanupErrors should be zero;
created/terminated and opened/closed should balance. Peak/cumulative counters
need not be zero. Deliberately wrong passwords may increase historical
archiveErrors; identify that step instead of requiring all historical errors to
be zero. Missing fields, unperformed steps and absent JSON remain unprovided.

| Browser | Candidate used | A/B/C | Home cleanup JSON | Verdict |
| --- | --- | --- | --- | --- |
| Android Edge | Not yet user-confirmed | PENDING | NOT PROVIDED | PENDING |
| Android Quark | Not yet user-confirmed | PENDING | NOT PROVIDED | PENDING |

## Historical baselines retained

S2 desktop source d31abd8: 59 assets/6,049,630 bytes, two identical clean builds;
[manifest](../research/m10e-s2-desktop-asset-manifest.json) canonical SHA256
`4874fbe6e66eed03d101a8b6a690f1c16755be02018e7f0605238b41cab459ea`.
Original audit source 86728599149381455ddbfaba7cd529ccfea11ab6: 57 assets/5,957,987
bytes; [manifest](../research/m10e-v0.3-rc-asset-manifest.json) canonical SHA256
`43b1fec144b756d03d8a9635c645dd20ac2ed0d551ab54176cc4e8ebff085ea5`.
Normalize Windows checkout CRLF to LF when verifying these documentation digests.
Old audit findings and M10C2 initial Android failures are not rewritten.

**M10E: PENDING ANDROID RC VALIDATION.** Await separate real Edge/Quark results.
No version bump, main merge, tag, Release, production Pages or M10F action occurs.
