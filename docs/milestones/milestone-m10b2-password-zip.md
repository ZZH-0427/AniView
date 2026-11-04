# M10B2 — Password-protected ZIP implementation and productization

Date: 2026-11-04. Authoritative inputs: the M10B1 feasibility audit and M10B2
implementation plan. Desktop validation and fresh Android Edge/Quark product
acceptance passed on frozen implementation `0a35d4f`. No production release is implied.

## 1. Status

**M10B2 Password-protected ZIP: PASSED / CLOSED**. Desktop gates and fresh Android
Edge/Quark acceptance passed. The closeout changes documentation only.

## 2. Branch

`feat/v0.3-password-zip`, based on preserved M10B1 checkpoint `3f24ade`.
Accepted implementation: `0a35d4fa3e9f64d59ae7a4ae314d1adc70fe4b2b`, clean frozen
production build, `sourceDirty=false`. The subsequent closeout is documentation
only and does not replace the accepted product build. No main merge/push, version
bump, tag, Release or Pages deployment is authorized by this milestone.

## 3. Supported Encryption

Implemented and desktop-tested: Traditional ZipCrypto and WinZIP AES-128/192/256,
using existing `@zip.js/zip.js@2.23.0`. STORE and DEFLATE independent fixtures pass.
Support excludes encrypted central directories, PKWARE strong encryption and
proprietary schemes. This is ZIP support, not RAR/7z container support.

## 4. Architecture

`ArchiveEntryAccess → ArchiveSession → existing archive Worker/ArchiveEngine/
ZipReader → fully verified Blob → ArchiveEntryVirtualFile → existing media flow`.
One Reader per archive, unchanged Worker protocol and VirtualFile implementation.
The selected encrypted entry is gated before Viewer mounts. Plain entries take
their existing direct path. MediaSession ownership and navigation are unchanged.

## 5. Password Ownership

The mounted input owns editable text. ArchiveSession owns a genuine private
`#recentSuccessfulPassword` field; it is absent from object keys/spreads/JSON.
Only the existing local Worker request carries an attempt's credential.
Close/replace/transport termination clears the session reference immediately;
prompt unmount and attempt completion drop remaining application references.
JavaScript strings and browser-managed autofill/native allocations cannot be
physically wiped or comprehensively measured by AniView.

## 6. Password Reuse

Promote only after complete extraction/authentication, size and current-generation
checks. A following encrypted entry tries the one latest success once. A failed
current attempt clears it; failed manual input is never promoted. A=X/B=Y replaces
X with Y after success, so revisiting A can require X again. No candidate history,
search, automatic retry loop or archive reopening is used.

## 7. State Machine

Selection → checking → ready, prompt or terminal entry error. Prompt → submitting
→ ready/retryable prompt/terminal error. Cancel → abort/join → locked with explicit
Unlock; it does not immediately re-prompt. Selection/ZIP identity changes abort
and invalidate prior work. A synchronous submit guard prevents duplicate attempts.

## 8. Error Mapping

| Vendor/outcome | Application result |
| --- | --- |
| ERR_ENCRYPTED / missing credential | ARCHIVE_ENCRYPTED, input prompt |
| ERR_INVALID_PASSWORD | ARCHIVE_WRONG_PASSWORD, cautious retry wording |
| AES authentication tag failure | ARCHIVE_INTEGRITY_FAILED, terminal entry error |
| ZipCrypto late CRC/inflate/size vendor error | ARCHIVE_PASSWORD_OR_CORRUPTED, explicit manual retry |
| Unsupported encryption/strong flag/invalid AES strength | ARCHIVE_UNSUPPORTED_ENCRYPTION |
| Plain CRC/structural damage | Existing ARCHIVE_CORRUPTED |
| Existing policy/cap/Worker/abort failures | Existing stable category preserved |

Comparisons use actual exported 2.23.0 message constants at the adapter, not a
nonexistent vendor `error.code`. Raw credential-bearing causes are not retained.

## 9. Ambiguity Handling

ZipCrypto's one-byte verifier can accept an incorrect password before a late
CRC/inflate failure. Damaged AES salt/verifier can look like rejected input.
The UI therefore says the password was not accepted or the entry could not be
verified. It does not confidently label all corruption a wrong password. AES tag
failure is not an automatic password retry. All cases keep ZIP navigation usable.

## 10. UI

