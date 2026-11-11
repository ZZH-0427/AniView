# M10E-S2 — SevenZip native security backport and RC recovery

2026-11-11. **M10E-S2: BLOCKED. NATIVE-SECURITY-01: STILL BLOCKED.**
The reviewed upstream changes are implemented, rebuilt and pass the existing
native/project regressions below. The new controlled error-propagation harness
has not linked or executed because Windows application control blocks a pinned
tool. This missing verification is not marked PASS. Android RC is NOT READY;
M10E is not passed and M10F is not started.

## Git and candidate identity

Created `feat/v0.3-native-security-backport` from clean `4029a49fd38aff3df43a1a6677ae533c010d6c71`,
preserving `feat/v0.3-rc-audit` and the [M10E-S1 review](../research/m10e-native-security-impact-review.md).
Implementation and clean desktop snapshot source:
`d31abd8dbc4ab9e8b0bcf032b760c719f478ab6f`.
Later evidence/document commits do not identify another tested product build.
The former 8672859 candidate and all its records remain historical evidence.

This is a **held desktop validation snapshot**, not an Android handoff or security
clearance. Package/runtime version stays 0.2.0. Main, v0.2.0, Release and production
Pages are unchanged. Target origin is `https://github.com/ZZH-0427/AniView.git`.
Git closeout checks the final documentation HEAD separately from this tested
implementation; exact local/remote verification is retained with the sync receipt
and final task report, avoiding a self-referential documentation commit hash.

## Exact backport and source provenance

