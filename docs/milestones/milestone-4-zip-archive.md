# Milestone 4 — ZIP archive input

Status: **PASSED**. Local automated tests, real desktop browser checks, CI, Pages
and user-reported Android ZIP acceptance have passed. Android acceptance was
reported on 2026-10-23 using Edge and Quark with the ZIP-specific checklist below.
Milestone 5 has not started. PLAN.md and AGENTS.md are unchanged.

## Dependency and loading

`@zip.js/zip.js` is pinned to **2.23.0**, BSD-3-Clause, with no runtime dependencies.
It supplies ZIP parsing, DEFLATE, ZipCrypto and AES; AniView does not implement a
compression codec. Its licenses and the bundled zlib-streams notices are recorded
under `third_party/licenses/zip.js/` and `public/third-party-notices.txt`.

`use-media-source.ts` imports `archive-session.ts` dynamically after Open ZIP.
That module creates `archive.worker.ts` through Vite's `new URL(..., import.meta.url)`.
Only the Worker imports zip.js. Its internal workers are disabled, avoiding a
second vendor worker deployment path. Its fallback WASM is bundled inline;
there is no CDN or root-relative runtime download.

Production build measurements (decimal kB):

| Asset | Bytes | Gzip bytes |
| --- | ---: | ---: |
| Archive session lazy chunk | 5,705 | 2,042 |
| Archive Worker, including zip.js | 139,053 | 61,541 |
| Main application | approximately 251,300 | approximately 77,530 |

The prior main bundle was approximately 246,960 bytes: the UI/source orchestration
adds about 4.34 kB before gzip. zip.js itself is absent from initial startup.
Real browser network checks verify that neither ZIP chunk nor Worker loads until
Open ZIP. Chunk hashes and sizes can change with subsequent builds.

## Architecture and lifecycle

```text
ZIP File → ZipReader (archive Worker) → ArchiveSession
         → ArchiveEntryVirtualFile → existing MediaSession
         → existing FormatDetector → existing decoder/Player/CanvasRenderer
```

Source responsibilities:

- `src/archive/archive-engine.ts`: metadata iteration, extraction and integrity checks.
- `src/archive/archive.worker.ts` / `archive-worker-protocol.ts`: typed requests,
  cancellation, normalized errors and Worker ownership.
- `src/archive/archive-session.ts`: archive identity, immutable metadata/file list,
  one extracted Blob, cancellation and close lifecycle.
- `src/archive/archive-entry-virtual-file.ts`: ordinary `VirtualFile` reads and release.
- `src/archive/archive-policy.ts`: configurable limits and entry/path decisions.
- `src/app/use-media-source.ts`: source replacement and stale completion guards.

Opening reads central-directory metadata without calling `getData()` on entries.
The UI then automatically opens the first candidate, extracting that entry only.
Entries retain central-directory order; ids distinguish duplicate normalized names.
Directories remain metadata but do not enter MediaSession.

ArchiveSession is distinct from MediaSession. ZIP A replaces ZIP B or a loose-file
list; choosing loose images during archive viewing replaces the archive. The source
queue waits for Viewer decoder/player/file release before closing an old archive
and opening another. Request generations and AbortSignals reject late results.

Previous/Next/Remove reuse MediaSession. Remove changes only the viewing list,
never archive bytes. Removing the last image leaves the archive summary available
until Close archive/Clear. Close aborts extraction, drops the extracted Blob, closes
ZipReader, terminates the Worker and clears metadata and MediaSession. Worker close
has a two-second termination fallback; other requests have a 30-second timeout.
Cancelling either picker preserves the current source.

## Discovery and nested names

Candidates are safe non-directory entries with image extensions
`gif/webp/png/apng/jpg/jpeg/avif/heic/heif/bmp/tif/tiff/svg`, plus extensionless names.
`__MACOSX` segments, `.DS_Store` and `._*` files are hidden. Other extensions such
as `.txt` are not probed. This is a discoverability policy, not format verification:
the existing binary detector determines what an opened entry actually contains.
For example, GIF bytes named `.jpg` still open as GIF. Unsupported/static formats
show the same explicit message as loose files.

