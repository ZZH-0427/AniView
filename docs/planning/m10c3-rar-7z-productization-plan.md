# M10C3 — narrow RAR / 7z productization proposal

2026-11-05. M10C2 outcome: **PASS WITH LIMITATIONS — READY FOR NARROW PRODUCTIZATION**.
This is the requested next-stage plan, **not implementation or deployment approval**.
No M10C3 code was started. M10C1 audit remains historical and unchanged.

## 1. Decision and scope

RAR: GO WITH LIMITATIONS. 7z: GO WITH LIMITATIONS. Both formats' passwords and
encrypted headers: GO WITH LIMITATIONS. Solid archives: LIMITED by selected
output, hard heap, source-I/O budget and external deadline. Native capability
does not promise arbitrary archive/method/size support.

Initial scope: one File/Blob containing RAR4, RAR5 or7z; read-only metadata and
one selected regular entry at a time; mixed supported media through VirtualFile.
Common7z COPY/LZMA/LZMA2/Deflate/BZip2/PPMd and BCJ/BCJ2/Delta fixture coverage is
the baseline. Unknown methods must fail with a stable error, not trigger a second
unsafe backend. Password ambiguity must be represented honestly.

Exclude multi-volume pairing, SFX guarantees, archive writing/update/delete,
recursive/nested archive browsing, extra backend containers, persistent archive
extraction, OPFS/IndexedDB media storage and unbounded output/block caches.

## 2. Backend provenance and hard requirements

Use the source-built bounded component from7-Zip26.05, revision
`b88c6bc09339de32f7d18bbab900686b244f42ba`, reference sevenzip-wasm26.5.0.
Do not substitute the unrestricted npm prebuilt binary or make the reference
package a production dependency just to retrieve its artifact.

WASM SHA256 `e88132ca3c005a6ed8e9b89cd1f4cf7ad731bffb9301c9caf6712fb989a9ca3e`;
initial16 MiB, compiled maximum64 MiB, nonshared wasm32. Preserve the memory
section assertion in production build validation and a controlled over-cap test.
No cap may depend on a grow observer or metadata being available before allocation.
The64 MiB ceiling bounds linear memory, not all browser/Blob/native/OS memory.

Keep native indexed IInArchive metadata/selection, not CLI listing or path-based
selection. Reject unsafe paths, links/specials, unsafe numeric metadata and
non-whitelisted signatures. Unknown packed/dictionary/block information stays
nullable. Archive and selected-result integrity must be verified before publication.

## 3. First checkpoint: product policy and exact boundaries

Candidate values, inferred conservatively from the measured mobile envelope:
input15 MiB, actual output4 MiB, known dictionary4 MiB, entries1000, path1024 chars,
total paths128 Ki chars, read budget128 MiB, read chunk1 MiB, deadline15 s.
The compiled64 MiB memory ceiling is mandatory. See the evidence/reason table in
the memory report. These are recommendations, not modifications already applied
to AniView or claims that every exact boundary was tested on a phone.

Before UI integration, validate just-below/at/above adopted byte/count/path/read
boundaries, unknown sizes, cumulative path text and minimum-size/high-ratio
archives. The largest spike fixture exceeds15 MiB slightly; regenerate a fixture
inside product policy rather than silently raising the cap. The4 MiB output
candidate is below successful5 MiB selected output, leaving additional room for
Viewer/conversion copies. Do not expose the spike's32 MiB input/8 MiB output
defaults as approved phone policy. Unknown dictionary memory remains bounded by
the heap/deadline, not a fabricated dictionary estimate. The cumulative-path
number has no isolated Android capacity measurement; keep it provisional until
its exact product test passes. Large entry counts have no smooth-UI promise.

## 4. Session design — preserve ZIP

Follow M10C1 Option C: a narrow UI-facing ArchiveSourceSession contract, existing
ZIP ArchiveSession structurally conforming or behind a thin adapter, and a
separate Rar7zArchiveSession. Do not retrofit a generic engine into ZIP internals.

Source factory: inspect signatures → existing ZIP session or extended session.
Home/Open ZIP must never fetch the extended Worker/WASM. Extended session owns
one dedicated Worker/instance, one current verified selected result and transient
credential state. Its VirtualFiles join the existing MediaSession/Viewer pipeline.
No Decoder/Player/renderer format branches by archive type.

Cancellation, close, replacement, resource failure or timeout terminates the
dedicated Worker and settles pending requests. A later attempt creates a fresh
Worker, reopens the source and resolves selection by stable metadata ID. Do not
pretend synchronous native work can receive a queued CANCEL message. Token every
request/result so a previous instance cannot restore old UI or publish stale data.

## 5. Proposed typed backend shape

Keep these public operations, based on the tested `spikes/rar-7z/contract.ts`;
product implementation must add explicit discriminated Worker payload/response
types, boundary validation and the adopted policy type. Do not copy probe methods.

