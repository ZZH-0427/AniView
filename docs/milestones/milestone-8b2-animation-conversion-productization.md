# Milestone 8B2 — Animation conversion productization

Status (2026-10-31): **Milestone 8B2 PASSED**. Implementation, desktop product
checks, existing regressions and fresh Android Edge/Quark product acceptance
passed. GIF / Animated WebP / APNG inter-conversion is feature-complete on
the V0.2 branch. 8B1 engineering results were not substituted for this UI gate.
V0.2 is NOT released. Development stays on `feat/v0.2-static-to-gif`.
No main merge, Pages deployment, tag, release or 8C/video work is included.

## Scope and UX

An animated Viewer exposes **More → Convert animation** after binary detection
and successful opening. JPEG, static PNG and static WebP do not expose it.
Home's existing hierarchy is unchanged. GIF creation remains a separate flow.

| Source | GIF | Animated WebP | APNG |
| --- | --- | --- | --- |
| GIF | Disabled: Already GIF | Supported | Supported |
| Animated WebP | Supported | Disabled: Already Animated WebP | Supported |
| APNG | Supported | Supported | Disabled: Already APNG |

Underlying same-format 8B1 capability/tests remain intact. Product target
selection uses native, labelled radio controls with selected/disabled states.
Targets lock during work; Convert, Cancel, Preview, Download and Back retain
accessible names. 320/390/768/1280 widths, long filenames/errors and menu keyboard
Home/End access passed. Fullscreen exits before opening conversion.

Flow: source Viewer → conversion → result → Preview → Close → same result →
Back → original source Viewer. Source handles and list/archive position remain.
The source Viewer is reopened paused at its first frame in Fit; this flow does
not preserve the old playback frame/zoom. Full page reload loses in-memory
sessions, as before. No routing framework or media persistence was introduced.

## Session ownership and architecture reuse

The lazily loaded `ConversionWorkspace` owns a separate `ConversionSession`.
MediaApp remains mounted and owns MediaSession and ArchiveSession. The
conversion session only borrows its readonly VirtualFile and never calls its
release hook. Drops cannot replace the source while conversion is open.

The session stores source metadata, target, status, progress, job ID, one output
Blob/URL, actual output metadata, error and numeric counters. It stores no
CanonicalAnimationFrame array, decoded history or conversion frame cache.

The existing `ConversionJob` and injected transport boundary drive the unchanged
8B1 decoder adapters/coordinator/encoders. A frame follows decoder Worker →
main broker → encoder Worker by transfer, with one canonical RGBA in flight.
Existing compositor/WASM workspaces and compressed outputs are additional
bounded allocations; the ownership counter is not total browser memory.

Viewer teardown is joined before preparation. Metadata comes from the existing
decoder Worker. Initial source duration says **Not measured yet**, rather than
forcing an extra full decode or inventing a value; conversion sums actual source
frame durations and then updates it. Format, dimensions, frame count, plays and
encoded source bytes are available before conversion.

After encoding, a separate decode-back pass signature-detects the Blob and opens
the existing source adapter. A tiny Worker consumes each transferred RGBA and
acknowledges it before the next pull; only duration and metadata are retained.
The result therefore uses actual output frame count, including WebP coalescing,
not the source metadata returned by the original coordinator. Dimensions, plays,
frame-count policy and target-normalized total duration are checked before
publishing a successful result. GIF uses the existing short-delay normalization;
WebP cumulative timestamp rounding allows up to 1 ms total difference.

## Format policies and resource limits

- GIF: existing gifenc 1.0.3, 256 colors, no dithering, alpha threshold 127,
  round(ms/10) timing and existing sub-20 ms decode normalization. Copy warns
  about colors, soft alpha and timing loss.
- Animated WebP: lossless only, existing libwebp 1.6.0. No quality/method/mixed
  controls. Adjacent identical frames may merge; source frame boundaries are
  not promised. The product test measures six inputs becoming three output
  frames while retaining 1.900 s and two total plays.
- APNG: unchanged AniView writer, full-frame RGBA8/filter 0 and native Worker
  CompressionStream deflate. Its output may be larger; no delta optimization.
  Existing source Canvas/compositor precision limitations remain documented in
  [8B1](../spikes/milestone-8b1-unified-animation-conversion.md).

