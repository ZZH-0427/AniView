# M10C2 — RAR4 Android failure investigation

2026-11-05. **Targeted Android acceptance passed; M10C2: PASS WITH LIMITATIONS.**

## Supplied evidence

Frozen build `m10c2-bounded-e88132ca`, secureContext=true, HMR=false. Both browsers
report57 PASS and fail `password outcomes test_read_format_rar4_encrypted_filenames.rar`.
Edge: ARCHIVE_TIMEOUT, heartbeat36.5 ms. Quark: ARCHIVE_BACKEND_ERROR,
heartbeat381.10000002384186 ms. Each:5 cancellations, Workers64/64, active0,
maxWasm51511296 bytes. Exact data: `m10c2-android-initial.json`.
The user confirmed completion, not that failures should be discarded.

The small suite stopped at the failure, leaving11 later checks unexecuted. The
14 memory and17 lifecycle checks account for the other successes. Their evidence
remains valid, but neither browser's complete suite passed. The counters alone
do not prove page discard, native crash or a particular responsiveness problem.

## Investigation

Local installed Edge repeated missing → wrong → correct RAR4 header credentials
10 times: all expected outcomes and correct bytes passed, Workers30/30. Wrong
credential open40.2–58 ms. This does not rule out a mobile-only native defect.

An independent defect is proven: the old custom instantiateWasm callback did not
forward WebAssembly.instantiate rejection to Emscripten factory readiness. With
the actual factory and invalid WASM, factory readiness remained pending while
an unhandled CompileError occurred. The old code also failed to check WASM HTTP
status and redundantly fetched JS before importing it.

This is a confirmed failure path, **not a confirmed cause of these phone failures**.
The original summaries lack HTTP/load/instantiate/native-stage evidence. Tunnel
reconnects appear in logs but have no established precise correlation. Do not
declare the problem network-only or fixed on Android from desktop results.

## Localized correction and trace

Remove duplicate JS fetch; check WASM HTTP status. Race failed custom
instantiation against readiness: HTTP errors return ARCHIVE_BACKEND_ASSET_FAILED,
compile/instantiate failure returns ARCHIVE_WASM_INITIALIZATION_FAILED. Keep the
15 s deadline and all resource limits. Native bridge/binary are unchanged.

Bounded numeric trace records request/generation, Worker create/terminate,
asset import/fetch/status/size, instantiate/runtime-ready, native open start/return,
sanitized Worker error category and deadline. It excludes passwords, argv, raw
native exception strings, user filenames and media. No uploads or telemetry.

Real browser fault injection: HTTP503 returns ASSET_FAILED in24.1 ms; invalid
HTTP200 WASM returns INITIALIZATION_FAILED in18.3 ms; valid retry succeeds in27.2 ms.
Workers3/3. Regression unit checks4/4. Full desktop matrix remains69 PASS,
5 cancellations,77/77 Workers, active0. Local timings are not phone promises.

## Independent frozen follow-up

Page build `m10c2-rar4-trace-1`, diagnostics `rar4-open-trace-1`.
Same WASM SHA256 `e88132ca3c005a6ed8e9b89cd1f4cf7ad731bffb9301c9caf6712fb989a9ca3e`.
Original frozen files/server stay unchanged.

**Run focused** performs three missing/wrong/correct RAR4 credential sequences
with output hashes, then the11 skipped small checks. Expected14 PASS,
0 cancellations, Workers21/21, active0. Stop at first failure; Summary includes
the final18 trace events and cleanup counters. Large/memory/lifecycle retesting
is unnecessary for this localized loader/diagnostic change with identical native
artifact and bounds.

## User-supplied follow-up and disposition

Both supplied summaries match the new diagnostic version, secureContext=true,
HMR=false,14 PASS, failures=[], lastFailure=null, Workers21/21 and active0.
Edge heartbeat21.5 ms; Quark20.40000009536743 ms. Max observable WASM is16 MiB
for this small-only follow-up; the original memory group's51511296-byte peak
is retained separately. Exact supplied data: `m10c2-android-followup.json`.

This covers three complete retries of the failed credential sequence and the11
previously skipped checks per browser. Together with the original successful
memory/lifecycle checks, the required technical matrix has accepted coverage.
Do not call this a single clean69-check phone run: it is57 earlier successes
plus14 follow-up successes, including repeated coverage; original failures remain.

The original mobile root cause is still unproven because no failed-stage trace
was supplied. Confirmed: the independent initialization rejection bug is fixed,
its fault-injection regression passes, and the native password sequence now passes
three times in each phone browser with the unchanged binary/limits. Do not claim
the original failure was definitely a network issue or native decoder defect.

Disposition: close the focused acceptance blocker with these retained limitations.
No additional failure was reported in the supplied follow-up; subjective UI/OS
memory measurements were not supplied and are not invented. This supports narrow
productization planning, not a universal archive or browser reliability claim.
Do not automatically start M10C3 implementation.
