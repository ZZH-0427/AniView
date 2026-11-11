# M10C3 — bounded RAR / 7z productization

Checkpoint date: 2026-11-11. **DESKTOP PASSED.**

**M10C3: PENDING ANDROID RAR/7Z PRODUCT VALIDATION.** Not PASSED/CLOSED.

The fixed 7-Zip26.05 RAR4 parser validates the full declared NAME_SIZE before the
old `ReadName` scan/SetFrom discards a NUL suffix. Non-Unicode embedded NUL rejects
through the existing unsafe outcome. Unicode names retain the legal separator;
complete operands, all four modes, legacy-copy bounds and surrogate pairs are
checked before the original decoder runs. No-separator UTF-8 is strict without
fallback. Final NUL/control/path/length checks remain. A bounded 1,025-unit buffer
preserves the 1,024-unit policy boundary. Per-entry RAR4 Unicode conversion retains
private-use characters without changing legacy RAR4, RAR5 or 7z serialization.

Native changes are `tools/extended-archive/rar4-filename.patch` and
`native/bridge.cpp`. Deterministic patch application, build receipts,
packaging/manifest verification, filename fixtures/runner and actual UI/lifecycle
runners accompany them. No ZIP, Creator, Viewer, Worker protocol, video, compiler
version or safety-limit change was made for this fix. See the
[complete filename-fix record](milestone-m10c3-rar4-filename-fix.md) for the exact
parsing/error propagation, changed files and reproducible commands.

The same valid-CRC NUL fixture was accepted as `safe` before the fix and now rejects
during native opening, before listing. **43 filename cases (19 positive / 24
negative), 22 native boundary checks and all 34 compatibility cases / 195 hashes
PASS.** Actual Viewer, Chinese/Japanese RAR4 conversion/Back/Home, passwords,
encrypted headers, solid, Cancel/reopen/retry, replacement and cleanup PASS.
ZIP/password-ZIP nine groups and three-target Creator 26 groups PASS. Lint,
typecheck, **95 files / 1,188 tests**, complete build and 18 distribution assets PASS.

Two builds from newly extracted pinned sources produce identical JS/WASM hashes:

```text
WASM bcbd8a4466062683a7e5d5c195be745fe18ea1065a4c6ccfe157dbca230fe970
JS   19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d
```

Actual memory stays nonshared, initial16MiB / maximum64MiB, growth enabled.
Source, patch, notices, change record and replacement materials match the manifest.
These hashes supersede the historical pre-fix binaries. Fresh Android Edge/Quark
product results remain required, including the RAR4 password sequence and Unicode
names. M10C2's original Android failures are retained without retroactive PASS or
a claimed root cause. The [Android record](milestone-m10c3-android-validation.md)
identifies the prepared candidate. No formal Android test has started.

The remaining implementation/pre-retry sections are historical context,
superseded by this desktop checkpoint where stated.

## Scope and preservation

Branch `feat/v0.3-rar-7z-product` was created from clean `5a1f2b7`.
M10C1/M10C2 evidence and branches are retained. Main/v0.2.0/production are
unchanged; no merge, version bump, tag, release or Pages deployment is authorized.
The implementation is not yet committed or pushed: desktop native gates are
unfinished. The final request's complete acceptance gate still applies.

Single-file RAR4/RAR5/7z, read-only metadata and selected media extraction are
implemented on the branch. ZIP stays on its existing zip.js 2.23.0 session,
engine, password state machine and Worker protocol. Those files and the root
dependency/lock files have no changes. This checkpoint is not a compatibility
claim for untested native product artifacts.

## Architecture

`ArchiveInput → byte-signature whitelist → archive-source-factory → existing
ZIP session adapter OR independent ExtendedArchiveSession → VirtualFile →
existing MediaSession / Viewer / conversion`.

The small UI-facing contract carries identity, metadata, selection/access and
cleanup. Extended native metadata stays behind its adapter. RAR/7z own one
dedicated Worker/WASM instance per session, session-private credentials and at
most one verified extracted Blob. ZIP does not share that credential state.
Encrypted headers use an opening gate; encrypted/unknown selected entries use
the selected-entry gate. Cancel terminates the synchronous backend and reopens
the same archive for retry. Generation/request tokens reject stale results.

Unknown declared entry size is not fabricated as zero. Its VirtualFile size
becomes available after verified selected access; every extended Viewer entry
passes that access gate. A separate header credential may reopen the directory;
it is not promoted as a successful body credential until full extraction passes.

## Candidate product policy

Exact policy tests pass; actual product native/browser boundary tests and the
new Android pipeline tests remain required before the final policy freeze.