An actual Worker capability probe runs on entry. Unsupported APNG is disabled
with a clear message; other target unsupported errors identify their target.
There is no silent fallback or new codec dependency.

| Guard | Limit |
| --- | ---: |
| Frames | 200 |
| Canvas side | 2048 |
| Canvas pixels | 4,194,304 |
| Width × height × frames | 15,360,000 |
| Encoded source / output | 64 MiB each |

The existing finite play-count and frame-duration guards also remain. Limits
are not raised. Unsafe metadata is rejected before encoder creation. Normal
mode uses a concise browser-safety error; debug additionally shows numeric
dimensions, frame/workload counts and limits. No resize, crop, per-frame editor,
metadata preservation, batch conversion or video is included.

## Progress, cancellation and errors

Preparing, Decoding, Encoding and Finalizing follow coordinator events. The
frame progress value never decreases. Output readback says **Checking output…**
and retains completed source progress rather than resetting the bar. No fake
percentage or unexplained 99% state is displayed.

Cancel aborts the job and any output inspection, joins cleanup, discards partial
output and retains source/target for rerun. Generation IDs reject stale results
and progress. Back also cancels/joins work before returning to the source.
The unit and browser checks cover these paths, including closing during work.

Source read/decode, unsupported source/target, encoding/verification, resource,
cancellation and Worker failures remain separate codes with product messages.
An unreadable archive/file source is not labelled an encoding failure. A failed
rerun can retain its prior valid result; selecting a different target releases
the previous result so its identity cannot be confused with the selection.

## Preview, download and URL lifetime

Preview uses Blob-backed VirtualFile → binary detection → existing AniView
decoder/Player/Canvas Viewer. It uses no native animated img baseline. Closing
Preview joins Viewer cleanup and returns to the same result and URL. Preview
does not append to MediaSession or recursively create another conversion.

Download reuses 8A2's timestamp + per-session nonce + per-activation counter
strategy. A safe, bounded source basename is retained. Extensions/MIME are
`.gif`/`image/gif`, `.webp`/`image/webp`, `.png`/`image/png`; UI calls the last APNG.
Each activation sets another actual filename, independent of browser `(1)`
renaming. Two real saved files were byte-compared, retained and reopened through
the normal Viewer. Gallery indexing remains controlled by the browser/device.

Only one result URL is owned. Preview borrows the Blob directly without another
URL. Replacement, target change and disposal revoke it. Source files and ZIP
entries are never replaced by generated data. ArchiveEntryVirtualFile works
without disk export; returning retains ZIP Next navigation and ordinary lists.

## Diagnostics and privacy

Only `?debug=1` exposes the collapsed Conversion diagnostics / Summary JSON.
It reports status/target, job ID, deflate, conversionsStarted/Completed,
cancellations, activeDecoderWorkers, activeEncoderWorkers, global activeWorkers,
activeArchiveSessions/Bitmaps, peakRgbaFrames, lastOutputBytes, owned URLs,
cleanupErrors, encoder WASM live allocation and numeric resource limits.
No filename, local path, URL, encoded bytes or media pixels enter the JSON.

Conversion Workers finish at zero. An active source ZIP intentionally retains
its archive Worker/session; global activeWorkers can therefore be one while
decoder/encoder counts are zero. Closing the entire source/archive releases it.
No analytics, uploads or third-party media processing were introduced.

## Desktop validation

Formal environment: installed Windows Node 24.22.1/npm 11.19.1 in
`D:\tool\nodejs`. `npm ci`, lint, typecheck, tests and build passed.
**58 files / 750 tests**: 27 new, all prior 723 preserved.

Actual installed desktop Edge product suite passed **22 checks**, including:
six directions; static exclusion/wrong extension; true result timing/plays;
Preview/return; three-output/six-source WebP merge; 1/10/27 ms source becoming
230 ms GIF vs 38 ms WebP; radio/menu accessibility; fullscreen exit; four
viewport widths/long filename/error; real repeated download and reopen;
200×320×240 near-limit Cancel/rerun; 201-frame controlled rejection; Back while
active; ZIP source navigation; ordinary MediaSession navigation.