Inline panel, explicit label, hidden input by default, show/hide checkbox,
Unlock/Cancel, disabled duplicate submit, associated help/error, status and visible
focus. Native Enter submits; Escape cancels; Cancel focuses the explicit retry
button. Next/Previous and Close archive remain available. No modal dependency or
new archive file-list browser was introduced.

## 11. Localization

Twelve paired keys, 303 → 315 typed EN/ZH keys, interpolation/parity checks pass.
Switching locale during input preserves text and selected entry. Switching while
submitting updates copy without restarting/cancelling the attempt or Reader.
The previous encrypted-not-enabled text is replaced; diagnostic headings retain
the existing developer-English convention.

## 12. Lazy Extraction

Metadata opening performs zero full extractions. Unselected encrypted siblings
do not prompt or decrypt. Existing first-media auto-selection remains intentional:
if that first item is encrypted, its selection opens the input panel. Session
retains at most one current verified plaintext Blob, not all visited entries.

## 13. Limits

Unchanged: archive 512 MiB; Reader allocation/directory 16 MiB; 10,000 entries;
single plaintext entry 64 MiB; declared total 2 GiB; declared ratio 1000;
path 1024 characters; cumulative paths 2 Mi characters; MediaSession 1000 files.
Actual output is bounded by both 64 MiB and declared size before copying chunks.
Existing 30-second request and 2-second close fallback bounds remain.

## 14. Partial Plaintext

Fresh bounded sink per attempt. Internally accepted chunks are explicitly dropped
on write, auth, size, abort or extraction failure. No Blob is published until the
entire `getData` operation and final size check succeed; no failed plaintext is
cached, exposed to a decoder or given an object URL. Tests include a generated
1 MiB AES final-tag failure and a later sink-write failure after accepted chunks.

## 15. Cancellation

Existing AbortSignal path is preserved. Tests abort during real native AES key
derivation, join the failure and retry the same Reader. Native KDF/synchronous
work need not stop instantly; normal cancellation is cooperative, with existing
timeout/termination fallbacks. Closing awaits owned access tasks and read cleanup.

## 16. Stale Isolation

Session generations plus selection tokens/AbortControllers guard old input,
results, errors and password promotion. Browser tests hold a verified Worker
response, then navigate/close/replace ZIP and prove no old result is published.
New explicit same-entry credentials abort/join the old attempt rather than
coalescing with it. Ordinary concurrent range reads retain existing coalescing.

## 17. Viewer

Encrypted GIF, WebP and APNG use existing controlled Viewer/decoder/player/render
paths after authentication. No ciphertext reaches format detection. Source files,
Viewer, Player, Renderer and decoder implementations were not modified.

## 18. Conversion

Encrypted WebP → APNG → Preview → Close → Back was exercised in the real product.
The archive session remains alive. Viewer release can drop its current Blob;
Converter or returning Viewer re-materializes through the same VirtualFile using
the session's verified credential, without a second UI password request.

## 19. Navigation

Prompt and in-flight Next/Previous, public siblings, Cancel/Unlock, Close and ZIP
replacement pass. Metadata identity is resolved by the actual owned VirtualFile,
not its filtered MediaSession ordinal. Source selection and ZIP navigation remain
available after Preview/Back or a rejected encrypted entry.

## 20. Plain ZIP Regression

All existing archive tests remain. Real production Viewer checks exercise existing
plain ZIP navigation and reopening after encrypted failures. Existing malformed,
truncated, CRC, Zip64, extension, path, limit and cache behaviors still pass.

## 21. Mixed Archive

Public GIF → ZipCrypto GIF → public static PNG → AES-256 WebP → AES-192 APNG,
with one shared synthetic credential. Public entries do not send a password.
Different-password supplemental fixture confirms latest-success-only semantics.

## 22. External Compatibility

Eight tiny independent fixtures produced by installed 7-Zip 26.03:
ZipCrypto/AES128/AES192/AES256 × STORE/DEFLATE. All pass actual Reader wrong→correct
and production UI tests. Supplemental mixed/different/corrupt/unsupported fixtures
bring the committed addition to 16 ZIPs, **6,973 bytes total**. Manifest records
producer, method, strength, sizes, encoded SHA-256 and public TEST FIXTURE ONLY
credentials. Controlled mutations are rejection tests, not interoperability claims.

## 23. Privacy

