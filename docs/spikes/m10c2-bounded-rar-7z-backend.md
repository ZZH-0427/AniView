# M10C2 — Bounded RAR / 7z Backend Technical Spike

Date:2026-11-05. **M10C2: PASS WITH LIMITATIONS — READY FOR NARROW PRODUCTIZATION.**
This closes the technical spike. It is not a production release/dependency approval
or permission to start M10C3 implementation automatically.

## 1. Status

**PASS WITH LIMITATIONS.** Gate A: compiled hard memory/output/I/O/time bounds
demonstrated, with incomplete metadata preflight explicitly retained. Gate B:
native structured indexed API and honest typed errors. Gate C: termination,
reopen and balanced lifecycle. Gate D: exact source/build/notices/replacement
prototype and two identical native builds. Fresh Android follow-up is accepted;
original failures remain in the [investigation record](m10c2-rar4-android-followup.md).

## 2. Branch

Branch `feat/v0.3-rar-7z-spike`, base `0ead2ce`. Implementation commits
`8efeff1` and `79eecf3`; this report's containing documentation commit is
the closeout (exact final hash in Git log/final handoff). Only isolated spike,
licenses and research/planning documents changed. Remote is synced after the
closeout push, working tree clean. Production code/main/v0.2.0 unchanged.
No merge, release/version/tag or Pages operation.

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

**PASS WITH LIMITATIONS, user-supplied.** Original57 PASS/1 RAR4 header-password
timeout, Workers64/64, active0, maxWasm51511296. Follow-up14 PASS/no failures,
lastFailure=null, Workers21/21, active0, maxWasm16777216, heartbeat21.5 ms.
Three credential retries and11 previously skipped checks passed. Exact JSON in
`m10c2-android-followup.json`; no claim of one clean69-check phone run.

## 27. Android Quark

**PASS WITH LIMITATIONS, user-supplied.** Original57 PASS/1 same-case BACKEND_ERROR,
Workers64/64, active0, maxWasm51511296. Follow-up14 PASS/no failures,
lastFailure=null, Workers21/21, active0, maxWasm16777216,
heartbeat20.40000009536743 ms. Same accepted coverage and retained initial failure.

## 28. Android Failure Boundary

The original RAR4 failure is qualified, not erased. Root cause remains unproven
because no failed-stage trace was supplied. A separate initialization-rejection
defect was reproduced/fixed and regression-tested; subsequent targeted sequences
passed three times per browser with unchanged native WASM/limits. No OOM/reload/
crash conclusion is inferred solely from counters. This is a bounded tested
envelope, not a measured whole-device failure limit.

## 29. Heartbeat / Responsiveness

Desktop active heartbeat17.7 ms; initial phone36.5 ms Edge/381.1 ms Quark;
focused follow-up21.5/20.40000009536743 ms. Decode is in a Worker. These are timer
signals, not independent subjective UI or OS memory measurements; no additional
phone exception was reported in the supplied follow-up summaries.

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

Conservative M10C3 candidates: input15 MiB, selected output4 MiB, compiled
heap64 MiB/initial16 MiB, known dictionary4 MiB; retain experimental entry/path/
read/deadline mechanisms. The [memory report](../research/v0.3-rar-7z-memory-boundary-results.md)
gives reasons, desktop/Android evidence and provisional entries. These are
inferences below observed15 MiB+171-byte input and5 MiB output, not already
tested exact product boundaries. M10C3 must freeze/test each adopted boundary,
especially cumulative path budget and Viewer/conversion coexistence. Do not
approve32/512 MiB input or unbounded dictionaries from this spike.

## 40. RAR Product Decision

**GO WITH LIMITATIONS** for narrow productization planning: single-file RAR4/RAR5,
regular selected entries, mandatory bounded Worker/runtime, stable unsupported
errors and recorded limits. No all-variant or arbitrary-size guarantee.

## 41. 7z Product Decision

**GO WITH LIMITATIONS** for single-file7z and tested common codecs/filters under
the same bounds. Do not expose unrelated backend formats or unrestricted prebuilt
WASM. Unknown methods must fail safely.

## 42. RAR Password Decision

