# M10C3 — Windows build retry and recovery

2026-11-11. **Historical pre-fix recovery checkpoint.** The Windows retry below
recovered compilation. Its raw-NUL blocker and binary hashes are superseded by
the [filename fix and desktop acceptance](milestone-m10c3-rar4-filename-fix.md).
The earlier results and failure evidence are retained below.

## A. Retry Status

**BUILD RECOVERED.** The unchanged native recipe completed all 190 compilation
and link steps, exit 0, empty stderr. M10C3 is still blocked by a desktop negative
metadata acceptance test; build recovery is not product acceptance.

## B. Workspace

Branch `feat/v0.3-rar-7z-product`, HEAD `5a1f2b7`. Existing uncommitted product
files were hash-snapshotted before retry. No product source, root dependency,
compiler/build recipe, safety policy, PLAN or AGENTS change was made during this
recovery. Generated component/source-distribution files and these status records
are the intended additions. No commit, push, merge, tag, Release or Pages deploy.
Main and v0.2.0 remain `0cb82c0a446a160806596d618bbbc61e16a5752d`.

## C. Toolchain

The actual build recipe resolves SDK `.tools/emsdk`; its generated `LLVM_ROOT`
agrees with the effective path. No SDK/source/tool environment override is set.
The new command list uses the already prepared self-contained M10C3 source tree.

- Node v24.22.1: `D:\tool\nodejs\node.exe`; npm 11.19.1: `D:\tool\nodejs\npm.cmd`.
- Emscripten 6.0.13, revision `e13ee988ce3d87a738dd8f3661d02223308c412a`.
- 7-Zip 26.05, revision `b88c6bc09339de32f7d18bbab900686b244f42ba`.
- Objcopy: `D:\GoodIdea\AniView\.tools\emsdk\upstream\bin\llvm-objcopy.exe`,
  5,608,960 bytes, SHA-256
  `efbf4c32679d4c0cf23ea08d795dab95c1f091e18abea7c65710e4ee208c5b03`.
  `--version` exits 0 and reports LLVM 24.0.0git.
- Existing clang, wasm-ld, llvm-ar and emcc `--version` all exit 0.

No signature status was used as a standalone safety judgment.

## D. Build Attempt

From `D:\GoodIdea\AniView`, using the installed Node:

```text
node tools/extended-archive/prepare-runtime.mjs
node tools/extended-archive/build-runtime.mjs rebuild-1
node tools/extended-archive/package-runtime.mjs
node tools/extended-archive/verify-runtime.mjs
```

All exit 0. Native build stdout, empty stderr, full actual command and exit code
are under `.tools/m10c3/retry-2026-11-11/native-build.*`; the generated full
compile/link arguments are `.tools/m10c3/native-build/commands.json`.
Outputs are `public/vendor/sevenzip/`, copied into the complete `dist/` build.

## E. Root Cause

**Previous Windows blocker: UNKNOWN underlying cause; not reproduced.**
The earlier process-creation error 4551 is historical evidence, not proof that
Defender caused it. No security/provider diagnosis or user setting change is
inferred from the successful retry.

**Current desktop gate: CONFIRMED.** Actual Worker compatibility passed 32 valid
fixture/iteration cases, then failed `nul-name-rar4.rar` with
`UNSAFE_METADATA_ACCEPTED`. Pinned `RarHandler.cpp:350–352` scans a raw name to its
first NUL and stores only that prefix. The original `safe\0hidden.gif` reaches
`GetProperty(kpidPath)` / the product BSTR check as `safe`. The adapter cannot
reject bytes already discarded upstream. Independent actual Worker observation
confirms `ready` with that truncated path. The control-character negative fixture
correctly returns `ARCHIVE_UNSUPPORTED`. Both Workers terminate cleanly.
This is an unmet rejection requirement; no native exploit was demonstrated.

## F. Recovery Actions

Verified installed tool executability, pinned source archives, unchanged recipe,
actual artifacts, source package and production build. Corrected two isolated
test-harness assumptions in ignored local copies: RAR solid entries need not be
in filename order, and Worker progress is not a terminal extraction result.
The original failure logs and mandatory raw-NUL failure are retained.

