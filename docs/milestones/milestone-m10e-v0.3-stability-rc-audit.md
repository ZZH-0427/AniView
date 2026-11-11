# M10E — V0.3 stability and release candidate audit

2026-11-11. **M10E: RC-READY / PASSED / CLOSED.**
Native gate **NATIVE-SECURITY-01: CLOSED — VERIFIED BACKPORT WITH INDEPENDENT
LINUX HARNESS**; see the [S2 record](milestone-m10e-s2-native-security-backport.md).
Android Edge and Quark are USER-CONFIRMED FUNCTIONAL PASS / CLEANUP PASS on the
handed-off frozen RC. Quark's one archive error is a USER-CONFIRMED EXPECTED
NEGATIVE PASSWORD TEST, with original counts retained. See the final closeout
below and the [Android record](milestone-m10e-android-rc-validation.md).
M10F is ready for a separately authorized release task, but remains NOT STARTED.

## Identity and scope

Original audit baseline/tested source: `86728599149381455ddbfaba7cd529ccfea11ab6`.
Final accepted RC source: `733df1984919e318348a88c512d68743990bdca6`.
Created `feat/v0.3-rc-audit` from the clean cumulative V0.3 pre-RC branch, not main.
The [scope freeze](../releases/v0.3-scope-freeze.md) remains unchanged. No product,
dependency, lockfile, native patch/binary, safety limit or license is modified.

The candidate is a **development V0.3 functional snapshot with package/runtime
metadata version0.2.0**, not a published0.3.0. Version preparation belongs to M10F.
Later audit-document commits are separate from the actually built/tested source;
they do not mean all different Git HEADs were rebuilt and retested.

The original test/build sections below describe8672859, followed by the historical
S1 decision. The S2 follow-ups identify the d31abd8 desktop snapshot, original
Windows block and later independent Linux resolution; older findings are retained.

## Automated and repeated-build evidence

Installed Node 24.22.1 / npm11.19.1, Windows x64. In order: `npm ci`, lint,
typecheck, test and build all exit0. **95 files /1191 tests PASS, failed0,
skipped0**; no test is removed, skipped or relaxed.

Two complete ordinary production builds were executed while the worktree was
clean at8672859. All57 asset paths, raw sizes, SHA256 and measured gzip sizes are
identical, including JS/CSS, Workers, both WASM components, notices, source and
build identity. Total5,957,987 bytes each. No identity exception is needed.
gzip here is a file measurement, not an assertion about HTTP compression.

[RC asset manifest](../research/m10e-v0.3-rc-asset-manifest.json): SHA256
`43b1fec144b756d03d8a9635c645dd20ac2ed0d551ab54176cc4e8ebff085ea5`.
This digest uses the committed UTF-8/LF representation (or the original generated
manifest); normalize checkout CRLF to LF when verifying this documentation file.
It is outside the product artifact and does not hash itself. The frozen copy is
ignored `.tools/m10e/frozen-8672859`; it was not changed between desktop checks.

## Frozen feature and archive results

These are fresh installed desktop Edge observations on this candidate, separate
from earlier M10A/B/C Android confirmations.