Base 7-Zip 26.05: `b88c6bc09339de32f7d18bbab900686b244f42ba`.
Selected official 26.06 changes: `d3296e39e1f1f92c7b41c0c3848e65640428d42d`.
[Official comparison](https://github.com/ip7z/7zip/compare/b88c6bc09339de32f7d18bbab900686b244f42ba...d3296e39e1f1f92c7b41c0c3848e65640428d42d).

The new [backport patch](../../tools/extended-archive/rar3-inbuffer-2606-backport.patch)
contains only Rar3Decoder.cpp/.h and InBuffer.cpp. There is no additional upstream
dependency: callbacks capture input exceptions, CByteIn stores/resets HRESULT,
Code propagates the captured error, and failed InBuffer reads stop refilling.
Unrelated algorithms, handlers and frontend state machines are unchanged.

| Exact patched source | SHA-256, matching official 26.06 blob bytes |
| --- | --- |
| CPP/7zip/Compress/Rar3Decoder.cpp | `fee600a4b359a12fc38a4a95f057d075a5f34a1eea9ba545915de9049d006d96` |
| CPP/7zip/Compress/Rar3Decoder.h | `0fa7330795ff6a1faddcf9fbe53497d7c6fb57c3c4111e36856c46f08c8b6086` |
| CPP/7zip/Common/InBuffer.cpp | `4264580db28cb2c563c9b416c119a8f82ddad95da09e6844f450b6a2a4451bbf` |

Deterministic patch order is portability → RAR4 filename → RAR3/InBuffer.
First application and reverse-checked repeat both pass. The three resulting
files must match the exact hashes above; partial/mixed source cannot pass by
containing a patch marker. Source comparison against the verified original tar
checks 1,294 files and finds exactly five changes: the above three plus the
existing System.cpp portability and RarHandler.cpp filename modifications.

Initial preparation exposed Git's global autocrlf conversion: patched files
became CRLF and the exact-byte check rejected them before compilation. The helper
now resolves its source root and passes `git -c core.autocrlf=false apply` for
forward/reverse operations. A fresh source directory then passes exact checks.
No global Git setting, system security setting or source semantic was weakened.

## Full native builds and inclusion evidence

Formal installed Node 24.22.1/npm 11.19.1 at `D:\tool\nodejs`; Emscripten 6.0.13.
Two fresh independent work directories compile **189 objects each, then link**
(190 successful steps per build); no old object is reused. Both exit0.
Rar3Decoder, InBuffer and RarCodecsRegister are explicitly present. The header
layout change is included consistently in decoder and allocating factory.

Build commands use the same source and existing flags/ABI/exports:

```powershell
$env:SEVENZIP_SOURCE = (Resolve-Path .tools/m10e-s2/source-lf).Path
$env:SEVENZIP_WORK = '.tools/m10e-s2/native-build-1'
node tools/extended-archive/build-runtime.mjs
$env:SEVENZIP_WORK = '.tools/m10e-s2/native-build-2'
node tools/extended-archive/build-runtime.mjs
node tools/extended-archive/package-runtime.mjs --build .tools/m10e-s2/native-build-2
node tools/extended-archive/verify-runtime.mjs
```

The shipped [schema2 receipt](../../public/vendor/sevenzip/native-build-receipt.json)
records every source/object SHA, linked object, flags, patch state and binary
SHA. Independent readback checks all 378 objects against both receipts; all match,
and the two complete object inventories and emitted binaries are identical.
This is source→fresh compilation→link→artifact evidence, not merely patch presence.
No claim of final per-function symbol visibility in stripped WASM is needed.

## Binary identity and boundaries

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| bounded-sevenzip.wasm | 287,742 | `f0e358b356a3f05372842be90d1023ce148bc82c268922ebf7cad4758641137c` |
| bounded-sevenzip.js | 70,301 | `19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d` |

The JS is independently regenerated by both builds and is byte-identical to the
old glue because its loader/exports did not change. It is not copied from an old
build or artificially edited to force a new hash. The old WASM `bcbd8a44…fe970`
is historical only; the manifest and desktop snapshot use the new WASM above.

Actual WASM memory section: one defined memory, flags1 (not shared), initial
16,777,216 bytes, maximum 67,108,864 bytes. Growth is enabled. Native ABI and
RAR4/RAR5/7z restriction, 15MiB input,4MiB selected output/known dictionary,
15s deadline, 1,000 entries and existing path/read limits are unchanged.
These bounds are not a claim of complete native/browser/GPU memory safety.

## Distribution and licensing evidence

Identification is **7-Zip 26.05 + selected 26.06 Rar3/InBuffer security/error-handling
backport + AniView RAR4 filename patch**, not stock26.06.
Packaging refreshes all three patch copies, corresponding source, build receipt,
manifest, changes, notices and replacement instructions from committed templates.
The source package includes pinned original engine/wrapper archives, exact recipe
and patches; its internal manifest avoids self-reference.

Corresponding source: 3,650,212 bytes, SHA-256
`f64a368ce5e4c94b03ca8a3b4fa7ec89d8d51e31fc04c899ff9ecedfa83addb3`.
Backport patch SHA-256:
`d031e9d5abaa449d63ae2326335014e3652df9c48d34e9efe99c705c24514728`.

Runtime verification passes 20 manifest assets and actual source-tar members,
including recipes, receipt, original archives, source identities and licenses.
Eight independent packaging-contract tests pass, including stale/partial builds,
patch order, header identity, memory/flag changes and asset-hash rejection.
Existing LGPL/unRAR, wrapper and toolchain materials remain. This is engineering
license verification, not legal clearance; AniView's UNLICENSED is unchanged.

## Native and project regressions

| Check | New-runtime result |
| --- | --- |
| RAR4 filename safety | **43/43 PASS**: original raw NUL rejected before listing; valid Unicode separator, Chinese/Japanese/emoji,1024-unit boundary and independent NAME_SIZE/header/data CRC checks retained. |
| Native policy boundaries | **22/22 PASS**: input/output/dictionary/path/count/read/deadline plus loader failure/recovery, unchanged 64MiB compiled maximum. |
| Compatibility | **34 cases /195 byte hashes PASS**: RAR4/RAR5, normal/solid/password/encrypted headers; three iterations of historical RAR4 password/header/solid sequence. |
| 7z codecs/filters | Existing Copy/LZMA/LZMA2/Deflate/BZip2/PPMd/BCJ/BCJ2/Delta fixtures pass; this is measured coverage, not every registered method/combination. |
| npm ci → lint → typecheck → test → build | All exit0 in order. **95 files /1191 PASS**, failed0/skipped0; no baseline tests removed or relaxed. |
| Controlled stream-error unit harness | **BLOCKED / NOT EXECUTED**; detailed below. Does not inherit a PASS from ordinary archive tests. |

The native suites use the rebuilt product WASM and unchanged production backend
sources. The boundary entry is an isolated production test build; it is not a
test hook shipped in the ordinary application. Their output/native artifact
identities are retained locally. Initial browser starts inside the process sandbox
timed out at CDP Page.enable before loading the app. The unchanged suites pass
in normal host Edge with original browser security flags. Initial failures are
retained as TEST ENVIRONMENT evidence, separate from the tool block below.

## Held production snapshot and browser acceptance

Two complete builds from clean implementation commit d31abd8 have
`sourceDirty=false` and identical paths, bytes, SHA and gzip measurements:
**59 assets / 6,049,630 bytes**, up from 57 / 5,957,987 (+91,643 bytes).
Added files are the 56,149-byte native receipt and 2,395-byte backport patch.
No files are removed. Changes are limited to identity and SevenZip runtime/
source/distribution material; existing application JS/CSS/Workers are unchanged.

[Desktop asset manifest](../research/m10e-s2-desktop-asset-manifest.json), canonical
UTF-8/LF SHA-256:
`4874fbe6e66eed03d101a8b6a690f1c16755be02018e7f0605238b41cab459ea`.
The manifest is outside the product and does not hash itself. The local frozen
root is `.tools/m10e-s2/frozen-d31abd8`; this does not authorize Android access.

Actual loopback checks match all 59 HTTP assets and MIME to that manifest.
`/AniView/` works, missing WASM returns404 rather than HTML, POST returns405,
Home does not load SevenZip and legacy Spike queries return Home. Secure context
is true because loopback is trustworthy; HMR is false. No public HTTPS/Android
validation is implied.

Product RAR/7z acceptance passes 6 groups,30 media selections,12 layouts and
13 Home cleanup snapshots. Unicode RAR4/normal/solid/password/encrypted-header
archives reach Viewer and conversion/Preview/Back; selection/navigation/reuse,
EN/ZH and keyboard-size layouts pass. Workers76/76, Bitmaps19/19 and Archives13/13;
all applicable extended Worker/WASM/extraction/pending/plaintext/URL and
cleanupErrors counters return to zero.

Password ZIP regression passes 9 groups/eight fixtures, including ZipCrypto and
AES128/192/256, wrong/correct/reuse/cancel/late result/corrupt/unsupported recovery,
five layouts and EN/ZH. Workers46/46, active0 and browser errors empty.
Cross-feature A/B/C/D passes in a single unchanged Edge157 document: direct
Creator GIF/WebP/APNG, animation conversion, real GIF→MP4 save/native Preview,
video cancel/rerun, EN/ZH, RAR→Close→ZIP→Home and normal7z extraction cancel→
Worker termination→reopen→another media selection. Six controlled repeats,
eight layouts and 16 Home snapshots pass. Final Workers94/94, Bitmaps2/2,
Archives12/12 and URLs10/10; all applicable active resources and cleanupErrors 0.
The external visible heartbeat window peaks 21ms; video's internal window peaks
63.4ms. These are different windows, not total device-memory/performance claims.

The unchanged formal lifecycle suite also passes 4 groups/five cases, including
RAR5/7z medium cancel/reopen, pending-source replacement, loose-gallery replacement
and rapid entry switching. Workers14/14; all final active counts are zero.

The first added cross-feature assertion incorrectly expected a second viewable
entry in medium-solid.7z (one media item plus padding.bin). Its failure and script
are retained. Correcting this added test to use existing multi-media normal.7z
preserves the actual cancellation overlap, termination, reopen and Next assertions;
all original A/B/C checks remain. This is a TEST HARNESS fixture-selection error,
not a product fix or relaxed expectation. No observed app reload/crash or unexpected
browser errors occurs in the passing host suites. No Android result is inferred.

## Remaining verification blocker

The new [controlled stream harness](../../tools/extended-archive/native-error-harness.md)
has 20 prepared cases and compiles its 10 independent objects against exact patched
source. It does not load/create archives or execute an exploit. Its enhanced test
link requires the existing pinned tool:

```text
D:\GoodIdea\AniView\.tools\emsdk\upstream\bin\wasm-emscripten-finalize.exe
SHA-256 0abc535fedc4399022373c3cfe9a54291db2fde33aefc5c0b5875037c20acb92
[WinError 4551] 应用程序控制策略已阻止此文件。
```

Actual failed tool arguments include `--no-dyncalls --bigint
--check-stack-overflow <native-error-harness.wasm> -o <same> --detect-features`.
The same installed executable's `--version` is blocked both inside and outside
the sandbox. This is an observed Windows application-control rejection; the
specific policy/Defender cause is not established. Normal product builds succeed
with their unchanged profile, so this is not a failed product link or evidence
of a decoded archive crash.

No checks, assertions, stack checks, resource limits, toolchain binaries or system
security settings are weakened to bypass it. The user asked to continue other
work and said they cannot handle the system setting; that is not a diagnostic
PASS or permission to waive this gate. Callback error-state/propagation dynamic
verification remains unexecuted, despite the exact source/build and existing
regression evidence. No new product exploitability or universal safety claim is made.

When the installed tool can run in an authorized environment, execute the retained
harness with the same source hashes and checks; then review all results before
closing the security blocker. Additional fixes/rebuilds would require refreshed
receipts, source distribution and candidate regression. Do not auto-start Android.

## Closeout evidence and next state

Raw records remain under ignored `.tools/m10e-s2/`: patch application/source delta,
both 190-step build logs and receipts, native reproducibility, filename/boundary/
compatibility reports, project command exits, frozen manifests, HTTP and product/
password/cross browser results, plus blocked harness receipts. Old M10E/S1 and
M10C2's initial Android failures are not rewritten or removed.

**M10E-S2: BLOCKED — controlled error-propagation verification pending.**
**NATIVE-SECURITY-01: STILL BLOCKED. Android readiness: NOT READY.**
The implementation and other passing checks are preserved; no Android handoff,
M10E RC-READY, M10F, merge/version/tag/Release/Pages action is performed.