```ts
interface ExtendedArchiveBackend {
  open(source: Blob, options?: { password?: string }): Promise<ArchiveMetadata>
  listEntries(): Promise<readonly ArchiveEntryMetadata[]>
  extractEntry(id: number, options?: { password?: string }): Promise<{
    data: ArrayBuffer
    metrics: ArchiveBackendMetrics
  }>
  cancel(): Promise<void>
  close(): Promise<void>
  getMetrics(): ArchiveBackendMetrics
}

interface ArchiveEntryMetadata {
  id: number
  path: string
  normalizedPath: string
  isDirectory: boolean
  isFile: boolean
  size: number | null
  packedSize: number | null
  encrypted: boolean | null
  solid: boolean | null
  method: string
  attributes: number | null
  dictionaryBytes: number | null
  block: number | null
  special: boolean
}
```

ArchiveMetadata/ArchiveBackendMetrics must be explicit types, not arbitrary
objects. Metrics must distinguish owned resources, allocated linear memory,
source I/O and unobservable OS/native memory. Product booleans normalize the
spike's native0/1/null properties at the adapter boundary. Use safe integers for
sizes/IDs; reject unsafe UInt64-to-JS conversion rather than overflowing.

## 6. Access and errors

Header encryption is an archive-opening gate before enumeration. Entry encryption
is a selected-file gate after listing. Reuse the present labeled password form
where appropriate with archive-level copy, but keep ZIP's accepted password
controller and semantics intact. Extended session owns pending opening input and
one latest fully verified credential; header decryption alone is not full body
verification. Do not persist/log/upload passwords or store argv/native text.

Support REQUIRED, REJECTED where definite, and REJECTED_OR_CORRUPTED where the
engine cannot distinguish. Maintain distinct unsupported/corrupt/resource/timeout/
cancel/asset/initialization categories. Preserve the initialization rejection
regression and HTTP status checks; no dangling factory promise or blind deadline
extension. Load failures must be recoverable without discarding unrelated media.

Initial phone RAR4 errors were not captured with failed-stage traces. Subsequent
three credential sequences per browser and all11 skipped cases passed with the
same native binary. Record the unknown original cause as a release regression
watch item; do not claim transport-only or native root cause. Include repeated
cold opening, asset failure/retry, missing/wrong/correct and header/entry cases
in product acceptance. No universal reliability claim follows from this spike.

## 7. File map

Proposed ADD:

- `src/archive/archive-source-session.ts`, `archive-source-factory.ts`,
  `archive-signature.ts` for the small source/UI contract and dispatch.
- `src/archive/rar-7z-session.ts`, `rar-7z-entry-virtual-file.ts`,
  `rar-7z-protocol.ts`, `rar-7z.worker.ts`, bounded backend/loader/policy/errors.
- Matching behavioral/security/ownership/password tests and minimal fixtures.
- A pinned component asset/source/build manifest and source/notices packaging;
  final asset location should follow existing Vite Worker/WASM conventions.

Proposed localized MODIFY only when productization is explicitly requested:

- `src/app/use-media-source.ts`, `MediaApp.tsx`: source factory and opening gate.
- `src/components/ArchiveInput.tsx`, `ArchiveSummary.tsx`,
  `ArchiveEntryAccess.tsx`, `ArchivePasswordPrompt.tsx`: source contract/labels/
  archive-level prompt copy, without codec logic or ZIP state-machine changes.
- Paired i18n/error messages, README feature/limits and third-party notices.
- Build/release asset checks only as needed for lazy subpath loading and source
  distribution; no product dependency change without fresh justification.

DO NOT TOUCH: existing zip.js archive-engine/session/worker/protocol/policy/errors,
accepted password ZIP internals, Creator, formats/decoders, Player, renderer,
Video, PLAN.md, AGENTS.md, old milestone records or v0.2 release history. If a
specific existing caller needs a wider change, explain it before crossing that
boundary; do not silently rewrite the working ZIP pipeline.

## 8. Validation and release gates

Preserve88 files/1086 existing tests. Add product tests for signature dispatch,
duplicate IDs/Unicode/path safety, links/specials, unknown properties, output CRC/
hash, wrong/correct/header credentials, per-session credential cleanup, exact
policy limits, stale messages, cancellation/reopen, close during open/extract,
source replacement and Viewer/conversion borrowing. Verify original ZIP/password
ZIP paths retain their lifecycle/navigation behavior and never load this engine.

Desktop + new Android Edge/Quark acceptance must cover actual input/password/
navigation/keyboard/translation/Viewer/conversion/Back/close flows. Technical
spike results do not substitute for product UI acceptance. Observe total ownership
while archive/Viewer/conversion coexist; one archive result at a time, no permanent
solid block or full decoded-frame retention. Stop after OOM/reload/crash/freeze.

Vite production `/AniView/`: lazy Worker/glue/WASM and notices/source downloads,
no hardcoded root paths, no CDN or uploads, no new COOP/COEP requirement. Test
offline-local asset resolution and HTTP/invalid-WASM recovery. Keep app startup
free of extended downloads. Product ordinary mode has no research diagnostics.

Before any production distribution, supply the exact corresponding-source/build/
patch/replacement package and full LGPL/unRAR/BSD/runtime notices. Engineering
license assessment is MEDIUM risk, not legal advice or release clearance. AniView's
license is not selected here. Do not ship an anonymous or unrestricted binary.

STOP after this plan. No M10C3 implementation, merge, Pages deployment, version
bump or release is authorized by M10C2 completion alone.