**GO WITH LIMITATIONS** for tested RAR data/header encryption. Keep definite
REQUIRED/REJECTED plus REJECTED_OR_CORRUPTED; no false certainty. Three new RAR4
header credential sequences per browser passed. Product opening/access/keyboard/
translation/replacement acceptance is still M10C3 work, not tested by this harness.

## 43. 7z Password Decision

**GO WITH LIMITATIONS** for tested7z data/header encryption. Prompt before listing
for encrypted headers; verify selected body before promoting a successful
credential. No persistence/logging/uploads and no changes to ZIP password ownership.

## 44. Solid Archive Decision

RAR solid: **LIMITED**.7z solid: **LIMITED**. First/middle/last hashes are tested;
native heap, actual output, cumulative source I/O and external deadline must stay.
Unknown total solid work cannot be precisely preflighted; no full-block retention
or constant-time random-access guarantee.

## 45. Multi-volume

DEFER. M10C1 technical capability is historical evidence; no multi-file selection,
pairing, SFX guarantee or recursive archives implemented in M10C2.

## 46. Recommended M10C3 Scope

The requested [M10C3 proposal](../planning/m10c3-rar-7z-productization-plan.md)
is now created: narrow source/session integration, typed protocol/policy, header
and entry access gates, separate lazy bounded component, source/notices packaging,
ZIP regressions and new product-level Android acceptance. This is a plan only.

## 47. Recommended Backend Architecture

Use the actual `ExtendedArchiveBackend` TypeScript contract as the starting point,
omit probe methods, and retain one dedicated instance per extended archive.
Conditional Option C from M10C1: thin UI-facing source contract, unchanged ZIP
session, separate extended session, VirtualFile → existing media pipeline.

## 48. Files to Add in M10C3

Proposed only: archive-source contract/factory/signature; separate Rar7z session,
entry VirtualFile, typed protocol/Worker/backend/loader/policy/errors, component
asset/source manifest and behavioral/security tests. Exact proposed paths are in
the M10C3 plan. No production files were added in M10C2.

## 49. Files to Modify in M10C3

Proposed localized UI/source changes only: use-media-source, MediaApp, ArchiveInput,
ArchiveSummary, ArchiveEntryAccess, optional archive-level password form copy,
paired i18n/error text, README/notices and asset checks. Existing ZIP parser/
session/password internals remain outside the modification map.

## 50. Files Not to Touch

Current zip.js ZIP/password ZIP internals, Creator, Viewer codecs/Player/renderer,
Video, PLAN.md, AGENTS.md, main, tags, production Pages and release history.
None were changed by this task.

## 51. Risks

HIGH consequence if compiled native/output/deadline safeguards are removed;
universal metadata preflight remains unavailable. MEDIUM residuals: native
maintenance/redistribution compliance, unmeasured total browser memory,
ambiguous encrypted failures and unknown original phone startup cause. LOW:
typed/localized source UI work after policy and regression gates pass.
No unresolved reproduced native correctness or cleanup failure remains in the
accepted matrix; this is not a claim to cover all hostile archives.

## 52. Open Questions

The exact original Android RAR4 failure cause is unknown; retain as a regression
watch item without guessing network/native cause. Product policy exact boundaries,
Viewer/conversion combined ownership and final distribution compliance require
M10C3 acceptance. Native/OS memory beyond observable WASM is not measured.
Technical follow-up acceptance itself is closed.

## 53. Final Gate

**READY FOR M10C3 — narrow productization**, subject to this report's limitations
and the separate plan. This is technical readiness, not production release or
automatic implementation authorization.

## 54. Final Verdict

**M10C2: PASS WITH LIMITATIONS — READY FOR NARROW PRODUCTIZATION.**
RAR: GO WITH LIMITATIONS.7z: GO WITH LIMITATIONS. Password support in both:
GO WITH LIMITATIONS. Solid in both: LIMITED. Multi-volume: DEFER.
The bounded backend demonstrates required resource/lifecycle mechanisms within
the tested envelope. ZIP and password ZIP remain on zip.js2.23.0.

## 55. Next State

M10C2 COMPLETE. Ready for a separately requested M10C3 — RAR /7z Productization.
No implementation of that stage, production dependency, merge, deployment or
release was started. Temporary desktop/phone services are stopped after evidence
is archived; their URLs are historical, not production links. Local ignored
artifacts/source package and numeric evidence remain available for reproduction.