| Guard | Candidate value |
| --- | ---: |
| Encoded archive | 15 MiB |
| Selected actual output | 4 MiB |
| Recognized dictionary | 4 MiB |
| WASM initial / compiled maximum | 16 / 64 MiB, nonshared wasm32 |
| Entry count | 1,000 |
| One path / cumulative path text | 1,024 / 131,072 UTF-16 code units |
| Cumulative reads / maximum chunk | 128 MiB / 1 MiB |
| Operation deadline | 15 seconds |

Unknown dictionaries remain unknown. Compressed/encrypted headers can allocate
before metadata preflight; the compiled memory cap, actual native-output cap and
external deadline are the fallback. The WASM limit is not a whole-tab memory
limit. Solid extraction can decode earlier data; no constant-time access is
promised. Callers can lower the deadline and cannot raise policy budgets.

## Pre-retry checkpoint verification

Official installed environment: Node v24.22.1 / npm 11.19.1,
`D:\tool\nodejs\node.exe` and `D:\tool\nodejs\npm.cmd`. PowerShell's current
script policy prevents its npm.ps1 shim; the installed npm.cmd is used without
changing execution policy or installing another Node.

- `npm ci`: PASS; existing lockfile unchanged. npm reports 13 moderate findings;
  no dependency upgrade or new npm dependency was introduced in this task.
- Exact policy tests: 43 PASS, including below/at/above byte/count/path/read limits,
  null metadata and overflow of a recognized dictionary declaration.
- Typed backend/session/loader tests: PASS, including real minimal-WASM factory
  rejection propagation, hard cancellation/deadline, repeated lifecycle,
  credential ownership and stale isolation.
- Original 1,086-test baseline retained. Current full suite: **95 files /
  1,188 tests, all passed, zero failed or skipped** (102 additional tests).
- Lint/typecheck: PASS at the current checkpoint.
- Fault-injected installed-Edge UI controller tests: PASS; failed opening →
  gallery replacement closes ownership; header wrong/cancel/retry and language
  retention; selected-access cancel/reopen/retry; four responsive widths.
  **These tests mock the extended transport and are not native acceptance.**
  Screenshots were inspected at 360-pixel password and 1,280-pixel Viewer widths;
  1,280/768/390/360 have no horizontal overflow, and Cancel is scroll-reachable
  in a 360×320 viewport. This is browser emulation, not Android acceptance.
- Actual existing ZIP/password ZIP product browser suite: PASS, nine groups,
  eight independently generated encryption fixtures, Workers 46/46, active 0.
  This includes encrypted-entry conversion/Preview/Back and Home cleanup.
- Actual existing three-target Creator browser suite: PASS, 26 groups,
  five workloads, quality/readback/download/Preview/cleanup checks.
- Vite production compilation under `/AniView/`: PASS.
- **Full `npm run build`: FAIL at the deliberate distribution verification
  gate**, because the trusted compiler could not finish the required runtime.
  No successful release artifact or phone candidate is claimed.

Local numeric evidence: `.tools/m10c3/` (unit results, controller regression,
ZIP regression and Creator regression). Test media and profiles remain ignored.

## Pre-retry build blocker and distribution preparation

Windows application control returns error 4551 for the existing trusted
Emscripten `llvm-objcopy.exe`. Both sandboxed and explicitly authorized external
builds reached the final native link/postprocess step and failed there. The
compiler's ordinary flags cannot omit its mandatory annotation-stripping call.
No tool was renamed/replaced to evade that policy, and no compiler security
protection was disabled. The user said they would handle the trusted-tool
policy and notify us; completion has not yet been confirmed.

Production build sources are prepared at `tools/extended-archive/`, including
the explicit portability patch and a three-argument `av_extract` bridge with
an independent 4 MiB actual-output ceiling. Allocation probes and the extraction
preflight-bypass argument are removed. A partial emitted WASM was moved to
ignored local evidence and is not presented as a usable vendor artifact.
The product metadata binding also checks explicit BSTR lengths before C-string
conversion and preserves prior native guard failures. Five JS-boundary regression
tests pass; raw-NUL/control RAR4 fixtures and all native changes await actual
compilation and Worker validation. No native exploit is claimed from inspection.

Full component notices, license texts, exact-source preparation, build recipe,
packaging and replacement instructions are prepared under
`public/vendor/sevenzip/` and `tools/extended-archive/`. The final JS/WASM hashes,
matching manifest and corresponding-source package must be generated only after
the successful build. Production verification requires those matching files and
checks the binary's actual nonshared 16/64 MiB memory section. No runtime hash
lock prevents a user from replacing the component. Engineering license risk
remains MEDIUM; this is not legal clearance. AniView remains UNLICENSED/private.

Preliminary M10B2 comparison from a matching production controller build and real
Home/ZIP Network capture: Home JS 331,130 → 340,445 bytes (+9,315 raw / +2,364
gzip); CSS 10,958 → 12,025 (+1,067 raw / +243 gzip). The measured extended Worker
was 9,932 bytes before the later metadata guard addition; final Worker size must
be remeasured. JS glue/WASM sizes remain PENDING. Home/ZIP requested no SevenZip
assets and the 78 captured requests were same-origin. These are qualified
checkpoint measurements, not final distribution or RAR/7z first-use evidence.

