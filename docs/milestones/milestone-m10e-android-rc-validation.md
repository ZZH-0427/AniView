# M10E — Android RC validation record

2026-11-11. **M10E: RC-READY / PASSED / CLOSED.**
Android Edge and Android Quark: **USER-CONFIRMED FUNCTIONAL PASS / CLEANUP PASS**.
The user supplied separate Home Resource Diagnostics values for this RC and
confirmed the assigned minimal flows completed without other problems. These are
new M10E confirmations, not inherited phone results. M10F remains NOT STARTED.

## Current frozen candidate

Product build source: `733df1984919e318348a88c512d68743990bdca6`, the clean
workflow-cleanup commit on `feat/v0.3-native-security-backport`.
`release-candidate.json` says sourceDirty=false, version 0.2.0 and UNLICENSED.
Later documentation commits are not the source identity of this held build.

Both Android results are attributed to this handed-off RC using the user's
confirmation and the existing immutable HTTPS build/asset evidence. Separate
device-captured build identities, on-device file hashes, browser versions and
timings were not supplied or independently verified; none is inferred here.

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

## Recorded HTTPS handoff and desktop verification

Frozen page:
<https://ctrl-subtle-where-bullet.trycloudflare.com/AniView/?debug=1&rc=733df1984919e318348a88c512d68743990bdca6>

Public synthetic sample catalog:
<https://ctrl-subtle-where-bullet.trycloudflare.com/AniView/validation/rc-v03/>

This was the temporary Cloudflare handoff for the immutable production snapshot
under /AniView/, not GitHub Pages or a release URL. Availability was checked during
preparation; this documentation-only closeout does not recheck or promise ongoing
tunnel availability. The frozen candidate and samples were held for both browsers.

[Preparation evidence](../research/m10e-android-rc-preparation-evidence.json)
records fresh lint/typecheck, 95 files / 1191 tests, production build, 20-asset native
distribution verification, real HTTPS transport and desktop browser results.
That dated preparation snapshot correctly retains its then-PENDING Android fields.
The later user evidence below closes the phone gate; desktop HTTPS results remain
separate. Runtime counters do not measure total browser/native/GPU/system memory.

## Assigned minimal Android matrix — USER-CONFIRMED PASS

The user confirmed Edge and Quark each completed the assigned A/B/C scope below.
This does not add a full codec/native negative matrix, stress run or video benchmark.
Exact optional fixture choices, per-step repetition counts and elapsed times were
not separately recorded. The rows summarize the assigned scope, not invented
per-step traces. A deliberate wrong-password attempt is separately confirmed for
Quark only; Edge's zero archive-error count is retained without inferring one.

| Sequence | Steps in each browser |
| --- | --- |
| A — Creator | Download mixed-static.zip, extract in the phone file manager, then select its static JPEG/PNG/WebP images in Create animation. Generate GIF, Animated WebP and APNG; Preview representative output(s), return, Download and confirm saved result(s) open. Return Home. Do not import the delivery ZIP directly into Creator. |
| B — Archives | Open password-mixed.zip directly in AniView; its first GIF is public, so Next reaches an encrypted item. Unlock with the public test password aniview-test; verify Viewer, navigation and return. Open either normal-rar5.rar or headers.7z, enter Viewer and return; headers.7z also uses aniview-test. Return Home. Quark's separately confirmed wrong-password step is classified below. |
| C — Lifecycle | Cancel once or replace an archive source, close/reopen and successfully read a media entry. For example, cancel the headers.7z password prompt, close the archive, reopen and unlock. Switch EN/ZH and check the password controls under the soft keyboard. Close all media/archives and return Home. |

The catalog also retains mixed.zip and normal.7z for ordinary/reopen checks.
Legacy RAR4 is optional, not an extra required matrix; its public password is
password and its text-only listing is expected. Each sample's size/SHA is in the
preparation evidence and the recorded catalog. The user's functional confirmation
reports no other problem; no separate phone timing or performance trace is claimed.

## User-supplied Home cleanup evidence

The following is a concise transcription of the separately supplied diagnostics;
it is not a newly generated device trace. Only reported fields are represented.
Created/closed pairs and application-observable ownership support CLEANUP PASS;
they do not prove complete browser/native/GPU/system memory release.