The report at ignored `.tools/conversion-product/product-report.json` records
130 created/terminated Workers, active=0, 14 created/revoked URLs, errors=[],
and six-direction heartbeat maximum **17.6 ms**. These are desktop observations,
not Android results or arbitrary-file guarantees.

Existing Viewer regression passed **7 groups**; existing Create GIF regression
passed **19 checks**, including source handling, generation, cancellation,
preview, repeated downloads and cleanup. Codec implementation files, Player,
Renderer, MediaSession and ArchiveSession were not changed.

The release UI regression also passed. Its former single-item menu assumption
was updated to assert focus on the actual first item (Convert animation), then
keyboard navigation to Remove. Escape/Tab/fullscreen/layout checks remain.

## Bundle and licensing

Measured Android-accepted candidate `2d5c2cc` (bytes / default gzip bytes):

| Artifact | 8B1 bytes | 8B2 bytes | 8B2 gzip |
| --- | ---: | ---: | ---: |
| Ordinary entry | 289,955 | 291,139 | 88,248 |
| Conversion UI/session/coordinator lazy chunk | Test-only entry 24,044 | 23,210 | 7,283 |
| Shared-target encoder Worker | 45,991 | 45,991 | 16,013 |
| Shared WebP WASM | 394,132 | 394,132 | 159,999 |

The physical conversion chunk includes coordinator code rather than loading a
second coordinator chunk. The 99-byte metadata consumer Worker is separate.
Actual ordinary startup requested no ConversionWorkspace, encoder Worker or
WASM. Entering conversion loads its chunk and Worker probe; WebP encoding
instantiates the same 8B1 WASM artifact. No WASM rebuild or codec rewrite occurred.

No new runtime/test dependencies. Existing libwebp notices and gifenc MIT remain.
The APNG writer and new session/UI are AniView-owned; AniView stays UNLICENSED.
Package manifest/lockfile are unchanged. `npm ci` succeeded but audit now reports
13 moderate development-tool entries rooted in existing minimatch/ESLint:
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
`npm audit --omit=dev` reports zero. No automatic dependency/major-version fix
was applied; this tooling advisory remains a separate maintenance limitation.

## Fresh Android acceptance — passed

Use **production preview without HMR**, never dev or public v0.1.0:

```powershell
node tools/conversion/product-preview.mjs --host 0.0.0.0 --port 4216
```

Both Edge and Quark use `http://COMPUTER_IP:4216/AniView/?debug=1`.
Original sources are delivered as `validation/conversion/small.zip` and
`medium.zip` by this local-only server; they are absent from `public/` and dist.
Run `node tools/conversion/run-product.mjs` to regenerate them and desktop checks.

For each browser, open small ZIP in Viewer, convert each of its three source
formats to the other two, preview GIF/WebP/APNG results and return to source.
Use the medium ZIP for at least one medium conversion plus Cancel→rerun.
Download a result twice, keep both and open both. Confirm source/ZIP navigation.
Provide summary JSON (not media/full diagnostic history) and report response,
reload/crash, capability, cancellation, download preservation and cleanup.

| Browser | Six directions | Preview/back/download | Cancel/rerun | Repeat-save preservation | Outcome |
| --- | --- | --- | --- | --- | --- |
| Android Edge | PASS | PASS | PASS | PASS | User-reported acceptance |
| Android Quark | PASS | PASS | PASS | PASS | User-reported acceptance |
| Android QQ | Not tested | Not tested | Not tested | Not tested | Optional |

The [Android acceptance record](milestone-8b2-android-validation.md) preserves
the four supplied summary snapshots and compact final confirmation. Every
snapshot has deflate=true, peakRgbaFrames=1 and zero active conversion
decoder/encoder Workers, bitmaps and cleanup errors. Each medium snapshot
records Cancel followed by success. The retained archive Worker and result URL
are expected while the source ZIP/result remain open. The user explicitly
confirmed all six directions, three-format Preview/back navigation, both saved
files reopening, and active Workers/bitmaps/archive sessions zero after all-close
in both browsers. No stalls, page reload or crash was reported.

This is new user-operated phone product evidence, not independent automation or
reused 8B1 testing. Missing per-direction timings/diagnostics are not invented.
The formal gate is closed. No codec, UI or build was changed during acceptance.
Milestone 8C has not started.
