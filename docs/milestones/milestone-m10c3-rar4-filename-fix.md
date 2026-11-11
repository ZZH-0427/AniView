# M10C3 — RAR4 raw filename validation

2026-11-11. **DESKTOP PASSED.**
**M10C3: PENDING ANDROID RAR/7Z PRODUCT VALIDATION.**
This is a feature-branch checkpoint; production remains v0.2.0.

## Cause and exact native boundary

Pinned 7-Zip26.05 revision `b88c6bc09339de32f7d18bbab900686b244f42ba` reads
RAR4 `NAME_SIZE` at `ReadHeaderReal` (`Get16(p + 19)`) and verifies it fits the
file header. It passes the complete length-delimited field to `ReadName`.
The original `RarHandler.cpp:350–352` scans to the first zero and constructs
`item.Name` from only that prefix. `GetName` / `GetProperty(kpidPath)` then expose
the converted name as native structured metadata. The later AniView BSTR/path
guard cannot see bytes already lost. The original valid-CRC
`safe\0hidden.gif` was consequently published as `safe` by the old actual Worker.

RAR4 flag `LHD_UNICODE` (0x0200) changes the field semantics: a legal first NUL
separates the legacy prefix from compressed Unicode data. That separator and zero
bytes inside the encoded stream are valid. A blanket raw-zero check would break
normal archives; the fix distinguishes that flag before interpreting the field.

## Minimal parser and native binding patch

`tools/extended-archive/rar4-filename.patch` changes only RAR4 `RarHandler.cpp`:

- `ReadName` returns bool and validates before its first truncating SetFrom.
- Non-Unicode names inspect the full declared field; any embedded/trailing NUL
  rejects. Normal legacy conversion and data decompression remain unchanged.
- Separator-form Unicode checks all four encoding modes, complete operands,
  legacy-copy/correction bounds, decoded NUL, surrogate pairing and full stream
  consumption before invoking the existing decoder. The preflight allocates no
  output buffer and stops at the existing 1,024 UTF-16-unit policy boundary.
- No-separator Unicode uses upstream `Check_UTF8_Buf` with truncation disabled;
  malformed UTF-8 cannot fall back to an alternate legacy name.
- The existing Unicode decoder gets at most1,025 units, preserving the full legal
  1,024-unit result plus spare capacity instead of the old max-minus-one truncation.
- `GetProperty(kpidPath)` supplies an internal per-entry Unicode-flag marker.

`native/bridge.cpp` maps parser failure to existing UNSAFE8 / LIMIT4 outcomes.
Header-name parsing precedes the upstream header CRC check; encrypted-header
failure therefore retains existing password-or-corruption7 ambiguity. It cannot
be mislabeled as a proven wrong password or disable the credential retry UI.
The new callbacks are internal native links, not new exported JS/Worker APIs.

Only Unicode-flagged RAR4 paths use literal Unicode conversion, preserving valid
private-use scalars. Unflagged legacy RAR4 escape serialization, RAR5 and 7z are
unchanged. Existing final decoded control/NUL/path traversal/length checks remain.
No Worker protocol, front-end state machine, ZIP/password ZIP, Creator, Viewer,
video chain or safety budget was changed by this fix.

## Regression evidence

The filename fixture generator creates original STORE-only metadata, not a RAR
compressor. Its construction CRC and independent Node zlib.crc32 validator differ.
Every fixture verifies marker, HEAD_SIZE, declared NAME_SIZE/raw bytes, header CRC,
packed/unpacked lengths, data CRC, payload and end record. The original NUL fixture
is byte-identical to the prior failing `nul-name-rar4.rar`. A deliberate CRC
mutation is rejected by the structural checker, rather than counted as a filename
security test. Installed7-Zip independently verifies valid stored payload hashes.

Preserved old production artifact:43 observed cases, only22 matching the desired
policy; original NUL was accepted. The old compressed-name decoder also truncates
the exact1,024-unit boundary and mishandles one private-use case. These before
results remain explicitly not-PASS and are not overwritten by after results.

**Patched actual product Worker:43/43 PASS —19 valid /24 rejected.** Cases cover
non-Unicode names, raw NUL/hidden traversal/trailing NUL, legal separator and zero
operands, all four modes, Chinese/Japanese/Greek/emoji/private-use names,
unflagged legacy UTF-8 compatibility, strict UTF-8, malformed/truncated streams,
copy overruns, decoded NUL/control/traversal/surrogates, and1023/1024/1025 limits.
Three raw-NUL cases must reject during native opening, before listing. Every
Worker closes, no pending requests/resources or unexpected browser errors remain.

Further actual desktop gates:

| Gate | Result |
| --- | --- |
| Native boundaries, deadline, loader failure/recovery |22 PASS|
| Original valid compatibility matrix plus two negatives |34 PASS /195 selected hashes|
| RAR4 historical password/solid/encrypted-header sequences |three iterations per fixture PASS|
| RAR4/RAR5/7z six-format list/Viewer/navigation |PASS|
| Chinese/Japanese RAR4 conversion/Preview/Back/Home |PASS|
| Entry/header password wrong/cancel/retry/reuse, EN/ZH/layout |PASS|
| Medium solid Cancel→native reopen→Retry, replacements/switch |PASS; Workers14/14|
| ZIP/password ZIP |nine groups/eight encryption fixtures PASS; Workers46/46|
| Three-format Creator |26 groups/five workloads/three quality scenes PASS; Workers257/257|
| lint/typecheck/test/complete build |all exit0;95 files /1,188 tests PASS|

Cancellation is observed after a real extraction request and before its terminal
reply; this does not claim that the native decoder had already consumed bytes.
Home/ZIP make no SevenZip requests. Assets work under `/AniView/` with no HMR or
script unsafe-eval; active resources/cleanup return to zero. No test was deleted,
weakened or skipped. The product runner now checks selected path identity instead
of assuming solid archive ordering. Diagnostics remain local, numeric and free
of user media/passwords; test reports use only original public fixture names.

## Reproducible component and distribution

Toolchain:7-Zip26.05 /Emscripten6.0.13 revision
`e13ee988ce3d87a738dd8f3661d02223308c412a` /Node24.22.1. Two complete builds,
each starting with freshly verified/extracted source archives, produce identical
JS/WASM hashes. Actual memory section:one nonshared memory, flags1,
initial256 pages=16MiB, maximum1024 pages=64MiB; growth stays enabled.

```text
bounded-sevenzip.wasm 287473 bytes
bcbd8a4466062683a7e5d5c195be745fe18ea1065a4c6ccfe157dbca230fe970
bounded-sevenzip.js 70301 bytes
19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d
rar4-filename.patch
dfceaf8cd8c094c42830914ef97203c0e86e39f8e3efa7f0031d840be3b14b2a
```

These replace the pre-fix runtime hashes. `apply-native-patches.mjs` verifies
forward/reverse application of exact patches. Successful native builds record
input/artifact hashes; packaging refuses changed inputs or stale artifacts.
Manifest verification covers18 assets, both patches, memory section and build
provenance. The corresponding source includes pinned upstream archives, native
patch/bridge, build/application recipe, adapter, notices/licenses, CHANGES and
component replacement instructions. The legal terms are retained; this records
engineering readiness rather than legal clearance or a new project license.
`.gitattributes` preserves the exact bytes of the hashed vendor component and
its recipe across Windows/Linux checkouts. Patch context retains its structural
whitespace; this does not disable source lint, types or security tests.

Rebuild and run gates in order:

```text
node tools/extended-archive/prepare-runtime.mjs
node tools/extended-archive/build-runtime.mjs rebuild-1
node tools/extended-archive/prepare-runtime.mjs
node tools/extended-archive/build-runtime.mjs rebuild-2
node tools/extended-archive/package-runtime.mjs
node tools/extended-archive/verify-runtime.mjs
```

Then filename-browser → policy-boundary-browser → compatibility-browser →
run-product/lifecycle-browser → ZIP/Creator → npm lint/typecheck/test/build, as
documented in `tools/extended-archive/README.md`.

## Workspace, evidence and next gate

Before edits,75 existing modified/untracked files were copied and SHA-snapshotted
with tracked/staged binary diffs under ignored `.tools/m10c3/nul-fix/`. No work was
discarded. The change set includes the original M10C3 foundation plus native patch,
receipt/distribution integration, regression tools, shipped component and reports.
Main, v0.2.0, historical M10C2 phone failures and production remain unchanged.

Local command/stdout/stderr/exit evidence, before/after fixtures, independent
source/material audit and regression reports are in `.tools/m10c3/nul-fix/`.
Generated fixtures, compilers, RAR evaluation tool, browser profiles, caches and
dist are excluded from Git. No new npm dependency or root lockfile change.

Fresh Android Edge/Quark acceptance is the only milestone gate still open. It
must verify UI/keyboard/Unicode/solid/password/cancel/cleanup, especially the old
RAR4 missing→wrong→correct sequence. M10C2's initial failures remain historical;
their original phone root cause is not claimed to be solved by this name patch.
The [Android record](milestone-m10c3-android-validation.md) describes the prepared
HTTPS production candidate. This task stops before formal phone testing or a
later milestone. No main merge, tag move, version bump, Release or Pages deploy.

Supported limits remain15MiB input /4MiB selected output /recognized4MiB dictionary,
1000 entries,1024/128Ki path units,128MiB reads/1MiB chunk,15s operation deadline.
Single-file read-only archives only; solid work can process prior data. WASM64MiB
is a linear-memory cap, not whole-browser/native/OS memory. Password/damage
ambiguity and JavaScript credential physical-erasure limitations remain.