| Gate | Result |
| --- | --- |
| Viewer | PASS: seven core groups, six formats, playback/pause/replay/step/navigation, zoom, close/recovery, visibility intent and viewport/fullscreen handling. |
| Creator | PASS: direct GIF/WebP/APNG,26 groups/five workloads/12 quality cases/nine cancellation checks; ordering/duplicates/timing/loop/alpha/decode-back/Preview/Download. Workers257/257,URLs49/49,1762 transfers detached. |
| Animation conversion | PASS: six directions/22 groups; Preview/Back/download/cancel. Workers130/130,URLs14/14. |
| Animation→MP4 | PASS: seven source cases/eight groups, including GIF/APNG/WebP; actual saved outputs have one video/no audio.64 transparent samples verify white composition; eight semitransparent samples have mean RGB error8.58, a measured lossy-output observation. |
| Video→animation | PASS: H.264/VP9 six directions/22 groups, trim/FPS/size presets/PAR/admission/cancel/rerun and cleanup. Per-document probe counters are not mistaken for all-run totals. |
| ZIP/password ZIP | PASS: ordinary ZIP and nine password groups/eight fixtures, ZipCrypto and AES128/192/256, wrong/correct/reuse/cancel/navigation/return. Workers46/46. No SevenZip load on Home/ZIP. |
| RAR/7z product | PASS: six groups/30 media selections/12 layout observations; RAR4/RAR5/7z, supported solid/password/header/Viewer/conversion/return/cleanup. |
| RAR4 filename security | PASS:43 cases, including19 valid/24 rejected, original NUL rejection before listing, valid Unicode separator/name preservation and independent NAME_SIZE/header/data CRC checks. |
| Native compatibility | PASS:34 cases/195 selected-byte hashes, including three iterations of historical RAR4 password/header/solid fixtures. |
| Native resource boundaries | PASS:22 checks, declared/actual output/dictionary/path/count/read/deadline/terminate and loader failure/recovery. The isolated test entry compiles the same unchanged product backend source with the frozen native bytes; it is not the ordinary product bundle. |
| EN/ZH | PASS:11 groups/110 layout observations/16 Preview returns; files, sources/settings/results, in-flight job identity, Workers, password input and accessible text retained. |
| Responsive | PASS:1280/768/390/360 widths, with an additional1440 observation; Creator, conversion, lists, password/error controls and Preview/Download. Emulation is not a new Android result. |

## Same-document cross-feature A/B/C

All three sequences ran in one Edge 157 page with unchanged document timeOrigin;
no product reload/crash or browser errors. Durations include automation.

| Sequence | Actual coverage | Result / duration |
| --- | --- | --- |
| A | Mixed JPEG/PNG/WebP → WebP → Preview/return → two distinct real downloads → APNG → Preview/download → Home. | PASS /1230.5ms |
| B | Password ZIP unlock → Viewer/conversion/Preview/Back/Next/Previous → Home; password RAR5 → Viewer/APNG conversion/Back/password reuse → Home. | PASS /1518.2ms |
| C | Medium7z extraction dispatch → Cancel → Worker terminate/reopen/Retry; pending medium7z replaced by normal7z → another entry; video Cancel/new job/rerun/Preview; ZIP replaced by password ZIP → Home. | PASS /1387.8ms |

Archive cancellation/replacement actions are observed after actual postMessage
dispatch and before terminal replies. They do not prove native decoding had
already consumed input. The subsequent new selections/results remain correct.
13 Home snapshots pass. Final Workers82/82, Bitmaps2/2, Archives10/10, URLs9/9;
all applicable active Worker/WASM/archive/extraction/pending/plaintext/URL fields
and cleanupErrors are zero.24 extractions started,22 completed: two observed
cancel/replacement operations explain the difference, with no remaining work.

Six controlled repeats cover three encrypted-header 7z open/close rounds and one
Creator generation per target. Eight Creator layouts cover four widths×EN/ZH.
The independent visible heartbeat window peaks at20.2ms; the video job's separate
internal reading peaks at64.7ms. These are different observation windows.

Other harness-visible heartbeat maxima: Creator207.9ms, animation conversion49.1,
MP4 47.6, video46.6, localization50.1. They include fixture generation, pixel
oracles, screenshots and CDP activity, not pure encoding or total system/UI
performance. No observed >250ms gap in those windows, unexpected reload or crash;
no claim about all native/GPU/physical memory is made.

## Environment failures and corrections

- **TEST ENVIRONMENT**: the old localization harness used the fullscreen locale
  selector after Fullscreen API state changed but before React mounted the
  control. Initial failure evidence is retained. Waiting for the real selector
  fixes the harness; three focused fullscreen language cycles and the affected
  complete suite pass. No product code/expectation is weakened; not called flaky.