| Runtime field | Android Edge | Android Quark |
| --- | --- | --- |
| Workers created / terminated | 14 / 14 | 19 / 19 |
| Active Workers | 0 | 0 |
| Bitmaps created / closed | 2 / 2 | 6 / 6 |
| Active Bitmaps | 0 | 0 |
| Archive sessions opened / closed | 3 / 3 | 4 / 4 |
| Active archive sessions | 0 | 0 |
| Extractions started / completed | 8 / 8 | 16 / 15 |
| Extractions discarded | Not separately provided | 0 |
| Archive errors (historical count) | 0 | 1 |
| Cleanup errors | 0 | 0 |

Both separately supplied Extended Archive cleanup records report the same values:

| Extended Archive field | Edge | Quark |
| --- | --- | --- |
| Workers created / terminated | 1 / 1 | 1 / 1 |
| Active Workers | 0 | 0 |
| Active WASM instances | 0 | 0 |
| Active extraction | 0 | 0 |
| Pending access | 0 | 0 |
| Current extracted bytes | 0 | 0 |
| Active object URLs | 0 | 0 |
| Cleanup errors | 0 | 0 |
| Peak WASM bytes | 16777216 | 16777216 |
| Timeouts | 0 | 0 |

Creation cleanup in both browsers: all reported active resources are zero,
peakCanonicalRgbaFrames=1 and sourceSoftClosed=true. Individual additional field
values were not separately transcribed and are not manufactured here.

### Quark archive error classification

**USER-CONFIRMED EXPECTED NEGATIVE PASSWORD TEST.** The user explicitly confirmed
one deliberate wrong-password attempt, followed by successful correct-password
entry and completion of all assigned functional tests without another problem.
archiveErrors=1 and extractions started=16/completed=15/discarded=0 are retained
unchanged and are consistent with that expected failure attempt. There is no
independent per-request log correlation proving which extraction produced the
counter increment; no such correlation is claimed. With reported active resources
and cleanupErrors zero, this expected negative test is not an RC blocker.

| Browser | Candidate attribution | Assigned A/B/C | Cleanup | Final result |
| --- | --- | --- | --- | --- |
| Android Edge | 733df198 via user confirmation + frozen HTTPS evidence | USER-CONFIRMED PASS | USER-CONFIRMED PASS | FUNCTIONAL PASS / CLEANUP PASS |
| Android Quark | 733df198 via user confirmation + frozen HTTPS evidence | USER-CONFIRMED PASS | USER-CONFIRMED PASS | FUNCTIONAL PASS / CLEANUP PASS; expected negative password test retained |

## Historical baselines retained

S2 desktop source d31abd8: 59 assets/6,049,630 bytes, two identical clean builds;
[manifest](../research/m10e-s2-desktop-asset-manifest.json) canonical SHA256
`4874fbe6e66eed03d101a8b6a690f1c16755be02018e7f0605238b41cab459ea`.
Original audit source 86728599149381455ddbfaba7cd529ccfea11ab6: 57 assets/5,957,987
bytes; [manifest](../research/m10e-v0.3-rc-asset-manifest.json) canonical SHA256
`43b1fec144b756d03d8a9635c645dd20ac2ed0d551ab54176cc4e8ebff085ea5`.
Normalize Windows checkout CRLF to LF when verifying these documentation digests.
Old audit findings and M10C2 initial Android failures are not rewritten.

## Final closeout

**M10E — V0.3 Stability & Release Candidate Audit: RC-READY / PASSED / CLOSED.**
The user-confirmed functional/cleanup results and resolved expected-error
classification complete the phone gate for the identified RC. Existing automated,
desktop, reproducibility, native security and distribution results are retained
as prior evidence; those suites were not rerun during this documentation closeout.
Existing format/resource/solid/password/platform limitations remain accepted.

**M10F: READY FOR A SEPARATELY AUTHORIZED RELEASE TASK / NOT STARTED.**
This verdict does not change version 0.2.0 metadata or authorize a main merge,
tag, GitHub Release or production Pages deployment.