Backslashes normalize to `/`; empty and `.` segments are removed. Absolute/UNC
names, drive-prefixed segments, `..`, control characters and bidi override/isolate
characters are blocked. Hostile raw names are replaced with neutral metadata
placeholders and never enter the viewing list. Nested paths are displayed as text,
never used as filesystem paths, resource URLs, scripts or HTML. Safe entries in
the same ZIP remain usable. Symlinks, split-volume and unsupported compression
features are rejected. No tree, breadcrumb, sort or search UI is introduced.

## Encryption and errors

Metadata exposes AVAILABLE, ENCRYPTED or UNSUPPORTED entry access independently
from archive parse success. Encrypted is not corrupted. ZipCrypto and AES metadata,
correct-password extraction and wrong-password errors are covered by actual
fixtures. UI playback reports password-protected and permits navigating to public
siblings; there is no password prompt in this milestone.

`extractEntry(entryId, { password?, signal? })` is the extension point. Passwords
exist only in a request closure/message, are not cached by ArchiveSession and are
never persisted or logged. Same-entry concurrent reads share the active extraction
and its initiating caller's cancellation; entry replacement/close cancels it for
all consumers. Normal VirtualFile reads do not supply separate cancellation owners.

Invalid ZIP, corrupted ZIP, unsupported feature, password-protected, wrong password,
oversized entry and archive safety-limit failures have separate application errors.
CRC/signature checking is enabled for metadata and extraction; AES authentication
checking is enabled. A bad entry does not close the archive or block Next. Empty
and no-media ZIPs open successfully with “No viewable media found in this ZIP.”

## Configurable limits and bomb mitigation

Defaults accepted by `ArchiveSession.open(file, { limits })`:

| Limit | Default | Reason |
| --- | ---: | --- |
| Encoded ZIP | 512 MiB | Useful local collections without unbounded source input |
| Single vendor reader range / central directory | 16 MiB | Bound allocation before metadata iteration |
| Entry count | 10,000 | Bound parser/UI metadata, including hidden entries |
| Per-entry uncompressed media | 64 MiB | Match current decoder encoded-source limits |
| Total declared uncompressed bytes | 2 GiB | Reject extreme archives before extraction |
| Declared compression ratio | 1,000:1 | Conservative preflight for highly compressible media |
| Individual path | 1,024 UTF-16 code units | Bound names |
| Sum of path lengths | 2 Mi UTF-16 code units | Bound retained metadata strings |

All values must be positive finite numbers; byte/count/name values must be safe
integers. Limits are centralized, documented and unit tested. Total counts/sizes
include directories, hidden and unsafe entries, not just media candidates. Small
Zip64 archives work and remain subject to the same limits.

Oversized or excessive-ratio candidates are blocked before `getData()`, while safe
siblings remain navigable. A streaming bounded writer checks each actual output
chunk before retaining it, enforces the configured entry cap and declared size,
and checks exact final size. Extraction accepts AbortSignal; close/replacement can
abort or ultimately terminate a stuck Worker.

These are practical guards, not a proof against every ZIP bomb. A vendor codec
can allocate workspace or produce a chunk before the bounded writer observes it.
The browser also controls Blob storage, structured cloning and garbage collection.
Transient output-chunk/Blob/buffer copies are possible. The timeout and Worker
boundary limit exposure; this is not a fixed whole-process RSS guarantee.

## Memory ownership

The original ZIP Blob and bounded metadata remain for the open session. At most
one current extracted Blob is cached. Switching releases it and re-extracts the
next entry; returning to a previous entry extracts it again. The Worker retains
no visited-entry output cache. Extraction requests are serialized after cancellation.

Each VirtualFile `read()` returns a fresh ArrayBuffer from Blob (including range
reads). Transferring a buffer to a decoder cannot detach the cached Blob or future
reads. Generic `VirtualFile.release()` drops current output on Viewer cleanup;
no archive branch was added to Player, FrameCache or Renderer.

The existing animation cache is separate: normally 16 MiB / six frames; large
frames use the already established two-frame policy up to its existing ceiling.
Archive output metrics measure cached media bytes, not decoded frames or browser
RSS. Memory does not accumulate every previously visited entry.