- **TEST ENVIRONMENT**: an extra asset-browser helper supplied a relative profile
  path and failed before page navigation/CDP. An unchanged retry did not resolve
  it. Correcting that helper to the absolute profile convention used by the
  passing suites resolves the launch; HTTP/legacy-query checks then pass.
- Outdated test selectors/excluded encrypted-ZIP assumptions were documented in
  the test adapters and updated to current frozen product semantics, preserving
  actual password and language assertions. They are not product regressions.

## Runtime/privacy, Pages and distribution

Actual loopback HTTP checks match all57 assets to the frozen manifest. JS/CSS/
WASM MIME and `/AniView/` paths pass; missing WASM returns404, POST returns405.
Actual production queries `?spike=webp` and its debug variant show ordinary Home,
not the old Spike. No HMR, test fixture directories, logs or tool directories are
inside the57-file artifact. Desktop loopback is a trustworthy secure context;
this does **not** claim HTTPS/Android validation.

Application request assertions show same-origin GET/HEAD and local Blob/Data
resources, no runtime CDN, media/password upload or telemetry. Credentials do not
appear in tested storage/URL/network records. Worker traces contain only
event/identity/numeric metadata, not passwords or media. Public synthetic fixture
names are not private user files. Required notices/source/manifest and source
replacement materials pass engineering verification.

Frozen 7-Zip26.05/Emscripten 6.0.13 stays nonshared 16/64MiB with growth. The actual
compiled maximum is64MiB; the test-observed peak is not substituted for this cap.
Input15MiB, selected output4MiB, known dictionary4MiB,1000 entries,
1024/131072 UTF-16 single/total path units, I/O and15s operation limits remain.
No native rebuild occurs. WASM/glue retain the M10C3 hashes in the manifest.

## Security disposition and blocker

See [security/license assessment](../research/m10e-v0.3-security-license-audit.md).
Full npm audit:10 moderate package nodes from one dev-tool advisory; prod-only:0.
Reviewed development exposure is **ACCEPTED LIMITATION**, not automatic release
clearance for separately compiled native code. No dependency auto-fix is used.

**NATIVE-SECURITY-01 — BLOCKER**: official26.06 fixes affect source files present
in the frozen26.05 RAR decoder build. The exact WASM effect is **UNKNOWN**; an
automatic safety check stopped further sample validation before execution.
There is no demonstrated new browser crash/disclosure here, and no false PASS.
Existing parser-negative and resource-boundary passes do not settle this question.

A separate reviewed native impact assessment or minimal remediation is required.
Any changed runtime needs refreshed source/patch/notices/hashes/manifests and
targeted regressions before a new frozen Android candidate. This audit makes no
unapproved fix or upgrade and does not raise limits.

### M10E-S1 static review follow-up

2026-11-11: [native impact review and remediation decision](../research/m10e-native-security-impact-review.md)
completed against documentation HEAD `bf64ca4ff4c9665850a280230d218bd52e1ded7a`.
The tested RC source remains 8672859; this follow-up does not alter or rerun the
preceding test/build facts, execute archives, apply patches or replace artifacts.

- **RAR3/InBuffer: UNKNOWN / NOT EXCLUDED.** The official changes repair callback
  exception/error propagation and failed-reader state on a supported RAR4 decoder
  path. Input errors have a static encrypted-stream edge, but a complete admitted
  trigger and its exact frozen-WASM security effect are not established. No new
  memory-corruption, disclosure, crash or exploitability result is claimed.
- **CAB/LZX: NOT APPLICABLE to the current supported static call graph.** LZX's
  object is a link input, but CAB/CHM/WIM handlers are excluded, no LZX codec
  adapter/registration exists and all 189 linked objects have no incoming NLzx
  symbol. This is separate from the unresolved RAR3 question; it is not a claim
  to have proven every optimized WASM instruction absent.
