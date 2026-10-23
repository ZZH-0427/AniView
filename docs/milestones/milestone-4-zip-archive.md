# Milestone 4 — ZIP archive input

Status: **PENDING ANDROID ARCHIVE VALIDATION**. Implemented with local automated
and real desktop browser validation. Real Android ZIP acceptance remains required;
earlier Android tests for loose images do not establish archive compatibility.
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
gap across 98 ticks. These are desktop results; Android performance is pending.

## GitHub Pages and Android acceptance

Deployment uses the existing Node 24 validation / official Pages Actions workflow.
Runtime assets resolve under `/AniView/`; the release must also pass real production
ZIP and loose-format browser checks after the workflow succeeds. Actual release
results are reported with the release commit and Actions run.

Android status: **Pending user real-device validation**. Use one mainstream
Chromium browser (Chrome or Edge) and one usual browser (Quark or QQ). Download
`tests/fixtures/zip/mixed.zip` from GitHub, open it via Open ZIP and verify:

1. Seven metadata entries, three image candidates; first GIF opens.
2. Play/Pause; Next to WebP, Next to APNG; Previous works.
3. Close archive and reopen the same ZIP; no freeze or crash.
4. Open `encrypted-mixed.zip`: public siblings play; encrypted entry says
   password-protected, not corrupted; Next recovers.
5. If available, repeat with a real ZIP containing dozens of animations. Report
   ZIP size/count, responsiveness, browser and debug archive/frame-cache JSON.

Do not infer a pass from earlier Android loose-file tests. No password UI, folder
tree, extract-all, archive editing, RAR/7z, conversion or export is provided.