## Fixtures and tests

`tools/archive/generate-fixtures.mjs` creates tiny test archives from the project's
original GIF/APNG fixtures and an original two-frame red/green WebP. No copied
artwork or large downloaded ZIP is committed. Fixture provenance is recorded in
`tests/fixtures/README.md`; manifest sizes and entry descriptions accompany ZIPs.
ZipCrypto/AES fixtures use the public test-only password `AniView-test`.
The generator also copies only `mixed.zip` and `encrypted-mixed.zip` to
`public/validation/zip/` (1,928 bytes combined) for Pages-hosted Android downloads;
these contain the same original test artwork. GitHub Raw downloads timed out in
the validation environment, so mobile acceptance does not depend on that host.

Cases include empty, three single-format archives, mixed/nested/directory/junk,
no-media, extension mismatch, extensionless, mixed encrypted/public, ZipCrypto,
AES, CRC failure, truncated/corrupt, unsafe names, unsupported compression, small
Zip64, declared oversized entry and excessive ratio. Generator `--large` writes
an ignored 60-entry archive from existing local performance fixtures; it is not
committed.

Formal installed Windows Node v24.22.1 / npm 11.19.1 validation:
`npm ci`, lint, typecheck, tests and build all passed. **25 test files / 276 tests**.
Archive coverage comprises **109 tests**: policy 72, engine 25 and session 12.
These cover metadata/order/filtering, open-with-zero-extractions, one-entry reads,
revisit, fresh buffers after transfer, output guards, limits, encryption, CRC,
cancellation, late completion, release/close and Worker failure.

## Desktop browser results

Real installed Edge 155, production build served under `/AniView/`: **40 ZIP checks
passed**. Covered GIF/WebP/APNG pixels and playback, nested order, navigation,
removal, empty/no-media, encryption and good-sibling recovery, corruption/limits,
rapid switching, superseded source, Close/reopen, ZIP-to-loose and loose-to-ZIP.
390px and 1280px layouts were inspected. Final live Workers: **0** (43 created,
43 terminated; peak 2 = archive + current decoder). All observed 91 frame-buffer
transfers detached correctly; APNG ImageBitmaps returned to zero.

Separate existing WebP viewer, APNG, GIF, multi-file/drag-drop input and WebP spike
real-browser regression suites passed. ZIP formats use their existing decoders.
Browser reports/screenshots are local ignored outputs, not application artifacts.

Observed local cold tiny-archive chunk import: 5.1 ms; metadata: 3.1 ms; first
extraction: 3.2 ms. These are individual desktop observations, not benchmarks.

Large smoke test: **28,813,442 encoded bytes**, 60 entries,
**28,920,060 declared uncompressed bytes**. Metadata: 6.8 ms; first extraction:
9.6 ms; next extraction: 6.8 ms. Selection to first display: 220 ms; next display:
113 ms. First current Blob: 1,001,718 bytes; next: 380,850 bytes; observed peak
cached output: 1,001,718 bytes. FrameCache peak: 3,840,000 bytes / six frames,
16,777,216-byte budget, zero underruns. A 10 ms UI heartbeat had a 12.6 ms maximum
gap across 98 ticks. These are desktop results; large-archive Android performance
was not measured.

## GitHub Pages and Android acceptance

Code release: `ca385310564fef9fd0b8bd06943dd033a0927107`
(`feat: add lazy ZIP archive input`). Publication used the existing credential and
GitHub Git Data API after Git HTTPS returned HTTP 408. Blob/tree/commit hashes were
verified; main was updated without force and the local upstream ref was updated.