- Recommend **B — BACKPORT REQUIRED FIX**, in a separate task: exact upstream
  Rar3Decoder.cpp/.h and InBuffer.cpp changes, preserving the existing RAR4
  NUL/Unicode patch, ABI, handlers and limits. The source dependency set is closed,
  but the header changes object layout, so all 189 objects, including the factory
  in RarCodecsRegister, must be rebuilt consistently. A two-object swap is invalid.
- Current static manifest/hash/memory checks PASS; frozen WASM/glue, source package,
  notices and native patches are unchanged. Full tests/build and Android are not
  rerun for documentation-only review. No version/dependency/security setting
  changes, exploit execution or bypass of the original safety stop occurs.

**NATIVE-SECURITY-01: REMEDIATION REQUIRED.** The static decision task is complete;
M10E stays BLOCKED until separately implemented remediation, refreshed distribution,
regressions, a new frozen candidate and the pending Android gate. Android RC/M10F
are not unlocked. Main, v0.2.0 and production remain unchanged.

### M10E-S2 original Windows backport and verification checkpoint

The [S2 record](milestone-m10e-s2-native-security-backport.md) preserves exact
implementation source `d31abd8dbc4ab9e8b0bcf032b760c719f478ab6f`, two fresh
189-object native builds and two identical clean59-file/6,049,630-byte product
builds. Selected26.06 Rar3Decoder.cpp/.h + InBuffer.cpp changes are applied to
26.05; portability/RAR4 filename patches, handlers, ABI and16/64MiB limits stay.
The new WASM hash is `f0e358b356a3f05372842be90d1023ce148bc82c268922ebf7cad4758641137c`;
newly regenerated glue happens to retain its old19aa…de6d hash. Refreshed source,
three patches, receipt, manifest and notices pass distribution verification.

Existing filename43, native boundaries22, compatibility34/195 hashes and
95 files / 1191 tests pass on the changed runtime, with fresh product/password ZIP
and held-snapshot HTTP evidence. The [new asset manifest](../research/m10e-s2-desktop-asset-manifest.json)
is separate from the old8672859 manifest. No product frontend module, package,
lockfile, project license, safety setting or limit is changed.

**S2 remains BLOCKED.** Its20-case controlled stream-error harness compiles objects
but cannot link/execute: Windows application control blocks installed
`wasm-emscripten-finalize.exe` with WinError4551, including a host `--version`
attempt. Assertions/stack checks are not removed to bypass the block. The user
asked to continue other builds and cannot handle that system setting; this does
not waive verification. **NATIVE-SECURITY-01: STILL BLOCKED**, not CLOSED.
The exact-source/fresh-build and other PASS results do not fabricate a harness
PASS. Android remains NOT READY, and M10E/M10F are not unlocked.

### M10E-S2 independent Linux resolution (current)

