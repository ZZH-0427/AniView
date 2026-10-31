# Milestone 8B2 — Android product validation

Candidate: `2d5c2cc` on `feat/v0.2-static-to-gif`. Tests use the dedicated
LAN production preview without Vite HMR. Public Pages remains v0.1.0.
Evidence is supplied by the user on real Android Edge and Quark; it is not
an independently automated phone trace or reused 8B1 acceptance.

Status: **PASSED (user-reported real Android product acceptance)**.

## Supplied summary snapshots

| Browser | Workload | Target | Started / completed / cancelled | Output bytes | Source canvas / frames |
| --- | --- | --- | --- | ---: | --- |
| Edge | Small | APNG | 2 / 2 / 0 | 1,239 | 64×48 / 6 |
| Edge | Medium | GIF | 2 / 1 / 1 | 19,593 | 320×240 / 40 |
| Quark | Small | Animated WebP | 1 / 1 / 0 | 332 | 64×48 / 6 |
| Quark | Medium | APNG | 3 / 2 / 1 | 36,646 | 320×240 / 40 |

All four supplied objects report `status=success`, `error=null`, Worker
`deflate=true`, canonical `peakRgbaFrames=1`, active decoder/encoder Workers=0,
active bitmaps=0, cleanup errors=0 and encoder WASM live-allocation proxy=0.
Both medium snapshots record a cancellation followed by a completed result.
The user reports no stalls, page reload or crash, and differently named repeated
downloads with earlier files preserved.

Counters are scoped to one ConversionSession and are not summed into an invented
whole-browser total. Source format is absent from the summaries, so no missing
source/target direction is inferred from dimensions or output size. No browser
version, model, timing, heartbeat or individual six-direction JSON is supplied.
Output sizes are observations of these snapshots, not a compression ranking.

## Resource interpretation

Every snapshot has `activeWorkers=1`, `activeArchiveSessions=1` and
`activeObjectUrls=1`. This is expected while the source ZIP and converted result
remain open: the retained Worker belongs to ArchiveSession and the URL belongs
to the valid result. It is distinct from the zero conversion decoder/encoder
counts. These active-session snapshots do not themselves prove cleanup after
closing the entire source/archive; that final check is tracked separately.

The one-frame metric is canonical transfer ownership, not total native browser
memory. Fixed compositor/WASM/stream workspaces remain additional allocations.
No filename, file contents, media pixels or device-local paths are stored here.

## Final coverage follow-up

A compact follow-up confirmed the remaining points for both browsers:

1. All six directions, GIF/WebP/APNG Preview and return to result/source ZIP.
2. Both repeatedly downloaded files can be reopened, as well as preserved.
3. After closing all media/ZIP, active Workers/bitmaps/archive sessions are zero.

The user explicitly replied **“①是 ②是 ③是”**, covering all three points in
both Edge and Quark. Alongside the four success snapshots, recorded medium
Cancel→rerun, no stalls/reloads/crashes and preserved repeated downloads, this
closes the fresh 8B2 product gate. It does not invent per-direction numeric
traces, timing or post-close URL measurements absent from the phone summaries.
Earlier desktop or 8B1 evidence was not substituted. No application changes or
build restart were made during the test/follow-up. See the
[8B2 implementation record](milestone-8b2-animation-conversion-productization.md)
for desktop evidence and unchanged format/resource limitations.

Milestone 8B2: PASSED. GIF / Animated WebP / APNG inter-conversion is
feature-complete on the V0.2 branch. V0.2 is NOT released.
Milestone 8C has not started.
