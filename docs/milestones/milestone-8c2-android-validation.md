# Milestone 8C2 — Android product validation

Status: **PASSED, 2026-10-31**. Fresh product acceptance completed on actual
Android Edge155 and Quark10.2.0.995, Redmi K70 Ultra. QQ: not tested.
Implementation candidate: `31813b2`; same frozen production build, no HMR.
The user-authorized transport was USB loopback HTTP, not public HTTPS.
The earlier waiver was superseded by the reopened round and these actual results.

## Final product results

The user reports both browsers passed all requested product checks: GIF/APNG/WebP
to MP4, native Preview Play/Pause/seek and available fullscreen, Preview Back
retaining results, Back/Next preserving original source/ZIP, white alpha,
distinct repeated downloads with both files retained/playable, medium Cancel
then successful rerun, and no observed stutter, reload, crash or other anomaly.
Both browsers additionally passed the odd-dimension test: 319×241 source gives
320×242 output, padding note, complete image without stretch/crop.

The supplied success snapshots are from the final odd-file Session, not aggregate
counters for all tested files. Its zero cancellation count does not measure the
separately reported medium-file Cancel test. No aggregate job count is inferred.

| Final odd-file snapshot | Quark | Edge |
| --- | ---: | ---: |
| Status / target / error | success / mp4 / null | success / mp4 / null |
| Source width × height / frames | 319×241 / 10 | 319×241 / 10 |
| MP4 bytes | 14,548 | 15,488 |
| Actual codec | avc1.64000d | avc1.42000d |
| Peak canonical RGBA / VideoFrames | 1 / 1 | 1 / 1 |
| Max encode queue | 0 | 2 |
| Active decoder / encoder / video Workers | 0 / 0 / 0 | 0 / 0 / 0 |
| Owned VideoFrames / balanced | 0 / true | 0 / true |
| Cleanup errors / WASM live allocations | 0 / 0 | 0 / 0 |
| Retained result URLs | 1 | 1 |
| Active Workers / archive sessions / bitmaps | 1 / 1 / 0 | 1 / 1 / 0 |

One result URL and one archive Worker/session are expected while retaining a
result and ZIP. In a separate explicit follow-up, the user confirmed both browsers
showed zero activeWorkers/activeBitmaps/activeArchiveSessions after Back/Close all,
and zero active decoder/encoder/video Workers, ownedVideoFrames, activeObjectUrls
and cleanupErrors in lastConversionCleanup. This post-close numeric state is
**user-confirmed**, not independently read via remote debugging; no additional raw
post-close JSON was supplied. A read-only debugger attempt was unavailable and
was not used to claim a pass.

### User-supplied final Summary JSON

Quark:

```json
{"status":"success","target":"mp4","deflate":true,"jobId":2,"conversionsStarted":1,"conversionsCompleted":1,"cancellations":0,"activeDecoderWorkers":0,"activeEncoderWorkers":0,"peakRgbaFrames":0,"lastOutputBytes":14548,"activeObjectUrls":1,"cleanupErrors":0,"wasmLiveAllocBytes":0,"videoConversionsStarted":1,"videoConversionsCompleted":1,"videoCancellations":0,"activeVideoWorkers":0,"peakCanonicalRgbaFrames":1,"peakVideoFrames":1,"maxEncodeQueue":0,"ownedVideoFrames":0,"videoFramesBalanced":true,"lastMp4Bytes":14548,"lastCodec":"avc1.64000d","activeWorkers":1,"activeArchiveSessions":1,"activeBitmaps":0,"source":{"width":319,"height":241,"frameCount":10,"framePixels":768790},"limits":{"maxFrames":200,"maxSide":2048,"maxPixels":4194304,"maxFramePixels":15360000,"maxSourceBytes":67108864,"maxOutputBytes":67108864,"maxDurationUs":30000000},"error":null}
```

Edge:

```json
{"status":"success","target":"mp4","deflate":true,"jobId":2,"conversionsStarted":1,"conversionsCompleted":1,"cancellations":0,"activeDecoderWorkers":0,"activeEncoderWorkers":0,"peakRgbaFrames":0,"lastOutputBytes":15488,"activeObjectUrls":1,"cleanupErrors":0,"wasmLiveAllocBytes":0,"videoConversionsStarted":1,"videoConversionsCompleted":1,"videoCancellations":0,"activeVideoWorkers":0,"peakCanonicalRgbaFrames":1,"peakVideoFrames":1,"maxEncodeQueue":2,"ownedVideoFrames":0,"videoFramesBalanced":true,"lastMp4Bytes":15488,"lastCodec":"avc1.42000d","activeWorkers":1,"activeArchiveSessions":1,"activeBitmaps":0,"source":{"width":319,"height":241,"frameCount":10,"framePixels":768790},"limits":{"maxFrames":200,"maxSide":2048,"maxPixels":4194304,"maxFramePixels":15360000,"maxSourceBytes":67108864,"maxOutputBytes":67108864,"maxDurationUs":30000000},"error":null}
```

## Transport history and scope

After the forced PC shutdown, the same frozen candidate `31813b2` was restored
and independently checked over HTTPS on desktop. During the later outage, local
preview returned HTTP 200 while the external HTTPS connection reset (ECONNRESET),
including a replacement hostname. Quark reported “页面无法访问”. The underlying
network/provider cause was not established; this does not prove an application
conversion defect or complete its phone acceptance. Temporary services were
stopped at the user's instruction. On reopening, the old URLs remain historical;
use only the newly verified URL supplied with the current test request.

This gate concerns actual product controls, native Preview, saved files and source
preservation. Prior 8C1 engineering acceptance does not replace it. Do not repeat
the 8C1 stress matrix or manually chase finalization on a phone; desktop tests
exercise Cancel/Back during actual held native mux finalization.

## Candidate and delivery

### Completed USB round — explicitly authorized by the user

After public tunnel access failed and changing networks was unavailable, the user
explicitly approved USB loopback testing instead of public HTTPS. The same frozen
implementation candidate `31813b2` is used; artifact hashes are unchanged. This
round uses **HTTP loopback as a trustworthy local context, not public HTTPS**.
There is no certificate bypass, insecure-origin flag, HMR or product-code change.

Test product URL: `http://127.0.0.1:4224/AniView/?debug=1` on the connected
Android phone, using USB reverse port4224. Keep the PC running and the USB cable
connected when reproducing. Google SDK Platform-Tools37.0.1 is isolated in ignored local tooling;
its dedicated ADB daemon uses host port5041. Project dependencies are unchanged.

Preflight on the actual Redmi K70 Ultra:

| Browser | Page/Worker secure context | Worker VideoEncoder/VideoFrame | H.264 candidate support |
| --- | --- | --- | --- |
| Edge155 | true / true, product origin port4224 | available | all three accepted candidates |
| Quark10.2.0.995 | true / true, isolated loopback preflight port4227 | available | all three accepted candidates |

The temporary Quark preflight returned to the product page and its server/extra
USB reverse rule were closed. The checked configs are the unchanged 320×240,
500kbps, quality/no-preference AVC candidates from the accepted capability policy.
These are real-phone capability checks only: they do **not** claim completed MP4
encoding, native Preview, file saving, source preservation or product acceptance.
The separate fresh manual product results are recorded above. Prior public-HTTPS
desktop evidence is retained separately; no Android HTTPS test is invented.

After final post-close confirmation, reverse port4224, the dedicated ADB daemon
and local preview were stopped. These test URLs are now historical. No phone
media, application security settings, project dependencies or production hosting
were changed by this closure.

Samples for this USB round:

- `http://127.0.0.1:4224/AniView/validation/mp4/small.zip`
- `http://127.0.0.1:4224/AniView/validation/mp4/medium.zip`
- `http://127.0.0.1:4224/AniView/validation/mp4/odd.zip`

### Historical HTTPS setup

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

Both fresh product results and explicit post-close confirmations are recorded.
**Milestone 8C2: PASSED.** This is actual acceptance after reopening, not the former
waiver. Main, v0.1.0 and production Pages remain unchanged.
V0.2 is not released. Milestone 8D1 has not started.
