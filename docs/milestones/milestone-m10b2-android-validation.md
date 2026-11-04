# M10B2 — Android password ZIP validation

**PASSED / CLOSED**, 2026-11-04. Fresh Android acceptance was performed and
reported by the user; cleanup JSON below is supplied evidence, not a simulated
phone run or independent remote observation.
Desktop evidence: [milestone report](milestone-m10b2-password-zip.md).
M10A2 Creator and M10B1 desktop feasibility do not replace this new product gate.

## Frozen environment

Accepted implementation: `0a35d4fa3e9f64d59ae7a4ae314d1adc70fe4b2b`.
Production build identity: version 0.2.0, sourceDirty false. The later closeout
changes only the two milestone documents and does not alter the accepted artifact.

Historical test page:
`https://allowed-enhancements-need-permitted.trycloudflare.com/AniView/?debug=1`.
Samples: same origin, `/AniView/validation/password-zip/`.
The temporary tunnel is not a permanent production URL.
Desktop HTTPS verification confirmed secureContext=true, HMR=false, successful
AES unlock/Viewer and zero cleanup. No Pages deployment. During testing the
computer/build/fixtures were kept stable. For any future retest, if the
URL stops working, report the full browser error and obtain a new verified entry;
do not use old milestone links. These URLs serve synthetic samples only. Selected
ZIP bytes and passwords remain in the phone browser and are never uploaded.

Sample directory: `<verified origin>/AniView/validation/password-zip/`.
Download ZIPs and select them via Open ZIP archive; do not extract them first.
All credentials below are **public TEST FIXTURE ONLY**, never real user passwords:

| Sample | Purpose | Synthetic credential |
| --- | --- | --- |
| mixed.zip | Existing ordinary ZIP regression | none |
| password-mixed.zip | Public GIF, ZipCrypto GIF, public PNG, AES256 WebP, AES192 APNG | aniview-test |
| password-first.zip | AES256 first selected item; public GIF sibling | aniview-test |
| password-aes128-deflate.zip | Independent 7-Zip AES128 | aniview-test |
| password-different.zip (optional) | A=X, B=Y, A=X | X=aniview-test; Y=beta |
| password-corrupt-aes.zip | Deliberate authentication failure | aniview-test |
| password-unsupported.zip | Deliberate unsupported encryption metadata | none accepted |

Other AES strength and STORE/DEFLATE files are available, but a full engine matrix
is not required again. Combined Edge/Quark acceptance must cover ZipCrypto and AES.

## Android Edge

1. Open mixed.zip, play an animation, Next/Previous, Close archive.
2. Open password-mixed.zip: public first item opens without a password. Next to
   locked GIF: hidden input, show/hide, wrong input → readable rejection → correct
   aniview-test → Viewer. Next public PNG opens, Next encrypted WebP opens using the
   same credential without a new prompt, Next encrypted APNG opens normally.
3. On the encrypted WebP use More → Convert animation → APNG (or GIF) → Convert →
   Preview → Close → Back. Confirm the original ZIP/current item/navigation remain
   usable and no new password request appears. Download/reopen is a light optional
   check; this gate does not repeat the old conversion matrix.
4. Reopen password-first.zip, type an incomplete synthetic value, switch EN/ZH,
   confirm value/selection remain; Cancel leaves the ZIP open, then explicit Unlock
   allows retry. Check input and action buttons with the soft keyboard visible.
5. Optional only (desktop/automated coverage already passes): open
   password-corrupt-aes.zip and use aniview-test: expect an integrity message,
   not repeated password guessing. Open password-unsupported.zip: expect unsupported
   encryption with no password request. Close/reopen a normal ZIP afterwards.

## Android Quark

1. Open password-first.zip. Check keyboard, show/hide, readable labels, scroll and
   reachable Cancel/Unlock. Cancel keeps ZIP open and does not instantly prompt.
   Explicit Unlock, wrong → correct aniview-test; animation should play normally.
2. Reopen and, while prompting, Next to the public item then Previous: old typed
   text must not reappear. Retry successfully. Close/reopen or replace the archive:
   it must require new input. Switch EN/ZH while entering a test credential.
3. Open password-mixed.zip and navigate public/encrypted siblings; check reuse.
   Open password-aes128-deflate.zip if additional AES coverage is convenient.
4. Damaged/unsupported samples are optional; desktop/automated coverage suffices.
   No large archive stress, password search, real secret logging or uploads.

## Cleanup and response