[Actions run 39944852456](https://github.com/ZZH-0427/AniView/actions/runs/39944852456)
completed successfully, including Node 24, clean install, lint, typecheck, all tests,
build, official Pages artifact upload and deployment.

Real Edge 155 checks against `https://ZZH-0427.github.io/AniView/?debug=1` passed:
all 40 ZIP checks and all five existing WebP viewer/APNG/GIF/input/spike suites.
Initial resources were main JS/CSS only. The archive-session chunk and archive
Worker (containing zip.js), all decoder Workers and WebP WASM returned HTTP 200
under `/AniView/`. No page exceptions, console errors or resource 404s were observed.
390px and 1280px screenshots were inspected with no horizontal overflow.

The production ZIP run with startup instrumentation ended with 43 Workers created
and 43 terminated, peak two and final zero. All 80 observed RGBA transfers detached
correctly; APNG bitmap ownership returned to zero. This run's session-chunk import
took 356.3 ms (CDP request-to-finished network time 354.7 ms); tiny archive metadata
took 3.0 ms and first extraction 2.9 ms (981 ms selection to display).
`chunkMs` measures the archive-session dynamic import, not isolated zip.js execution
inside its Worker. Worker Resource Timing durations reported negative values under
CDP auto-attachment and are not treated as valid download timings. The first archive
Worker's create-to-ready interval was 262.7 ms, including script loading, ZIP runtime
initialization, metadata parsing and debugger instrumentation. The measurement
harness records timestamps and labels this combined interval explicitly; it does
not claim a separately measured pure zip.js import/download duration.

The 60-entry production smoke test retained the same bounded Blob/frame budgets:
metadata 6.3 ms, first extraction 14.7 ms, next extraction 6.2 ms, first display
226 ms and next display 108 ms. Current extracted WebP was 380,850 bytes, peak
output 1,001,718 bytes; FrameCache peak was 3,840,000 bytes / six frames with zero
underruns. The 10 ms heartbeat maximum gap was 12.1 ms over 110 ticks. These remain
individual desktop observations, not Android conclusions.

Android status: **PASSED — user-reported real-device acceptance, 2026-10-23**.
The user reported “在edge和夸克上做了测试，均无问题” in response to the complete
ZIP-specific checklist, satisfying the mainstream Chromium plus usual-browser
requirement. This evidence is separate from earlier loose-file acceptance.

| Browser | Mixed ZIP / GIF, WebP, APNG / controls / navigation / close-reopen | Encrypted ZIP / public-sibling navigation | Stutter or crash |
| --- | --- | --- | --- |
| Android Edge | Passed, user-reported | Passed, user-reported | No issues reported |
| Android Quark | Passed, user-reported | Passed, user-reported | No issues reported |

The acceptance checklist used these original Pages-hosted samples:

1. [mixed.zip](https://ZZH-0427.github.io/AniView/validation/zip/mixed.zip):
   1,056 encoded bytes, seven metadata entries and three image candidates.
   Open the first GIF, Play/Pause, Next to WebP, Next to APNG, Previous,
   Close archive and reopen the same ZIP.
2. [encrypted-mixed.zip](https://ZZH-0427.github.io/AniView/validation/zip/encrypted-mixed.zip):
   872 encoded bytes, four entries. Public first/last GIFs play; the middle
   ZipCrypto/AES entries show password-protected rather than corrupted;
   Next continues to public content.

The user supplied two successful-playback frame-cache observations. Their ordering
was not explicitly mapped to individual browsers, so neither is assigned a browser:

| Observation | cacheBytes | cachedFrames | peakBytes | peakFrames | maxBytes | underruns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Playback A | 48 | 2 | 72 | 3 | 16,777,216 | 0 |
| Playback B | 72 | 3 | 72 | 3 | 16,777,216 | 0 |

Both encrypted-entry observations showed the expected message:

```text
This ZIP entry is password-protected. Password-protected ZIP playback is not enabled yet.
```

Their frame-cache counters, including `maxBytes`, were all zero, consistent with
an entry that cannot create a playback session. The successful cases had zero
underruns. These are user-provided observations, not an independently witnessed
Android run or a whole-process memory measurement.

Browser versions, device details, archive-specific metrics JSON and a separate
large Android ZIP were not supplied. No Android extraction timings or large-archive
performance claims are inferred. The 60-entry desktop smoke test remains the
measured large-archive evidence; the Android core checklist is complete.

Milestone 4 is closed. Ready for Milestone 5 — Viewer UX as a separately requested
task; no Milestone 5 work was started during closure. No password UI, folder tree,
extract-all, archive editing, RAR/7z, conversion or export is provided.