## Pre-retry recovery plan (historical)

After confirmation that Windows permits the installed tool:

```text
node tools/extended-archive/prepare-runtime.mjs
node tools/extended-archive/build-runtime.mjs rebuild-1
node tools/extended-archive/package-runtime.mjs
node tools/extended-archive/verify-runtime.mjs
node tools/extended-archive/policy-boundary-browser.mjs
npm run lint
npm run typecheck
npm run test
npm run build
```

Then run real product Worker compatibility/hash/password regression, production
UI Viewer/conversion/navigation/cancellation and four-width validation. Measure
bundle deltas from M10B2; confirm Home/ZIP never download the extended runtime.
Freeze and commit/push the desktop candidate, create a verified secure no-HMR
preview, and request new Android Edge/Quark product tests as specified in the
[Android record](milestone-m10c3-android-validation.md). Neither M10C2 technical
smoke nor this checkpoint substitutes for those tests.

## Known limitations and final decision

Single-file archives only; multi-volume unsupported; SFX not guaranteed;
resource-limited solid work; small input/selected-output/dictionary policies;
64 MiB linear-memory maximum; 15-second operation deadline; partial metadata
preflight; some password/corruption ambiguity; JS passwords cannot be physically
memory-wiped; unobservable native/OS memory. Other backend formats are rejected.

**M10C3: NOT CLOSED.** Native compilation, raw-NUL rejection, distribution and
desktop gates now pass. Fresh Android RAR/7z product acceptance remains unstarted.
Do not start a later milestone, merge main or release from this checkpoint.
The controller-only localhost preview was stopped after its checks; no temporary
phone endpoint is active or approved for this checkpoint.

## Working-tree file impact

New source files (with matching tests where listed):

```text
src/archive/archive-signature.ts
src/archive/archive-signature.test.ts
src/archive/archive-source-session.ts
src/archive/archive-source-factory.ts
src/archive/archive-source-factory.test.ts
src/archive/extended-session.ts
src/archive/extended-session.test.ts
src/archive/extended-entry-virtual-file.ts
src/archive/extended/backend.ts
src/archive/extended/backend.test.ts
src/archive/extended/loader.ts
src/archive/extended/loader.test.ts
src/archive/extended/native-properties.ts
src/archive/extended/native-properties.test.ts
src/archive/extended/native-types.ts
src/archive/extended/policy.ts
src/archive/extended/policy.test.ts
src/archive/extended/protocol.ts
src/archive/extended/worker.ts
src/media/extended-archive-cleanup.ts
```

New tooling: `tools/extended-archive/README.md`, `build-runtime.mjs`,
`compile.mjs`, `prepare-runtime.mjs`, `package-runtime.mjs`, `verify-runtime.mjs`,
`native/bridge.cpp`, `system-emscripten.patch`, `fixtures.mjs`,
`compatibility-browser.mjs`, `controller-regression.mjs`, `measure-bundle.mjs`,
`policy-boundary-browser.mjs`, `policy-boundary.html`, `policy-boundary.ts`,
`preview.mjs`, `run-product.mjs`.

New distribution records: `public/vendor/sevenzip/README.md`,
`THIRD_PARTY_NOTICES.md` and `licenses/{7zip-License.txt,LGPL-2.1.txt,
compiler-rt-LICENSE.txt,emscripten-LICENSE.txt,libcxx-LICENSE.txt,
libcxxabi-LICENSE.txt,libunwind-LICENSE.txt,musl-COPYRIGHT.txt,
sevenzip-wasm-LICENSE.txt,unRarLicense.txt}`. Final native binaries, manifest
and source package were absent at the earlier checkpoint and were generated by
the successful retry; exact hashes are in the recovery report.

New milestone records: this file and `milestone-m10c3-android-validation.md`.

Modified: `README.md`, `THIRD_PARTY_NOTICES.md`,
`public/third-party-notices.txt`, `src/app/{App.test.tsx,MediaApp.tsx,
use-media-source.ts}`, `src/components/{ArchiveEntryAccess.tsx,ArchiveInput.tsx,
ArchivePasswordPrompt.tsx,ArchivePasswordPrompt.test.tsx,ArchiveSummary.tsx,
RuntimeDiagnostics.tsx,archive-password.css}`, `src/i18n/{messages.ts,
media-errors.ts,localization-ui.test.tsx}`, `src/media/errors.ts`,
`src/video-conversion/ConvertVideo.test.tsx`, `tools/release/check-build.mjs`.
The video test change updates only its expected archive-action label; no video
implementation changed. All edits are still uncommitted at this blocked checkpoint.