No storage, URL/query, analytics, remote API, password hash/length or credential
diagnostic was added. Local browser evidence checks storage, console and requests
for synthetic inputs; all observed app requests are GET/HEAD to local build assets
or local Blob/data resources, with no media/password upload. Cleanup diagnostics
copy six explicit nonsecret ownership numbers, never Session/request objects.
Browser password managers/autofill remain outside application control.

## 24. Cleanup

Production password run: 46 Workers created / 46 terminated, active 0; Home
activeWorkers/activeBitmaps/activeArchiveSessions 0. `lastArchiveCleanup` records
activeArchiveWorkers, activeArchiveSessions, pendingReads, pendingPasswordAccess,
currentExtractedBytes and cleanupErrors, all 0. Access count measures pending API
tasks, not text/password attempts. Expected wrong-password/corrupt tests increment
the existing archiveErrors counter; this is distinct from cleanupErrors.

## 25. Desktop Validation

Installed Edge 156.0.4314.58, production `/AniView/` with no HMR. Nine password
workflow groups pass, including eight independent fixtures, keyboard/input,
duplicate submit, delayed-result navigation, classification and cleanup. Existing
core browser and release-ui suites also pass. Ignored evidence under
`.tools/m10b2/`: `password-browser-report.json`, `core-browser.log`,
`release-ui.log`, `smoke.json`, `bundle-audit.json`, screenshots and formal logs.
These reports contain synthetic fixtures only and are not production assets.

## 26. Android Edge

**PASS**, user-reported on frozen `0a35d4f`: ordinary ZIP, ZipCrypto wrong→correct,
same-secret reuse, AES media, encrypted-source conversion/Preview/Back, locale and
soft-keyboard flows. User confirms all requested tests passed with no observed
stutter or other problems. Workers 18/18, Bitmaps 1/1, archives 2/2; all active
resources, archive-access and conversion cleanup counters 0. archiveErrors=1 and
extractions 11 started/10 completed are consistent with the intentional rejected
password step, not a cleanup leak. Full supplied snapshot and attribution:
[Android validation](milestone-m10b2-android-validation.md).

## 27. Android Quark

**PASS**, user-reported on frozen `0a35d4f`: password/Cancel/explicit retry,
wrong→correct, show/hide, soft keyboard, navigation, archive replacement/reopen and
locale flows. User confirms all requested tests passed without observed stutter
or other problems. Workers 10/10, archives 3/3; all active and archive-access
cleanup counters 0. No browser version/device identity was supplied in this report.

## 28. Android Coverage Gaps

No required Android gate remains open: the user confirmed the requested workflows
and supplied both final cleanup snapshots. This is user-performed acceptance, not
an independent remote observation. Optional different-password, full AES-strength,
corrupt/unsupported and large-pressure phone matrices were not separately reported;
the applicable desktop/automated coverage passes. Browser versions and detailed
timing were not supplied and are not inferred from older milestone results.

## 29. Responsive/Keyboard

1280/768/390/360 px widths: no horizontal overflow, input/action/show-hide row
targets at least 44 px; screenshots visually reviewed at desktop and 360 px.
At 360×320 the document scrolls and Cancel remains reachable. Native Enter,
Escape, Tab/Shift+Tab and initial/retry focus pass. Fresh Android soft-keyboard,
show/hide, scrolling and locale acceptance is now user-confirmed on Edge and Quark.
Long names retain existing safe text handling.

## 30. Bundle

Compared with the frozen accepted M10A2 `3fe3320` build; M10B1 changed docs only.
Sizes are raw / individually gzip-compressed bytes, not network compression claims.

| Asset set | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Actual Home JS+CSS requests | 338904 / 104158 | 342088 / 105709 | +3184 / +1551 |
| Main index JS alone | 285533 / 86043 | 276829 / 83558 | -8704 / -2485 |
| New lazy password gate JS | 0 | 4352 / 1626 | +4352 / +1626 |
| New lazy password CSS | 0 | 892 / 429 | +892 / +429 |
| Archive Worker | 139317 / 61639 | 140334 / 61976 | +1017 / +337 |