The first npm ci overlapped a browser harness and encountered an in-use rolldown
module (`EPERM unlink`). After that owned task exited, sequential npm ci passed.
The sandboxed browser attempt hit CDP `Page.enable` timeout; desktop tests then
used the same installed Edge outside the process sandbox, not administrator
security changes. No product code, parser, acceptance requirement or dependency
was changed to hide failures. No security exclusions, tool replacement, WSL,
memory-limit increase or system-security setting changes were used.

## G. WASM Artifact

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| bounded-sevenzip.wasm | 285,966 | `1493f0e368f58632fc9b06e7354eae6bc520f94e97fefc9a39132ca43a4d212a` |
| bounded-sevenzip.js | 70,301 | `f9a5926986d01ff61b453b5dcf3e5c2dd5bfd1e64c03dad8b9a8040fa1335a1e` |
| corresponding-source.tar.gz | 3,618,999 | `39f0e18421b25ed248a45e3ce857e7c2f499c3bd546bd4568db658ecaeb263cc` |

Actual memory section: count 1, flags 1, initial 256 pages / 16 MiB, maximum
1,024 pages / 64 MiB, nonshared. Growth remains enabled. No probe API, dynamic
script eval, shared-memory or thread requirement was added. All 15 manifest
assets and 28 corresponding-source file comparisons pass, including exact
upstream archives, adapter, recipe, portability patch, notices and license texts.
This is engineering distribution verification, not legal clearance. The linear
memory maximum is not a bound on total browser/JS/OS memory.

## H. Validation

- npm ci, lint, typecheck, test, complete build: all exit 0; **95 files / 1,188
  tests PASS**, zero failed/skipped. Root package and lockfile hashes unchanged.
- Actual native policy: **22 checks PASS** (18 boundary fixtures, deadline,
  asset failure, invalid WASM and recovery).
- Native compatibility: **32 valid cases PASS; raw-NUL negative FAIL**. The
  later control-character case independently rejects correctly. Includes medium
  RAR5/7z solid hashes, codecs/filters, six media formats and three repetitions
  of each historical RAR4 encrypted/solid/header credential sequence.
- Actual production UI: six-format RAR4/RAR5/solid/7z Viewer, entry/header
  passwords, wrong/cancel/retry/correct/reuse, conversion Preview/Back, EN/ZH,
  1,280/768/390/360 layouts and short-viewport Cancel scrolling PASS.
- Additional actual UI lifecycle: medium RAR5/7z request dispatch → Cancel →
  automatic reopen → Retry → 1,000×1,000 PNG Viewer; pending source/gallery
  replacement and rapid selected-entry switch PASS. Workers 14/14, active 0,
  cleanup snapshots zero. Cancel before a terminal reply does not prove the
  native decoder had already consumed bytes; no replies/work were mocked.
- Final-dist ZIP/password-ZIP: nine groups/eight encryption fixtures PASS,
  Workers 46/46. Creator three-target regression: 26 groups/five workloads/three
  quality scenes PASS, Workers 257/257. Active resources/cleanup are zero.
- Home/ZIP request zero SevenZip assets; 78 captured requests are same-origin.
  Production `/AniView/` runtime and CSP work without HMR. No Android result is
  inferred from installed desktop Edge or viewport emulation.

Final matching-build size comparison with M10B2: Home JS +9,315 raw / +2,363 gzip
bytes, CSS +1,067 / +243. Extended Worker 10,016 / 3,867; glue 70,301 / 18,555;
WASM 285,966 / 122,647 (raw/gzip). Local reports/logs are in
`.tools/m10c3/retry-2026-11-11/`; native boundaries in
`.tools/m10c3/policy-boundaries/report.json`; corrected product UI/lifecycle in
`.tools/m10c3/retry-product-browser-report.json` and
`.tools/m10c3/lifecycle-product-report.json`.

## I. M10C3 Status

**BLOCKED / NOT CLOSED.** Build recovery succeeded, but the mandatory raw-NUL
rejection gate prevents `PENDING ANDROID RAR/7Z PRODUCT VALIDATION`.
No new phone candidate or URL has been issued. Production remains v0.2.0.

## J. Next Action

No Windows security action is required for the recovered build. The next product
task should reject raw embedded-NUL RAR4 metadata before upstream truncation,
retain the same compiler/safety policy, and rerun native, distribution and desktop
gates. Then freeze a new Android product candidate. This retry deliberately stops
before that product implementation change, per the current task's scope.
