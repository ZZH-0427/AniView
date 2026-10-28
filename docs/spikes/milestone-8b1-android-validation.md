# Milestone 8B1 — Fresh Android validation record

Status (2026-10-29): **fresh Android Edge and Quark acceptance PASSED
(user-reported)**.

Candidate: `c12bf90` on `feat/v0.2-static-to-gif`. The user tested the dedicated
engineering production build served over the local network, **without Vite HMR**.
This was not the public GitHub Pages release. The evidence below is
**user-reported Android validation**, not an independently operated browser test.

This record concerns the new unified conversion harness. Previous 8A1/8A2
encoder or Creator acceptance is not used as a substitute. Desktop engineering
evidence and implementation limits remain in
[the main 8B1 spike document](milestone-8b1-unified-animation-conversion.md).

## Harness workloads and comparisons

The Android buttons run these four directions in order:

1. GIF → WebP
2. GIF → APNG
3. APNG → WebP
4. WebP → APNG

Small uses 64×48, six frames, the flat procedural scene and two total plays.
Medium uses 320×240, 40 frames, the same scene and two total plays. These are
the harness-defined workloads, not an inference from encoded output sizes.

The harness reports elapsed conversion `totalMs`, output bytes, heartbeat gaps,
canonical ownership counters, comparison results and local runtime resources.
Total conversion time is not encoder-only time. Hash comparisons are against
decoded source canonical frames, with target-specific timing rules, rather
than against a source fixture request that a source container already quantized.

Small cases use full-frame hashes plus pixel samples. Medium cases use
64 sampled pixels per frame; a medium `PASS` does not establish exhaustive
RGBA equality across every pixel. Neither workload establishes universal file
support or a browser-process memory ceiling.

## Quark — Small

The user supplied four complete result JSON objects. All four reported `PASS`.
The following numbers are transcribed from those objects, with times rounded
to one decimal place:

| Direction | totalMs | Output bytes | Maximum heartbeat gap ms |
| --- | ---: | ---: | ---: |
| GIF → WebP | 143.7 | 662 | 16.3 |
| GIF → APNG | 93.7 | 1,241 | 16.6 |
| APNG → WebP | 345.6 | 662 | 16.3 |
| WebP → APNG | 113.1 | 1,241 | 16.1 |

Reported full-frame hash, frame-order/metadata, timing and total-play comparisons
passed. Deflate capability was `true`. Every case reported canonical
`peakRgbaFrames = 1` and `peakFrameBytes = 12288`. Final active resource counters
were zero, with no cleanup errors in the supplied completed results.

The ownership count concerns the canonical RGBA buffer passed between Workers.
It excludes fixed composition canvases, WASM codec workspace, native compression
buffers and delayed garbage collection; it is not a whole-process allocation
measurement.

## Quark — Medium

The pasted medium output has a top-level `PASS` for the four-direction run, but
its middle is missing or mixed in transcription. It is archived here as
**partial transcription**, not reconstructed into four complete JSON objects.
The following direction-specific fields are clearly available:

| Direction | Reported outcome | totalMs | Output bytes | Evidence completeness |
| --- | --- | ---: | ---: | --- |
| GIF → WebP | PASS | 412.9 | 7,576 | Partial pasted result |
| GIF → APNG | Included in top-level PASS | Not provided | Not provided | Middle result missing |
| APNG → WebP | PASS | 977.1 | 7,576 | Partial pasted result |
| WebP → APNG | PASS | 550.8 | 63,920 | Partial pasted result |

The APNG→WebP fragment is identified from its position in the four-direction
run together with WebP encoder metrics and 40 APNG direct-source reads; its
missing row header is not reconstructed as an original JSON field.

Missing GIF → APNG numbers are not copied from another direction, estimated
from another browser, or inferred from expected sizes. No complete per-case
medium resource/heartbeat record is asserted from the malformed pasted middle.
The top-level result supports the user's successful-run report; it does not
recover absent numeric diagnostics.

The fidelity scope for this workload is **64 samples per frame**. A successful
sample comparison is kept distinct from the small workload's whole-frame hash
comparison and from the desktop APNG writer's independent zlib/CRC oracle.

## Edge — User-reported acceptance passed

The user reported completing all three requested parts on Edge. They could not
paste the result JSON because of a phone text-length limit. Accordingly:

- Test completion is recorded as the user's report.
- No Edge per-case time, output size, heartbeat, exact resource count or raw
  diagnostic object is fabricated.
- Quark and desktop measurements are not reused as Edge measurements.
- In the follow-up the user explicitly confirmed small and medium `PASS`,
  `deflate = true`, and final `activeWorkers = 0`, `activeBitmaps = 0` and
  `cleanupErrors = 0`.

At this snapshot there is no independently collected Android Edge trace.
A missing JSON paste is an evidence-format limitation, not evidence of a failed
conversion or an excuse to substitute desktop acceptance.

## Acceptance follow-up and final outcome

The compact follow-up on 2026-10-29 completed the acceptance record:

| Check | User response / evidence |
| --- | --- |
| Edge small and medium both PASS | Explicitly confirmed “是” |
| Edge deflate and zero active Workers/bitmaps/cleanup errors | Explicitly confirmed “是” |
| Cancel → small rerun in both browsers; no stalls, reload or crash | Earlier completion reports plus the closing reply “无卡顿等情况” |

Cancellation/recovery and stability are accepted from the user's combined
completion reports and final confirmation. In particular, Quark's cancel/rerun
check is user-reported; no independent JSON trace of its intermediate cancelled
state is asserted. The final short reply does not supply missing Edge timing
or size measurements, nor does it reconstruct Quark's truncated medium JSON.

The fresh Android gate is passed on this user-reported basis. The WebP
coalescing, general APNG Canvas precision, GIF quantization and allocation-proxy
limitations in the main spike document remain applicable. The recorded Android
acceptance does not introduce product conversion UI or itself start 8B2.
