# M10C3 — Android RAR / 7z product validation

Status: **M10C3 — RAR / 7z Narrow Productization: PASSED / CLOSED**.

## Android result archive — 2026-11-11

The user separately confirms Android Edge and Android Quark completed all
arranged functional tests with no issues. Each browser is **USER-CONFIRMED PASS**.
The user also supplies each browser's Resource Diagnostics after returning Home;
the identical values below are attributed to both browsers explicitly, not copied
from desktop or an earlier milestone. This completes the previously pending
browser attribution and application-observable cleanup evidence.

The simplified round references these public fixtures:

- `normal-rar5.rar`
- `headers.7z`
- `test_read_format_rar4_solid_encrypted_filenames.rar`
- `medium-solid.7z`

The arranged functional scope includes archive opening/listing, ordinary and
supported solid archives, passwords/encrypted filenames, Viewer and supported
animation conversion, Back/Next/Previous, cancel/reopen/Worker recovery and EN/ZH.
Both browsers' reported completion is user confirmation, not a machine-recorded
per-file execution trace. The RAR4 fixture contains text; successful listing does
not imply it was displayed as media. Exact test/repetition counts, timings and
device/browser versions are **NOT SEPARATELY VERIFIED**. The confirmation is not
expanded into extra fixture coverage or the exact three repetitions in the
retained expanded plan below.

| Evidence | Classification | Scope and limit |
| --- | --- | --- |
| Android Edge functionality and Home cleanup | USER-CONFIRMED PASS | Separate user confirmation and user-provided diagnostics below |
| Android Quark functionality and Home cleanup | USER-CONFIRMED PASS | Separate user confirmation and user-provided diagnostics below |
| Fresh HTTPS product smoke and Home cleanup | DESKTOP PASS | Windows desktop browser; not an Android result |
| Unit/native/browser regression records | AUTOMATED PASS | Retained desktop/automation baseline; not new phone diagnostics |

### User-provided Home resource diagnostics

Values are recorded once here; the productization report links to this table.
Pairs and groups use the field order shown in the first column.

| Resource Diagnostics fields | Android Edge | Android Quark |
| --- | --- | --- |
| workersCreated / workersTerminated | 5 / 5 | 5 / 5 |
| activeWorkers | 0 | 0 |
| bitmapsCreated / bitmapsClosed | 4 / 4 | 4 / 4 |
| activeBitmaps | 0 | 0 |
| archiveSessionsOpened / archiveSessionsClosed | 2 / 2 | 2 / 2 |
| activeArchiveSessions | 0 | 0 |
| entryExtractionsStarted / entryExtractionsCompleted | 7 / 7 | 7 / 7 |
| entryExtractionsDiscarded | 0 | 0 |
| decoderErrors / staticDecodeErrors / archiveErrors / cleanupErrors | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

| lastExtendedArchiveCleanup fields | Android Edge | Android Quark |
| --- | --- | --- |
| extendedArchiveWorkersCreated / extendedArchiveWorkersTerminated | 1 / 1 | 1 / 1 |
| activeExtendedArchiveWorkers / activeWasmInstances / activeArchiveSessions | 0 / 0 / 0 | 0 / 0 / 0 |
| activeExtraction / pendingAccess | 0 / 0 | 0 / 0 |
| currentExtractedBytes / activeObjectUrls | 0 / 0 | 0 / 0 |
| cleanupErrors | 0 | 0 |
| peakWasmBytes | 16777216 | 16777216 |
| timeouts | 0 | 0 |

**Application-observable cleanup: USER-CONFIRMED PASS for both browsers.** All
reported active resource and error counters are zero; Worker/Bitmap/archive
creation and release counts balance, and all seven reported extractions completed.
`peakWasmBytes` is a reported WASM peak, not device/process/native/GPU memory or a
measurement of the 64 MiB compiled maximum. No unsupported performance, system
memory or test-count claim is added. Unreported diagnostic fields remain
unreported; they are not assumed to be zero.

No product behavior, dependency, build, fixture or runtime binary changed during
closeout. The user authorizes committing and pushing these final acceptance
documents on the feature branch only.

The candidate and expanded test plan below are retained as handoff/reference
material. Their presence is not evidence that every step has been completed.

## Frozen candidate

Page: https://distributor-promotions-participate-surfaces.trycloudflare.com/AniView/?debug=1

Samples: https://distributor-promotions-participate-surfaces.trycloudflare.com/AniView/validation/extended-archive/

Implementation/build commit: `c6915e9f8d2b26faf5f4b5234f282360df985a12`.
Subsequent feature commits contain handoff documentation only. The production
build identifies this clean code snapshot in `release-candidate.json`.

WASM SHA-256: `bcbd8a4466062683a7e5d5c195be745fe18ea1065a4c6ccfe157dbca230fe970`.
JS SHA-256: `19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d`.
Same 7-Zip26.05 / Emscripten6.0.13, nonshared16/64MiB, original15s deadline.
Actual fresh HTTPS desktop product smoke passed; secureContext=true, HMR=false.
This was a static frozen preview, not the production GitHub Pages deployment.
This closeout rechecked both binary hashes, the actual nonshared 16/64 MiB WASM
memory section, all 18 manifest assets, six build inputs and 31 previously audited
source-package comparisons. No native rebuild or new phone run was performed.

