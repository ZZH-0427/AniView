# M9A2 — Android RC smoke

Status: **PENDING ANDROID RC VALIDATION**, 2026-11-04.
Fresh Android Edge and Quark product sequences are required; no old milestone
acceptance is reused. Frozen validation candidate:
`a1876c6d62012a68d2764fe5e5b2e80220a9abf1`, clean source identity.
It is not a GitHub Pages deployment or public V0.2 release, and is not yet
qualified as the M9B release baseline.

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
Keep the computer on, online and awake. The production build has no HMR and
will not change during phone acceptance. The secure HTTPS tunnel serves static
code/samples only, with no upload endpoint. No selected phone media is sent.
Independent installed desktop Edge confirmed secureContext=true/HMR=false,
actual GIF→MP4/native Preview and MP4→WebP/Preview return, then active resources0
with no page exception. [HTTPS evidence](../research/v0.2-rc-https-evidence.json)
records the checks; it does not substitute for the pending Android sequences.

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
| Required continuous sequence | Pending | Pending |
| Preview and playable download | Pending | Pending |
| Language switch retains state | Pending | Pending |
| Cancel/rerun (Quark) | Not separately required | Pending |
| No unexpected freeze/reload/crash | Pending | Pending |
| Final active resources0 | Pending | Pending |

ZIP representative coverage: Pending. RC candidate qualification: Pending.
No user result is recorded yet. M9A2 is not PASSED; V0.2 is NOT RELEASED.
