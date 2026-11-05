# M10C2 — Bounded RAR / 7z Backend Technical Spike

Date:2026-11-05. **Interim report: desktop complete; Android failure under investigation.**
This document is not a PASS, production dependency approval or M10C3 authorization.

## 1. Status

IN PROGRESS. Desktop gates A–D have evidence. Initial bounded-build Android runs
failed one RAR4 header-password check in each browser; acceptance awaits the
[focused investigation](m10c2-rar4-android-followup.md). M10C1 results do not substitute.

## 2. Branch

Branch `feat/v0.3-rar-7z-spike`, clean base `0ead2ce`. Only isolated spike source,
license materials and new research documents change. Audit branch/main/v0.2.0
and production stay unchanged; no Pages/release/version operation.

## 3. Spike Backend

Reference sevenzip-wasm26.5.0; actual custom7-Zip26.05 source build at
`b88c6bc09339de32f7d18bbab900686b244f42ba`. No production npm dependency.

## 4. Architecture

Blob/File → dedicated module Worker → native indexed SevenZipBackend binding →
bounded WASM → structured entry metadata / transferable selected bytes.
No stdout/CLI/table parser and no archive path mapped to output filesystem.

## 5. Backend Interface

Actual methods: open, listEntries, extractEntry, cancel, close, getMetrics.
`nativeMetrics`, `probeAllocation`, `probeNativeExtraction` are test instrumentation.
Exact TypeScript domain contract: `spikes/rar-7z/contract.ts`.

## 6. Worker Protocol

OPEN/LIST/EXTRACT/METRICS; RESULT/PROGRESS/ERROR, generation+requestId.
CANCEL/CLOSE/deadline terminate from the coordinator: queued messages cannot
interrupt synchronous native decode. This is explicit, not a fake cooperative API.

## 7. Structured Listing

Path/size/type/encrypted/attributes/method come from IInArchive properties, not
printed text. Safe-integer validation rejects overflow. Packed size, dictionary,
solid/block remain nullable when unavailable or shared; unknown is never zero.
7z block IDs and native RAR solid flags are available; per-entry7z solid flag can
remain null. Recognized method dictionaries are partial preflight evidence only.

## 8. Unicode / Path Results

Chinese, Japanese, emoji, spaces, equals and colon names pass hashes. Duplicate
paths retain distinct index IDs and produce distinct expected bytes. Newline,
control/unsafe traversal, long-path and count-bomb fixtures reject before entries
are published. Symlinks and directories are not extractable media.

## 9. RAR

RAR4/RAR5 normal, solid, encrypted data and encrypted headers pass selected
hashes, including first/middle/last solid entries. RAR4 dictionary can be unknown.
This is a fixed fixture matrix, not complete RAR-version/method coverage.

## 10. 7z

Normal/non-solid/solid/password/header encryption pass. COPY, LZMA, LZMA2,
Deflate, BZip2, PPMd, BCJ, BCJ2 and Delta fixtures pass independent source hashes.

## 11. Binary Detection

7z/RAR4/RAR5 signatures select native handlers. Filename extension/MIME is not
used as the authority. SFX and unrelated signatures are not selected.

## 12. ZIP Isolation

ZIP input to the spike rejects with ARCHIVE_UNSUPPORTED_FORMAT. Existing zip.js
ZIP/password ZIP source/config/lock remain untouched. Original1086 tests pass.

## 13. Input Model

Read-only WORKERFS Blob mount; no explicit whole archive ArrayBuffer. Bounded
FileReaderSync reads, observed max1 MiB. See the separate memory report for copies.

## 14. WASM Memory Configuration

Initial16777216, maximum67108864 bytes, growth enabled, one nonshared wasm32
memory. Verified in the emitted binary section as well as compiler flags.

## 15. Dictionary Preflight

Common7z/RAR5 method estimates can reject before selected decode. RAR4/unknown
graphs remain unknown. **NO universal metadata-before-allocation guarantee** for
either format: compressed/encrypted headers can allocate earlier. Hard compiled
maximum and controlled allocation failure are the fallback.

## 16. Output Hard Limit

Declared-size preflight plus native pre-write actual-output cap. A fault-injected
task bypassing declared size stops at1 KiB and releases partial output. Unknown
size is never assumed safe. Native output is freed before JS ArrayBuffer transfer.

## 17. Entry Count / Path Limits

