# M9A2 — Android RC smoke

Status: **PENDING ANDROID RC VALIDATION**, 2026-11-04.
Fresh Android Edge and Quark product sequences are required; no old milestone
acceptance is reused. Production/no-HMR secure preview candidate and access URL
will be recorded after desktop evidence is committed and the build is frozen.
It is not a GitHub Pages deployment or public V0.2 release.

## Edge — one continuous sequence

Open sample GIF/APNG→play/pause→More/Convert animation→MP4→Convert→native Preview
and Download→Back to source→Close/Home. Then Convert video→small H.264 MP4→
Animated WebP→Convert→Preview/Close→Download→switch language→Home.

## Quark — one continuous sequence

Create animation→choose two small static images→Generate GIF→Preview/Close→
Download→Home. Convert video→medium MP4 (or supported VP9 WebM)→GIF→Convert→
Cancel→rerun successfully→Preview/Close→Download→switch language→Home.

One browser also opens mixed.zip→animated entry/playback→Next entry→Close archive.
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