[Run43009589916](https://github.com/ZZH-0427/AniView/actions/runs/43009589916),
job 130485547565, attempt 1, completed success at test/CI commit
`d7bc6e80e93804f6d539ef730204be1b18fb8444`. Ubuntu 24.04.5/x86_64,
official emsdk 6.0.13, Node 24.22.1: all 20 original native assertions actually
execute/pass, failed0/skipped0 (groups6/6/3/4/1). C++ and the three patched/native
supporting source identities match the frozen Windows build; compile/link limits
and assertions are unchanged. The independently built test WASM is not the shipped
component. Both the job and local checks verify the frozen 20-asset distribution
remains unchanged. [Compact evidence](../research/m10e-s2-linux-harness-evidence.json)
and the S2 report preserve versions, each test, independent hashes and limitations.

**NATIVE-SECURITY-01: CLOSED — VERIFIED BACKPORT WITH INDEPENDENT LINUX HARNESS.**
The separate Windows189-object inclusion/build/product regression evidence and
Linux controlled unit evidence jointly resolve this gate; neither proves universal
native safety or supplies Android acceptance. Original Windows4551 and missing-WSL
records remain failures/not-executed checkpoints, not retroactive passes.
The branch/path-scoped workflow was retained at d2004c2 pending the user's decision.
It was subsequently removed by explicitly authorized forward commit 733df19, with
source, assertions, run evidence and history preserved. It had no secrets, write
permissions or Pages steps. No product code, limit, version or frozen component changes.

## Android preparation and Git checkpoint (historical)

[Android RC record](milestone-m10e-android-rc-validation.md) was Edge **PENDING**,
Quark **PENDING**, cleanup JSON **NOT PROVIDED** at the post-S2 checkpoint. The
native gate permitted the separately authorized preparation follow-up below.
Older M10A/B/C phone results do not substitute. The historical audit loopback
preview was closed after its checks; the new held HTTPS RC is identified separately.

The original audit-only branch remains preserved. Separately authorized S2 CI
and documentation commits are pushed on `feat/v0.3-native-security-backport`;
the S2 desktop product source is d31abd8 and actual Linux CI source is d7bc6e8. Final
M10E closeout then required the separately requested Android results; the final
user evidence is recorded below.
Main/peeled v0.2.0 stay0cb82c0; annotated v0.2.0 stays3f83ab4, and production
Pages remains V0.2.0. No merge/version/tag/Release/Pages operation occurs.

Raw local records: ignored `.tools/m10e/` command/build manifests, `viewer-core/`,
`features/`, `native/`, `cross/`, `security/` and HTTP asset evidence. The
[compact desktop evidence](../research/m10e-v0.3-desktop-evidence.json) and
versioned manifest preserve the result summary without copying full logs.
Known resource/format/solid/password ambiguity/platform codec/download limits
remain accepted; the scoped native gate closure does not remove those limits.

**Historical post-S2 state: READY TO PREPARE ANDROID RC VALIDATION.**
The subsequent explicitly authorized preparation is recorded below; M10F is not started.


## Authorized temporary CI cleanup and Android RC preparation (historical checkpoint)

Cleanup commit `733df1984919e318348a88c512d68743990bdca6` removes only the one-time
workflow and updates its S2 retention explanation. Pages remains byte-identical;
no successful run or Git history is deleted. GitHub HEAD/tree equality and upstream
were checked before the clean build. Later evidence/documentation commits are
separate from the source identity of the held product.

Fresh lint/typecheck, 95 files / 1191 tests and production build PASS on installed
Node 24.22.1/npm 11.19.1. The clean 733df19 build has sourceDirty=false and 59 assets,
6,049,630 bytes. Its [manifest](../research/m10e-android-rc-asset-manifest.json)
canonical UTF-8/LF SHA256 is
`bf8208541f8c26d34c119e6d67baabcd494827656bbf0ec081153332e0f0d93c`.
Only release-candidate.json differs from the S2 snapshot; all 58 product assets
are identical. This is one fresh build, not another two-build reproducibility run.
No native rebuild occurs. Frozen JS/WASM, actual 16/64 MiB nonshared memory, all
limits, three patches, notices/source/manifest and 20 distribution checks remain valid.

[Preparation evidence](../research/m10e-android-rc-preparation-evidence.json)
records the actual installed desktop Edge 157 HTTPS smoke: normal Home/lazy loading,
legacy Spike query returning Home, three animated Viewers, ordinary/password ZIP
without SevenZip loading, one Creator WebP generation/Preview/actual download,
normal/password RAR5 and plain/encrypted-header 7z extraction/Viewer/navigation.
All 59 assets/eight synthetic samples match HTTPS bytes; Workers/WASM use correct
MIME and /AniView/ paths, TLS is secure, HMR=false, no browser errors/reload or
media/archive/password upload is observed. Sixteen Canvas pixel checks/screenshots
and nine Home cleanup snapshots PASS; applicable active/pending/ownership fields
and cleanupErrors are zero. Final Workers 34/34, archive sessions 6/6, URL 1/1.
The historical archiveErrors=1 comes from a deliberate wrong-password test.

The first browser attempt is retained as an automation assertion failure: the
script assumed the same second media filename in differently ordered archives.
The next run validates each archive's actual six-option ordering and full expected
media set, with Next/Previous title/index/format and pixel assertions. It passes on
the same held product; no product behavior is changed or error hidden.

The [Android RC record](milestone-m10e-android-rc-validation.md) supplies the frozen
HTTPS URL, verified public samples, minimal A/B/C steps and required Home JSON.
The temporary static origin/tunnel were kept running for that handoff. Desktop HTTPS
results are separate from Android results; application counters do not measure all
native or GPU memory. At preparation closeout Edge and Quark were both PENDING,
cleanup JSON NOT PROVIDED; the preparation evidence retains that dated state.
Main, version, tag, Release and production Pages remain unchanged.

**Preparation checkpoint: M10E PENDING ANDROID RC VALIDATION. M10F NOT STARTED.**

## Final Android RC acceptance and M10E closeout (current)

The user has now separately confirmed Android Edge and Quark completed the assigned
minimal Creator/archive/lifecycle A/B/C flows without other functional problems,
and supplied their Home Resource Diagnostics. Both are **USER-CONFIRMED FUNCTIONAL
PASS / CLEANUP PASS**. The [Android record](milestone-m10e-android-rc-validation.md)
is the single detailed record of the supplied counters and their provenance;
no phone repetitions, durations, extra codec matrix or device-level hash checks
are inferred. All reported active resources and cleanupErrors are zero, and
reported Worker/Bitmap/archive ownership pairs balance. Both extended snapshots
report peakWasmBytes=16777216 and timeouts=0; this observed peak is not the 64 MiB cap.

Quark retains archiveErrors=1 and extraction counts 16 started/15 completed/0
discarded. The user explicitly confirmed a deliberate wrong-password attempt,
subsequent successful correct-password entry and completion of all assigned tests.
Classification: **USER-CONFIRMED EXPECTED NEGATIVE PASSWORD TEST**. The counts are
consistent with that attempt, but no independent per-request log correlation is
available or claimed. This explained negative test is not an RC blocker.

Accepted candidate is `733df1984919e318348a88c512d68743990bdca6`, attributed to both
phone results through the user confirmation and the existing held HTTPS evidence.
Its canonical [manifest](../research/m10e-android-rc-asset-manifest.json) SHA256 is
`bf8208541f8c26d34c119e6d67baabcd494827656bbf0ec081153332e0f0d93c`.
The later documentation HEAD is not substituted for that product identity.
Frozen JS/WASM match the recorded hashes; read-only native distribution/memory
verification passes without recompilation, binary changes or limit changes.

Retained evidence remains separately scoped: 95 files / 1191 automated tests and
lint/typecheck/build; original desktop cross-feature A/B/C; two-build equality at
8672859 and at S2 d31abd8; the single clean 733df19 build; RAR4 filename regressions;
26.06 selected security backport/fresh Windows component build; independent Linux
20/20; security/license/distribution checks; and the new user-confirmed phone
results. These tests/builds were not rerun during this documentation closeout.
Windows 4551 and M10C2 initial phone failures remain historical facts. The Linux
harness is not a direct 20-case execution on the shipped Windows WASM.

All accepted source/format/resource/solid/password/platform/download limitations
remain. Ownership counters do not measure total browser/native/GPU/system memory;
the prior development-dependency advisory scan is not a new scan or universal
native-safety guarantee. No product, dependency, source patch, runtime, version,
main, tag, Release or production Pages change is part of this closeout.

**M10E — V0.3 Stability & Release Candidate Audit: RC-READY / PASSED / CLOSED.**
**M10F: READY FOR A SEPARATELY AUTHORIZED RELEASE TASK / NOT STARTED.**
Stop here and wait for the user's release task; this verdict does not authorize
release operations.