Experimental max1000 entries, path1024 chars, cumulative128 Ki chars. Real1100-entry
and1500-char-path fixtures reject. Numeric unit probes cover NaN, unsafe integer,
negative and fractional metadata. Counts can allocate within the bounded heap
before list publication; the JS guard is not the only native allocation boundary.

## 18. Solid Work

7z first/middle/last source reads measured; RAR4/RAR5 solid bytes match native
oracle. Lazy selected retention does not imply constant-time random access.
Read budget bounds I/O, not decompressed CPU work; external deadline remains.

## 19. Deadline

Configured maxOperationMs enforced by main-thread timer → terminate Worker.
Intentional1 ms deadline test produces ARCHIVE_TIMEOUT without resurrected state.

## 20. Cancellation

No cooperative cancellation claimed. Hard termination, fresh Worker/open/list,
different-entry retry succeeds five times. Reopen26.3–45.8 ms locally including
source retrieval/open and extraction; HTTPS/phone timings differ.

## 21. Lifecycle

Desktop77 created/77 terminated, active0, peak1. Termination removes application
ownership of WASM/mount/output graph. No immediate OS-reclamation claim.
No output Blob URLs are created. Generation/request tokens isolate stale results.

## 22. Repeat Open/Close

10 complete open/list/extract/close cycles pass, with per-instance hash validation.

## 23. Repeat Cancel/Reopen

5 complete cancel/reopen/different-entry/close cycles pass. Close during open
also passes. Cancel/close share the same termination path during extraction.

## 24. Memory Measurements

See [memory boundary results](../research/v0.3-rar-7z-memory-boundary-results.md)
and `m10c2-desktop-evidence.json`.1 /6 /15 MiB inputs retain16 MiB linear heap in
ordinary tests. Dictionary probes grow to20.2 /31.7 MiB; malloc48 MiB grows heap
to51511296.80 MiB allocation and96 MiB dictionary fail below64 MiB maximum.
Compressed83886089-byte header also fails with RESOURCE_LIMIT.

## 25. Desktop

Installed Edge156,69 successful checks,5 intentional cancellations, no browser
errors. Original Node tests3/3; follow-up regression checks4/4; strict contract check passes.
Root lint/typecheck/build and88 files /1086 tests pass.
The exact frozen HTTPS `/AniView/` artifact independently repeats69 checks,
5 cancellations,77/77 Workers, no browser errors, secureContext=true, HMR=false;
max active heartbeat18.5 ms. Source/notices/hash download links are included.

## 26. Android Edge

Initial57 PASS,1 failure: RAR4 header-password outcome ARCHIVE_TIMEOUT.
Workers64/64, active0, maxWasm51511296. Focused follow-up pending.

## 27. Android Quark

Initial57 PASS,1 failure: same case ARCHIVE_BACKEND_ERROR.
Workers64/64, active0, maxWasm51511296. Focused follow-up pending.

## 28. Android Failure Boundary

No OOM/discard inference from summaries. Initial failures remain recorded;
cleanup was balanced. Stop at any new failure, reload/OOM/crash/severe freeze.

## 29. Heartbeat / Responsiveness

Local desktop max active gap17.7 ms, UI coordination off native decode thread.
Initial phone heartbeat36.5 ms Edge /381.1 ms Quark is a signal, not a root-cause
or crash diagnosis. Further observation accompanies the targeted follow-up.

## 30. Bundle

Custom JS70345 /gzip18565; WASM285663 /gzip122511; original Worker5807 /gzip2383 bytes.
Trace Worker5910 /gzip2378 plus initialization helper1287 /gzip617 bytes.
Published reference JS81048 +WASM1171525 raw bytes. No product bundle addition.

## 31. Lazy Loading

Worker/JS/WASM load only after explicit spike OPEN. Normal product imports/build
contain no extended backend. No production entry point or picker extension added.

## 32. Startup

First local small open29.8 ms including fixture fetch/Worker/factory/native open.
Fresh reopen26.3–45.8 ms for the measured cancel tests. Not a pure compile
benchmark or warm persistent-instance claim; every reopen uses a new Worker.

## 33. Password

Required/rejected and an honest PASSWORD_REJECTED_OR_CORRUPTED outcome replace
ambiguous native encrypted-data failures. Correct-password hashes pass. Header
password is supplied at open, content password at extract. No persistence/logging,
CLI argv or production password state machine. Memory is released with Worker;
secure wiping of all native/JS copies is not claimed.

## 34. Corruption

