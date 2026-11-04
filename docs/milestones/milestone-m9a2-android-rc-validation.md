# M9A2 — Android RC smoke

Status: **PASSED / CLOSED**, 2026-11-04.
Fresh Android Edge and Quark product sequences passed by user report, with
final cleanup snapshots supplied; no old milestone acceptance is reused.
Accepted frozen candidate:
`a1876c6d62012a68d2764fe5e5b2e80220a9abf1`, clean source identity.
It is qualified as the sole M9B release baseline. This is not a GitHub Pages
deployment or public V0.2 release.

Page: https://conservative-decision-diamond-winner.trycloudflare.com/AniView/?debug=1

Samples (download to the phone, then choose locally in AniView):

- [Three-animation ZIP](https://conservative-decision-diamond-winner.trycloudflare.com/AniView/validation/rc/mixed.zip)
- [Small H.264 MP4](https://conservative-decision-diamond-winner.trycloudflare.com/AniView/validation/rc/small.mp4)
- [Medium H.264 MP4](https://conservative-decision-diamond-winner.trycloudflare.com/AniView/validation/rc/medium.mp4)
- Optional Creator images: [JPEG](https://conservative-decision-diamond-winner.trycloudflare.com/AniView/validation/rc/static.jpg), [PNG](https://conservative-decision-diamond-winner.trycloudflare.com/AniView/validation/rc/static.png).

The35-file manifest was verified through actual HTTPS. Six original procedural
downloads matched their local bytes. All34 non-identity build files match the
desktop-tested f606548 baseline; only release-candidate.json records the later
audit/tool/documentation commit. Both clean builds of this candidate matched
all35 files. Root is `.tools/rc-audit/site-a1876c6`, port4258; hashes are retained
in `.tools/rc-audit/frozen.json` and the committed build manifest.
The production build had no HMR and did not change during phone acceptance.
The temporary test URL requires the computer online. The secure HTTPS tunnel serves static
code/samples only, with no upload endpoint. No selected phone media is sent.
Independent installed desktop Edge confirmed secureContext=true/HMR=false,
actual GIF→MP4/native Preview and MP4→WebP/Preview return, then active resources0
with no page exception. [HTTPS evidence](../research/v0.2-rc-https-evidence.json)
records the checks separately from the now-completed Android sequences.

## Edge — one continuous sequence

Open mixed.zip's first GIF→play/pause→More/Convert animation→MP4→Convert→native Preview
and Download→Back to source→Next entry/playback→Close archive/Home. Then Convert video→small H.264 MP4→
Animated WebP→Convert→Preview/Close→Download→switch language→Home.

## Quark — one continuous sequence

Create animation→choose two small static images→Generate GIF→Preview/Close→
Download→Home. Convert video→medium MP4 (or supported VP9 WebM)→GIF→Convert→
Cancel→rerun successfully→Preview/Close→Download→switch language→Home.

The suggested Edge sequence already covers the representative ZIP gate.
If testing an ordinary animated file instead, add ZIP in either browser:
mixed.zip→animated entry/playback→Next entry→Close archive.
No technical codec/quality/workload matrices or manual frame counting required.

## Final evidence, each browser

After closing all images, archives and workspaces, expand Resource diagnostics→
Raw JSON and copy that one snapshot. Global activeWorkers/activeBitmaps/
activeArchiveSessions and last cleanup's active source/encoder/output Workers,
Samples/Canvases/ImageData/RGBA/ACK/URLs/owned VideoFrames/cleanupErrors must be0.
Report PASS/FAIL, any visible freeze/reload/crash, whether downloads open, and
which browser did ZIP. Browser version may be supplied if convenient.

| Gate | Android Edge | Android Quark |
| --- | --- | --- |
| Required continuous sequence | Pass | Pass |
| Preview and playable download | Pass | Pass |
| Language switch retains state | Pass | Pass |
| Cancel/rerun (Quark) | Not separately required | Pass:2 starts/1 cancellation/1 completion |
| No unexpected freeze/reload/crash | Pass, user reported | Pass, user reported |
| Final active resources0 | Pass | Pass |

ZIP representative coverage: **Pass in Edge**. RC candidate qualification: **PASSED**.

## Received evidence and classification

The user's confirmation was: “个流程均已通过，下载可以打开，无卡段，重载，崩溃等情况出现”.
The [complete supplied numeric snapshots](milestone-m9a2-android-rc-results-2026-11-04.json)
are archived without filenames/media. Browser versions were not provided for
this round and are not inferred from previous milestones.

| Observation | Edge | Quark |
| --- | ---: | ---: |
| Workers created/terminated |15/15|10/10|
| Active Workers/Bitmaps/ArchiveSessions |0/0/0|0/0/0|
| Archives opened/closed |1/1|0/0|
| Entry extractions started/completed |3/3|0/0|
| Active source/encoder/output-decoder Workers |0/0/0|0/0/0|
| Active Samples/Canvas/ImageData/RGBA/ACK/URLs |All0|All0|
| Cleanup errors |0|0|
| Normal source disposition |softClosed=true, hardTerminated=false|softClosed=true, hardTerminated=false|
| Last job heartbeat max/visible max |56.6ms|54.5ms|
| Hidden during job / large-gap records |false / none|false / none|

Edge also reports ownedVideoFrames0 and videoFramesBalanced=true for MP4 cleanup.
Its15 sampled/10 output WebP frames are compatible with the existing identical-
frame coalescing policy, not an incorrect-output finding. Quark reports50/50
GIF frames and a real cancellation followed by successful completion. Both
report peak canonical RGBA1/application samples2; native/GPU memory is unmeasured.
These are per-session/last-job observations, not a sum of all earlier tests.

No app-observable resource leak or unresolved RC blocker was identified.
**M9A2: PASSED.** V0.2 is qualified as a Release Candidate, not released.
M9B has not started. This closure updates evidence/documentation only.
