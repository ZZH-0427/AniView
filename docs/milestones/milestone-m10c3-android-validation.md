# M10C3 — Android RAR / 7z product validation

Status: READY FOR ANDROID PRODUCT VALIDATION. No Android PASS is recorded.
Use Android Edge and Quark separately; old milestone results do not substitute.

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
This is a static frozen preview, not the production GitHub Pages deployment.

Keep the computer, local server and selected tunnel running. Do not change the
build, fixtures or service during phone acceptance. Avoid simultaneous bulk
uploads while testing; they previously congested this network. Recheck this
temporary URL if testing occurs after a network change, sleep or restart.

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

## Each browser

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

## Reply

For Edge and Quark separately, report normal/solid/password/header/legacy-repeat,
Viewer/conversion/Back/navigation, cancel/reopen, Unicode/EN-ZH/keyboard outcomes;
obvious lag/reload/crash; and the final cleanup JSON or explicit all-zero
confirmation. Include exact error code/step if something fails. No personal
password, private filename or media contents should be copied into diagnostics.

| Browser | Candidate | Product flows | RAR4 repeated sequence | Cleanup | Decision |
| --- | --- | --- | --- | --- | --- |
| Android Edge | c6915e9 | Not tested | Not tested | Not tested | PENDING |
| Android Quark | c6915e9 | Not tested | Not tested | Not tested | PENDING |

M10C3 remains open until these new user-supplied device results pass.