Do not interpret the smaller index as a total reduction: Vite shared chunking now
also emits ViewerControls used by the lazy gate. Home never requests the password
gate or archive Worker, and creates no archive/crypto Worker. Worker asset count
9 → 9; external WASM count 1 → 1. Shared canonical encoder 45,991 bytes, MP4 encoder
300,564 bytes and WebP WASM 394,132 bytes remain byte-identical. Other decoder/source
Worker hashes can change from shared MediaError message additions; their source
implementations are untouched. No new CSP/COOP/COEP or runtime-loaded crypto asset.

## 31. Dependencies

No dependency/version/lockfile/license change. zip.js stays 2.23.0. No custom crypto,
modal/form/state dependency, extra Worker or external WASM. `npm ci` reports the
existing 12 moderate advisories; this task does not run audit fix or upgrade them.

## 32. Tests

Previous: **84 files / 1054 tests**. Current: **88 files / 1086 passed**, **0 failed,
0 skipped**. All original tests are preserved; 32 additions across password-engine,
password-session, ArchivePasswordPrompt and archive-cleanup tests. No lint/type
relaxation, removed test or weakened assertion.

## 33. Build

Official Windows Node v24.22.1 / npm 11.19.1, `D:\tool\nodejs\node.exe` and
`D:\tool\nodejs\npm.cmd`: npm ci, lint, typecheck, test, build all PASS. Build's
release checker verifies `/AniView/`, required assets, package/lock/Node alignment
and zero test/validation fixtures in dist. Phone preview uses a clean post-commit
build; its sourceDirty field must be false.

## 34. V0.3 Regression

PASS: controlled Viewer, plain ZIP, Creator GIF/WebP/APNG Generate→Preview→Close,
animation conversion/Preview/download/reopen, animation→MP4 native playback/Back,
video→animation Preview/Back, EN/ZH and normal page without diagnostics. Eleven
lightweight flows; browser errors 0. No old full codec/phone pressure matrix rerun.

## 35. Files Added

- `src/archive/archive-errors.ts`, `password-engine.test.ts`, `password-session.test.ts`
- `src/components/ArchiveEntryAccess.tsx`, `ArchivePasswordPrompt.tsx`,
  `ArchivePasswordPrompt.test.tsx`, `archive-password.css`
- `src/media/archive-cleanup.ts`, `archive-cleanup.test.ts`
- `tests/fixtures/zip/password-*.zip` (16 tiny files)
- `tools/password-zip/{generate-fixtures.mjs,preview.mjs,run-browser.mjs,README.md}`
- This milestone report and `milestone-m10b2-android-validation.md`

## 36. Files Modified

`src/app/MediaApp.tsx`; `src/archive/{archive-engine.ts,archive-policy.ts,
archive-session.ts}`; `src/components/RuntimeDiagnostics.tsx`;
`src/i18n/{media-errors.ts,messages.ts}`; `src/media/errors.ts`;
`tests/fixtures/zip/manifest.json`. PLAN/AGENTS, package/lock, workflows,
historical milestones, Creator/conversion/video/codec/Player/Renderer internals
and v0.2.0 remain unchanged.

## 37. Known Limitations

Encrypted central directory, PKWARE strong and proprietary encryption are
unsupported. One latest successful credential only;
ZipCrypto/verifier corruption ambiguity is intrinsic. Passwords and native crypto
buffers cannot be physically wiped/measured by this JavaScript application.
Cancellation is cooperative; browser reload loses session/password/media state.

Actual changes relative to the plan: a separate ARCHIVE_INTEGRITY_FAILED code
makes AES auth failures terminal and accurately localized; the bounded sink now
explicitly discards chunks after write failure; six numeric post-close counters
support cleanup acceptance. These are localized boundary fixes, not architecture,
dependency, timeout or resource-limit changes.

## 38. Final Verdict

**M10B2: PASSED / CLOSED**.

AniView V0.3 now supports password-protected ZIP entries using Traditional
ZipCrypto and WinZIP AES-128/192/256. Password handling remains session-local,
lazy extraction is preserved, and no custom cryptographic implementation is used.
Desktop gates and the new Edge/Quark product acceptance have passed.

## 39. Next State

Password-protected ZIP: FEATURE COMPLETE.
V0.3: IN DEVELOPMENT. Production remains released v0.2.0.
Ready for next V0.3 milestone planning.
STOP; no next milestone, RAR/7z implementation or production operation is part of
this closeout. Only the two M10B2 documents changed after accepted `0a35d4f`;
the existing 1086-test/build/browser evidence remains applicable. No redundant
codec/build rerun is claimed for this documentation-only update.
