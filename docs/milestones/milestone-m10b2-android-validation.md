# M10B2 — Android password ZIP validation

**PENDING ANDROID PASSWORD ZIP VALIDATION**, 2026-11-04.
Desktop evidence: [milestone report](milestone-m10b2-password-zip.md).
M10A2 Creator and M10B1 desktop feasibility do not replace this new product gate.

## Frozen environment

The test URL is a newly verified temporary HTTPS tunnel to a frozen clean production
build. The exact URL/commit is supplied in the test handoff and can be checked at
`/AniView/release-candidate.json` (version 0.2.0, sourceDirty false).
No Vite HMR, no Pages deployment; secureContext must be true. Keep the computer
awake and connected; do not change the build/fixtures during acceptance. If the
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

## Results

| Browser | New M10B2 workflow | Soft keyboard | Cleanup | Verdict |
| --- | --- | --- | --- | --- |
| Android Edge | Pending | Pending | Pending | PENDING |
| Android Quark | Pending | Pending | Pending | PENDING |

No Android result has been inferred or fabricated. Desktop viewport emulation is
not real soft-keyboard acceptance. Remain at this gate until user results arrive.