Each browser: close all media/ZIP and return Home. Expand Resource diagnostics →
Raw JSON; send only the short snapshot or confirm checked zero counters:
activeWorkers, activeBitmaps, activeArchiveSessions; lastArchiveCleanup's
activeArchiveWorkers, activeArchiveSessions, pendingReads, pendingPasswordAccess,
currentExtractedBytes, cleanupErrors. Existing conversion cleanup Worker/URL fields
should also be zero if conversion was used. One archive Worker while ZIP is still
open is expected. Wrong-password/corrupt samples may increment archiveErrors;
that historical error count need not be zero.

Report Edge/Quark separately: procedures completed, prompt/retry/Cancel/reuse,
conversion/Back where required, keyboard/show-hide/locale, integrity/unsupported,
cleanup; obvious jank/reload/crash or exact error code/step. No long codec JSON or
real password screenshot is requested. Optional different-password coverage can
be noted separately; desktop A=X/B=Y already passes.

## Results — user-confirmed

| Browser | New M10B2 workflow | Soft keyboard | Cleanup | Verdict |
| --- | --- | --- | --- | --- |
| Android Edge | All requested handoff flows passed | Passed | All active/cleanup counters 0 | PASS |
| Android Quark | All requested handoff flows passed | Passed | All active/cleanup counters 0 | PASS |

User's final confirmation: “各项测试均已通过，未发现卡顿等问题”. This covers the
required browser-specific handoff: Edge plain ZIP, ZipCrypto wrong→correct, AES,
reuse, encrypted-source conversion/Preview/Back and locale/keyboard; Quark Cancel,
explicit retry, show/hide, wrong→correct, navigation, reopen/replacement,
locale/keyboard. No additional rerun was requested after this confirmation.

Optional different-password, full strength, corrupt/unsupported and pressure phone
cases were not separately reported. Desktop/automated coverage is sufficient for
these nonmandatory phone cases. No new browser version/device identity, exact
latencies, memory measurements or case-by-case screen recording was supplied.
Do not import such details from old Android milestones.

### Edge supplied cleanup snapshot

```json
{"workersCreated":18,"workersTerminated":18,"activeWorkers":0,"peakWorkers":3,"bitmapsCreated":1,"bitmapsClosed":1,"activeBitmaps":0,"peakBitmaps":1,"archiveSessionsOpened":2,"archiveSessionsClosed":2,"activeArchiveSessions":0,"entryExtractionsStarted":11,"entryExtractionsCompleted":10,"entryExtractionsDiscarded":0,"staleResultsDiscarded":0,"decoderErrors":0,"staticDecodeErrors":0,"archiveErrors":1,"cleanupErrors":0,"lastArchiveCleanup":{"activeArchiveWorkers":0,"activeArchiveSessions":0,"pendingReads":0,"pendingPasswordAccess":0,"currentExtractedBytes":0,"cleanupErrors":0},"lastConversionCleanup":{"activeDecoderWorkers":0,"activeEncoderWorkers":0,"activeVideoWorkers":0,"ownedVideoFrames":0,"activeObjectUrls":0,"cleanupErrors":0,"videoFramesBalanced":null}}
```

18/18 Workers, 1/1 Bitmaps, 2/2 archive sessions are balanced. All active,
pending-access, current-plaintext and conversion cleanup counts are zero.
The one historical archive error and 11/10 extraction counts are consistent with
the intentional wrong-password test; they do not indicate a retained resource.
`videoFramesBalanced:null` is an absent MP4-specific balance measurement for this
animation conversion, not an active VideoFrame count; ownedVideoFrames is 0.

### Quark supplied cleanup snapshot

```json
{"workersCreated":10,"workersTerminated":10,"activeWorkers":0,"peakWorkers":2,"bitmapsCreated":0,"bitmapsClosed":0,"activeBitmaps":0,"peakBitmaps":0,"archiveSessionsOpened":3,"archiveSessionsClosed":3,"activeArchiveSessions":0,"entryExtractionsStarted":7,"entryExtractionsCompleted":7,"entryExtractionsDiscarded":0,"staleResultsDiscarded":0,"decoderErrors":0,"staticDecodeErrors":0,"archiveErrors":0,"cleanupErrors":0,"lastArchiveCleanup":{"activeArchiveWorkers":0,"activeArchiveSessions":0,"pendingReads":0,"pendingPasswordAccess":0,"currentExtractedBytes":0,"cleanupErrors":0}}
```

10/10 Workers and 3/3 archive sessions are balanced. All active resources,
pending access, current extracted bytes and cleanupErrors are zero. This snapshot
does not provide an individual rejected-password attempt count; the workflow pass
is attributed to the user's explicit overall confirmation, not inferred from it.

**Required Android gates: PASS. M10B2: PASSED / CLOSED.** No product code, accepted
build, dependency, resource limit, main, tag or production deployment changes are
part of this evidence closeout. Password-protected ZIP is FEATURE COMPLETE;
V0.3 remains IN DEVELOPMENT. STOP before any next milestone implementation.