The temporary URL and the instructions below are historical handoff references;
service/tunnel availability is not rechecked or promised during this closeout.

## Files and passwords

Download files from the sample index, then choose the downloaded archive directly
with Open archive. Do not extract it first. All fixture media and passwords are
public test data; do not use personal passwords.

| Group | Files | Password |
| --- | --- | --- |
| Normal | normal-rar4.rar, normal-rar5.rar, normal.7z | none |
| Solid | solid-rar5.rar, solid.7z | none |
| Encrypted entries | password-rar5.rar, password.7z | aniview-test |
| Encrypted headers | headers-rar5.rar, headers.7z | aniview-test |
| Legacy RAR4 encrypted/header/solid | test_read_format_rar4_*.rar | password |
| Unicode RAR4 | unicode-chinese.rar, unicode-japanese.rar | none |
| Controlled medium/near selected-output cap | medium-solid.7z, medium-solid-rar5.rar | none |

The legacy RAR4 fixtures contain text only: successful listing with no supported
images is expected. Their selected-byte hashes are separately verified on desktop.
M10C2's original first Android failures remain historical; no original root cause
or retroactive PASS is claimed.

## Expanded per-browser plan (reference, not a completion record)

1. Open normal RAR4, RAR5 and7z; view supported animation/static entries, Play/Pause
   and Next/Previous. Confirm selection/heading identity. Open solid RAR5/7z and
   select a later media entry by name; native solid order can differ by extension.
2. Open password archives: wrong password → correct password → normal Viewer.
   Next/Previous should reuse a verified password without repeated prompts.
   On an animated entry use More → Convert animation → supported target → Convert
   → Preview → Close → Back; retain the original archive and selected item.
3. Open encrypted-header RAR5/7z: Cancel keeps a retryable archive, explicit Unlock
   retries; wrong → correct works. While typing test characters, switch EN/ZH;
   preserve input and check errors/Unlock/Cancel remain visible or scroll-reachable
   above the soft keyboard. Close/reopen or replace the archive requires a password
   again; cancelled partial entry input must not leak to another selection.
4. Historical RAR4 regression: open
   test_read_format_rar4_encrypted_filenames.rar without a credential, Cancel and
   retry, enter a wrong value then correct `password`. Confirm successful listing
   (no images is expected). Close/reopen and repeat that sequence three times.
   Also open the available RAR4 encrypted/solid variants with `password`.
5. Open unicode-chinese.rar and unicode-japanese.rar; full names and GIF playback
   should work. Convert one and Back, retaining the full selected name.
6. After small cases, use one controlled medium solid sample. Cancel extraction
   when possible, explicitly Retry/reopen and confirm the PNG Viewer. Do not raise
   limits or repeat stress after a crash, reload, OOM or severe freeze.
7. Close all media/archives and return Home. Resource diagnostics must show zero
   activeWorkers, activeBitmaps and activeArchiveSessions. lastExtendedArchiveCleanup
   must show zero activeExtendedArchiveWorkers, activeWasmInstances,
   activeArchiveSessions, activeExtraction, pendingAccess, currentExtractedBytes,
   activeObjectUrls and cleanupErrors. Created/terminated Workers should balance.
   Historical wrong-password/error and peak counters need not be zero.

## Expanded reply template (reference)

For Edge and Quark separately, report normal/solid/password/header/legacy-repeat,
Viewer/conversion/Back/navigation, cancel/reopen, Unicode/EN-ZH/keyboard outcomes;
obvious lag/reload/crash; and the final cleanup JSON or explicit all-zero
confirmation. Include exact error code/step if something fails. No personal
password, private filename or media contents should be copied into diagnostics.

This is the retained expanded reply template, not a claim that its full matrix
or exact repetition counts were separately recorded. The user has now completed
the required functional attribution and supplied each browser's Home cleanup
diagnostics; no additional phone round is required for this closeout.

| Browser | Candidate | Arranged product flows | Application-observable cleanup | Decision |
| --- | --- | --- | --- | --- |
| Android Edge | c6915e9 | USER-CONFIRMED PASS | USER-CONFIRMED PASS; metrics above | PASS |
| Android Quark | c6915e9 | USER-CONFIRMED PASS | USER-CONFIRMED PASS; metrics above | PASS |

**M10C3 — RAR / 7z Narrow Productization: PASSED / CLOSED.** Previously missing
Android evidence is complete at the user-confirmed level described here. M10C2's
initial failures remain unchanged historical results. Existing resource limits
and declared format/solid/password limitations remain in force. The next separate
task is **V0.3 Repository Hygiene & Artifact Audit — READ ONLY**; it is not started
here. No main merge, version/tag change, RC, Release or Pages deployment occurs.