Truncated and damaged payload fixtures produce structured errors and close cleanly.
Malformed compressed-header allocation returns RESOURCE_LIMIT. Raw native text
is never passed to UI/diagnostics.

## 35. Unsupported Method

Synthetic unknown coder returns ARCHIVE_UNSUPPORTED_METHOD; no partial result.

## 36. Security

Indexed native selection; whitelist signatures; no output path injection or
script execution; links/specials unsupported. Heap/output/input/path/read/deadline
guards. No credential/filename/media uploads or runtime CDN. No OPFS/IndexedDB.

## 37. Build Reproducibility

Two complete source builds are byte-identical on this Windows/compiler setup.
Pinned sources, complete recipe and binary hashes are recorded in the
[build/license report](../research/v0.3-sevenzip-wasm-build-license-plan.md).
No cross-host identity or match to the npm prebuilt binary is claimed.

## 38. License

MEDIUM engineering risk. LGPL2.1-or-later, unRAR restriction and applicable
BSD/public-domain/runtime terms retained. Concrete source/notices/build/replace
prototype provided; formal redistribution review still required. No AniView
license change and no legal clearance claim.

## 39. Product Limit Recommendation

NONE approved yet. Test values are64 MiB linear heap /32 MiB input /8 MiB output,
1000 entries /15 s plus path/read budgets. Fresh Android evidence must support
any later product numbers; do not turn successful desktop caps into production policy.

## 40. RAR Product Decision

DEFER pending this spike's Android gate; not a final rejection of RAR.

## 41. 7z Product Decision

DEFER pending the same gate; no automatic M10C3 start.

## 42. RAR Password Decision

No product approval. Native capability demonstrated; ambiguous credential/data
failure requires an honest future access state/message if included.

## 43. 7z Password Decision

Same. Header-opening and selected-entry access must be distinct; do not retrofit
the accepted ZIP password controller to imitate this experiment.

## 44. Solid Archive Decision

Capability measured in both formats. Possible narrow scope only with hard memory,
actual output, cumulative reads and external deadline; phone decision pending.

## 45. Multi-volume

DEFER. M10C1 technical capability is historical evidence; no multi-file selection,
pairing, SFX guarantee or recursive archives implemented in M10C2.

## 46. Recommended M10C3 Scope

Not approved or planned yet. Only after final PASS/PASS WITH LIMITATIONS should
a separate plan freeze format/codec/access exclusions and mobile-backed values.

## 47. Recommended Backend Architecture

Use the actual `ExtendedArchiveBackend` TypeScript contract as the starting point,
omit probe methods, and retain one dedicated instance per extended archive.
Conditional Option C from M10C1: thin UI-facing source contract, unchanged ZIP
session, separate extended session, VirtualFile → existing media pipeline.

## 48. Files to Add in M10C3

Conditional, not implemented: archive-source contract/factory, separate extended
session/VirtualFile/Worker/backend/protocol, source manifest/notices and tests.

## 49. Files to Modify in M10C3

Only after approval: localized input labels/factory/UI-facing access types and
translations/notices. Exact file plan is deliberately not frozen before Android.

## 50. Files Not to Touch

Current zip.js ZIP/password ZIP internals, Creator, Viewer codecs/Player/renderer,
Video, PLAN.md, AGENTS.md, main, tags, production Pages and release history.
None were changed by this task.

## 51. Risks

HIGH if hard heap/deadline guards are removed or unknown graph metadata is treated
as complete preflight. MEDIUM native patch maintenance, mobile total memory,
ambiguous encrypted failures, source packaging compliance. LOW controlled
subpath/lazy integration after the backend's final decision.

## 52. Open Questions

RAR4 Android failure stage/root cause and targeted follow-up outcome.
Unmeasured native/OS memory is a known observability limit, not a fake numeric cap.
Future product release compliance remains distinct from this engineering prototype.

## 53. Final Gate

NOT YET READY FOR M10C3. Android evidence pending. Do not emit a final V0.3 defer
or productization plan merely because this interim report needs a status line.

## 54. Final Verdict

NOT YET RATED. The four permitted final outcomes will be decided only after fresh
bounded-build Android acceptance. No PASS claim from desktop alone.

## 55. Next State

Original frozen production harness `m10c2-bounded-e88132ca` is retained. Separate
`m10c2-rar4-trace-1` provides targeted14-check follow-up with the identical native
WASM and limits. No HMR/Pages deployment. Await Edge/Quark Summary and stage traces,
then decide gates. Do not implement M10C3.
