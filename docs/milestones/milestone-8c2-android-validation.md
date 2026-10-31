# Milestone 8C2 — Android product validation

Status: **CLOSED BY USER WAIVER, 2026-10-31**.
This is not a completed Android test pass. Edge: no complete 8C2 acceptance result
recorded. Quark: testing interrupted by an inaccessible preview. QQ: not tested.

The user explicitly ended further testing and asked to mark acceptance passed.
The milestone is therefore accepted with its fresh Android gate waived by the
user. Existing desktop passes remain valid; no phone pass, download verification,
cleanup result or browser compatibility finding is invented from this decision.

After the forced PC shutdown, the same frozen candidate `31813b2` was restored
and independently checked over HTTPS on desktop. During the later outage, local
preview returned HTTP 200 while the external HTTPS connection reset (ECONNRESET),
including a replacement hostname. Quark reported “页面无法访问”. The underlying
network/provider cause was not established; this does not prove an application
conversion defect or complete its phone acceptance. Temporary services were
stopped at the user's instruction; the following URLs/checklist are historical.

This gate concerns actual product controls, native Preview, saved files and source
preservation. Prior 8C1 engineering acceptance does not replace it. Do not repeat
the 8C1 stress matrix or manually chase finalization on a phone; desktop tests
exercise Cancel/Back during actual held native mux finalization.

## Candidate and delivery

Branch: `feat/v0.2-animation-to-video`. Ordinary production build under
`/AniView/`, no HMR, served through temporary trusted HTTPS. The build/server are
frozen during acceptance. The current URL accompanies the test request because
temporary hostnames expire. This is not GitHub Pages. Only static application
files and generated samples pass through the tunnel; media processing stays on
the phone, with no selected-media upload.

Prepared 2026-10-31: `https://fifty-taxis-do.loca.lt/AniView/?debug=1`.
Installed desktop Edge independently verified trusted HTTPS, secure context,
actual APNG→MP4 product conversion, native Play/Pause and cleanup at that URL.
No certificate bypass; the provider's normal visitor form was completed.
No application script/Worker error occurred. This is not Android evidence.
The product suite covers seven cases/eight additional checks, a maximum observed
16ms heartbeat gap of 17.8ms, and 99/99 Workers terminated on full close.

Candidate bundle bytes (raw / gzip; `check-build.mjs`, not transfer claims):

| Artifact | Bytes | Gzip bytes |
| --- | ---: | ---: |
| Ordinary entry | 291,867 | 88,529 |
| Conversion UI | 28,673 | 8,768 |
| MP4 lazy runtime | 3,910 | 1,648 |
| Native video preview | 728 | 456 |
| Video Worker including Mediabunny | 300,564 | 77,663 |

Ordinary entry baseline was 291,139 / 88,248 (+728 / +281 bytes); the added
debug-only cleanup snapshot has no heavy runtime import. The retained 8C1
standalone Mediabunny API probe was 279,614 / 73,445 bytes; that is historical
isolation evidence, not a separately fetched product chunk. Startup and opening
conversion before Convert were checked to request no MP4 runtime/video Worker.

Samples under `/AniView/validation/mp4/`:

- `small.zip`: GIF/APNG/WebP, 320×240, 10 frames each, VFR and finite play count;
  APNG/WebP include soft alpha.
- `medium.zip`: three formats, 960×720, 10 frames each.
- `odd.zip`: APNG 319×241; expected MP4 320×242.

These ignored, locally generated artifacts are not committed or deployed to
Pages. Phone preview serves only named samples, not held Workers/workspace files.

## Lightweight acceptance, each browser

1. Open small.zip via Open ZIP. For GIF/APNG/WebP use More → Convert animation →
   MP4 → Convert. Check result dimensions/duration/bytes/H.264. Preview with native
   Play/Pause/seek; Back preserves result. Back to source and Next File still work.
2. Check transparent APNG/WebP in each browser: white background, no gross edge/
   order/disposal error. Lossy encoding can alter fine colors.
3. Download one result twice; distinct `.mp4` names, both retained and playable
   from Downloads/Files. Gallery indexing is browser/OS-controlled.
4. Open medium.zip, convert one entry, Cancel once then Convert successfully.
   No need to catch Finalizing or test 200-frame extremes.
5. In either browser convert odd.zip: 320×242 plus padding note, full picture,
   white right/bottom padding without stretch/crop.
6. Copy Conversion diagnostics → Summary JSON after success. Back and Close all
   media/ZIPs. Runtime Raw JSON should show activeWorkers/activeBitmaps/
   activeArchiveSessions zero, and lastConversionCleanup zero activeVideoWorkers/
   activeDecoderWorkers/activeEncoderWorkers/ownedVideoFrames/activeObjectUrls/
   cleanupErrors. Copy only that short numeric cleanup portion.

Report per browser: three directions, controls/Back, white alpha, both downloads
playable, medium Cancel→rerun, source/ZIP preservation, responsiveness and any
reload/crash. Include short Summary JSON and cleanup fields, never media/filenames.
A new product Worker failure requires investigation; report code/stage and stop.

The original fresh-Android gate above was waived by the user's later explicit
instruction. Milestone 8C2: PASSED WITH USER-WAIVED ANDROID VALIDATION. Actual
8C2 Android product coverage remains incomplete and must not be reported as tested.
V0.2 is not released. Milestone 8D1 has not started.
