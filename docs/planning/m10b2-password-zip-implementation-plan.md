# M10B2 — Password-protected ZIP implementation and productization plan

Date: 2026-11-04. **READY — NOT STARTED.** Planning output of M10B1, not product
implementation or a claim of new Android password-UI acceptance. Baseline:
`feat/v0.3-password-zip` from M10A2 closeout `e57890b`. See the
[exact-version feasibility audit](../research/v0.3-password-zip-feasibility-audit.md)
for shipped-source anchors, actual error strings, experiments and limitations.

## 1. Fixed architecture decision

**Option A is the single recommendation.** Extend the existing ArchiveSession with
one private latest successful password and attempt orchestration. Keep one
Worker/ArchiveEngine/ZipReader and stable entry objects until archive closure.
Pass one credential to the existing per-entry extraction command. Do not migrate
to ZipFS, recreate the Reader on password changes or implement cryptography.

```text
ArchiveInput → useMediaSource → existing ArchiveSession / existing archive Worker
                             ↓ metadata + VirtualFiles
MediaApp current item → archive entry access gate (UI boundary)
                             ↓
           plain or authenticated current entry? → existing Viewer
                             ↓ otherwise
                  Session tries latest successful password once
                     ├─ success → existing Viewer
                     └─ needs input / verification failure
                              ↓
                   inline ArchivePasswordPrompt
                              ↓ explicit submission
                  Session unlocks just the selected entry
                              ↓ complete integrity + size + stale checks
            promote latest password + one cached Blob → existing VirtualFile
                              ↓
              existing detector / Decoder / Viewer / Converter
```

VirtualFile stays a byte-source abstraction. It must never prompt, wait on a UI
callback, carry a secret in metadata, or ask a Worker to create a browser dialog.

## 2. Scope and non-goals

Support standard Traditional ZipCrypto and WinZIP AES-128/192/256 as provided by
**unchanged 2.23.0**, mixed public/encrypted ZIPs, wrong→correct/manual retry,
same-password reuse, skip/Cancel/navigation and conversion from unlocked entries.
Names are normally visible; list metadata without decrypting siblings. Existing
UI auto-selects the first media file; gate that selection if it is encrypted.
Do not invent a new entry-list browser or unconditionally prompt on ZIP open.

Out of scope: strong/proprietary or encrypted-directory implementations,
password recovery/guessing/dictionaries, persisted credentials/plaintext, multi-
password candidate arrays, archive creation, RAR/7z, Service Workers, OPFS/IDB,
codec/video changes, dependency upgrade, version bump, main merge/release/Pages.

## 3. State and API proposal

The following names describe **proposed** additions, not APIs already implemented:

```text
ArchiveSession (existing owner)
├─ existing Worker, metadata, VirtualFiles, cache, active extraction
├─ latestSuccessfulPassword?: string                 [private, at most one]
├─ existing extraction generation / active controller
└─ current attempt identity and joined settlement

ArchiveEntryAccess (React archive-flow gate)
├─ archive ID + entry ID + selected-item generation
├─ access: checking | needs-password | unlocking | ready | locked | error
├─ current UI AbortController / stale selection token
└─ selected-entry prompt dismissal flag (not a password)

ArchivePasswordPrompt (React local state)
├─ typed input
├─ show/hide boolean
└─ code-only inline error and submitting state
```

Proposed narrow Session methods:

- `ensureEntryAvailable(entryId, {signal})`: validate entry/policy; reuse fully
  authenticated current cache, or try one latest credential, or return a typed
  password-required error. Never interact with UI or enumerate/extract siblings.
- `unlockEntry(entryId, password, {signal})`: replace/join any obsolete attempt,
  extract with this explicit input, and promote it only after full successful
  output validation and current-generation checks.
- Existing `extractEntry(entryId, options?)` remains the VirtualFile transport.
  Its implicit encrypted-read path resolves the Session's private credential and
  current authenticated cache. Its existing explicit option is not persistence.
- Use existing `releaseEntry` and `close`; clear private credentials in `close`
  and transport-failure termination immediately, before waiting for shutdown.

Exact public/internal factoring can remain small, but these ownership and retry
semantics are fixed. Never expose typed/password state in Session.metrics or
generic JSON snapshots. Do not introduce a global state framework/provider.

### Two verified integration traps

1. The current encrypted/no-password guard precedes the current Blob cache.
   Move authorization/candidate resolution into Session so later VirtualFile.read
   works after a successful unlock. One manual pre-extraction is insufficient.
   A fully authenticated cached Blob is not a password-checking oracle; UI must
   not offer credential validation against an already unlocked cached file.
2. Current same-entry active extraction coalescing ignores changed credentials.
   A new submission must cancel and await the old attempt before starting a new
   one. It must not inherit an old wrong-password promise. Ordinary concurrent
   detector/decoder reads still coalesce into the same authenticated operation.

## 4. Recommended entry access state machine

```text
ENTRY_SELECTED (archive ID, entry ID, selection generation)
  → validate blocked/unsupported/size metadata first
      blocked → ENTRY_ERROR (skip/close available; no password request)
  → wait for preceding Viewer transition cleanup
  → plain entry → EXISTING_VIEWER (normal lazy materialization)
  → encrypted entry
      authenticated current Blob → READY → VIEWER
      otherwise latest successful credential exists?
        YES → TRY_CACHED_ONCE
                success + current → READY → VIEWER
                verifier rejection → drop candidate → NEEDS_PASSWORD
                ZipCrypto late integrity ambiguity → drop candidate → AMBIGUOUS_INPUT
                AES auth/corrupt/unsupported/limit/Worker failure → ENTRY_ERROR
        NO → NEEDS_PASSWORD

NEEDS_PASSWORD / AMBIGUOUS_INPUT
  Submit → UNLOCKING (one attempt; disable duplicate submission)
    complete verified success + current
      → cache latest password + authenticated Blob → clear input → READY → VIEWER
    verifier rejection
      → code-only inline error → NEEDS_PASSWORD (editable input)
    ZipCrypto CRC/inflate/size ambiguity
      → honest password-or-corruption error → NEEDS_PASSWORD (manual retry only)
    unsupported / AES auth / other corruption / guard / Worker error
      → ENTRY_ERROR, no automatic credential retry
    abort / stale → settle and discard; do not publish/cache/open
  Cancel → abort/join current attempt → LOCKED selected entry
             (archive remains; explicit Unlock trigger + Next/Previous/Close)

LOCKED → explicit Unlock → NEEDS_PASSWORD
Any selection change A→B → cancel/join A, clear its input, new generation for B
Any Home / close / replacement → invalidate all tokens, clear password refs,
                               join operation, close Worker/session normally
```

Cancel must not immediately reopen the same prompt from an effect. A new selection
may ask again normally. Any old submitted Promise resolving after archive close,
replacement or B selection is ignored and cannot promote credentials or revive A.
Do not keep the old Viewer decoding while a new unlock starts; use the existing
transition gate, not an arbitrary timeout. Keep navigation outside the transient
prompt so encrypted failures can be skipped.

## 5. Password reuse and ownership

**One latest successful value**, no candidate list. Same secret on next entry is
tried once; a failed automatic credential is removed. New success replaces the
old value. Different-password A=X/B=Y/back-A may ask for X again: this deliberate
V0.3 behavior is acceptable and testable. Public entries never replace the cached
secret. No failed input is stored as a candidate, and no automatic retry loop.

| State | Owner | Lifetime | Removal |
| --- | --- | --- | --- |
| Typed/failed input | prompt local state | same active panel, may be edited after rejection | success, Cancel, selection change, close/replace, unmount |
| Show/hide | prompt local boolean | same panel | same boundaries; default hidden on reopen |
| Attempt input | transient Session call + Worker extraction | one joined operation | clear transient references on settlement/abort/stale |
| Latest successful input | private ArchiveSession | current archive only, maximum one | failed automatic attempt, replacement by success, close/terminate |
| Pending entry/token | Session extraction + UI selection token | one selection/attempt | switch/Cancel/close/replacement/success |
| Plaintext Blob | existing Session cache | current materialized entry | release/switch/close/terminate |

Do not trim whitespace, convert case or normalize Unicode without evidence.
Empty input can remain disabled since core treats empty as absent. Allow paste.
Dropping JS/string/structured-clone references is the security goal; never claim
physical secure wiping. Password→plain output in browser memory is required.

## 6. Metadata and error boundary

Preserve all current path/size/compression guards. Add normalized, nonsecret
encryption kind (`none | zipcrypto | aes | unsupported`) and optional AES strength
to ArchiveEntryMetadata if needed for the error context; derive them from vendor
encrypted/rawBitFlag/extraFieldAES fields in ArchiveEngine. Do not use extensions
or the UI item's position as an entry identity. Archive entry IDs include hidden
entries; MediaSession position is not the metadata index. Use Session ownership
of the selected VirtualFile / its stable entryId, with typed validation.

At the adapter boundary compare actual imported ERR_* constants, not hand-written
message text. The package does not provide error.code for these normal errors.
Map before code-only Worker serialization, retaining cancellation/limit precedence:

| Vendor/condition | Product code proposal | UI action |
| --- | --- | --- |
| no available credential / ERR_ENCRYPTED | existing ARCHIVE_ENCRYPTED | request input |
| ERR_INVALID_PASSWORD | existing ARCHIVE_WRONG_PASSWORD | retry; explain possible damaged encryption header |
| ZipCrypto ERR_INVALID_CRC32 / INVALID_COMPRESSED_DATA / INVALID_UNCOMPRESSED_SIZE | **new ARCHIVE_PASSWORD_OR_CORRUPTED** | honest ambiguous inline error, manual retry |
| AES ERR_INVALID_AUTHENTICATION_CODE | existing ARCHIVE_CORRUPTED | integrity error; skip/close, no automatic retry |
| ERR_UNSUPPORTED_ENCRYPTION / encrypted directory | **new ARCHIVE_UNSUPPORTED_ENCRYPTION** | controlled unsupported state, no futile password loop |
| unsupported compression / unsafe path / split/symlink policy | existing ARCHIVE_UNSUPPORTED | keep existing policy behavior |
| existing actual/declared limit errors | existing specific limit codes | preserve, never reinterpret as password failure |
| plain CRC/size/inflate, malformed/truncated content | existing corruption categories | controlled terminal entry/archive error |
| AbortError | existing aborted transport path | no error toast or password-cache promotion |

AES salt/verifier corruption can raise ERR_INVALID_PASSWORD even with the right
input; ZipCrypto's one-byte check has intrinsic ambiguity. Never promise reliable
mathematical discrimination. Never use checkPasswordOnly to cache a credential.
If the implementation cannot preserve these distinctions, stop for a focused
mapping spike instead of weakening integrity checks or inventing a numeric code.

## 7. Resource limits and failed-attempt disposal

Keep exact existing limits: archive 512 MiB; directory/read allocation 16 MiB;
10000 entries; plaintext entry 64 MiB; declared aggregate 2 GiB; declared ratio
1000:1; path 1024 characters; total paths 2 Mi characters; current cache one Blob;
MediaSession 1000 items. Keep request/close bounds and serial extraction.

Declared encrypted-entry sizes/method/CRC are useful untrusted preflight fields;
do not treat them as successful authentication. Block limits before prompting.
The ratio currently includes encryption overhead in compressedSize and is a
declared container ratio. Do not increase it or claim it proves safe CPU usage.

Every attempt creates a fresh bounded writer. Output size is capped before
retention/copy, and exact actual size checked after getData. Check CRC where
meaningful and AES authentication always. An authenticated read can emit partial
plaintext before its final tag check: those chunks are private to the attempt.
On any rejection, discard chunks/partial Blob/old attempt references; only after
complete success and stale checks cache one Blob and permit detection/decoding.
Use the existing Blob rather than adding a global or visited-entry plaintext cache.

AbortSignal is cooperative through decrypt/inflate/write. Preserve explicit
abort/join, 30 s request bound and 2 s close fallback → terminate. A native KDF or
synchronous chunk might not stop immediately. Do not block the main thread or
create a nested zip.js Worker pool to work around cancellation.

## 8. UI, accessibility and localization

Minimal **inline** archive access panel, with current-file context and navigation:

```text
Password required / 需要密码
[ associated label + password input ]
[ Show password / Hide password ]
inline verifier / ambiguity / integrity error
[ Cancel ] [ Unlock ]
Previous File / Next File + Close archive remain available
```

No global prompt(), decoder-specific dialog or new modal. Focus the input when
the panel opens; Enter submits with preventDefault, Escape cancels only from
inside the panel, repeated submission is disabled while unlocking, errors use
aria-describedby/aria-invalid and a suitable live region, Cancel returns focus
to the selected entry's explicit Unlock trigger. Inline UI needs no modal focus
trap. Reuse FileNavigation without modifying ViewerControls internals.

Recommend autocomplete="off", spellcheck=false, autocapitalize="none"; the app
provides session reuse and this is not a site login/new-account/OTP field.
User agents can override autofill preferences, so make no guarantee of password-
manager suppression. See the [HTML standard](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofilling-form-controls:-the-autocomplete-attribute).
Show/Hide changes only input type and local boolean. Keep input/controls scrollable
with the soft keyboard at 360/390 px and landscape; avoid a fixed overlay hiding
Unlock/Cancel. Locale change while idle must preserve the same pending selection,
update labels/error immediately and never log or duplicate the secret.

Plan paired typed EN/ZH keys for password-required/enter/show/hide/unlock/unlocking/
locked/retry, verifier failure with corruption caveat, ambiguous ZipCrypto failure,
unsupported encryption and integrity error. Reuse existing Cancel/navigation where
appropriate. Update MediaErrorCode's exhaustive i18n mapping. No keys are added in
M10B1 (303 current baseline); record before/after/parity during implementation.

## 9. Viewer, conversion, fullscreen and archive lifetime

Gate encrypted entry access in MediaApp's archive flow **before** Viewer mounts,
not after passing ciphertext to a decoder. Current VirtualFile already returns
plaintext after extraction; no decoder change is needed. Ordinary files/plain
entries keep their existing path. An encrypted first automatic selection is a
valid prompt trigger; an unselected encrypted sibling is not.

Conversion continues to borrow the same VirtualFile while useMediaSource retains
the ArchiveSession. When Viewer unmounts for conversion it may release the cached
Blob; the next read must transparently re-materialize using the session credential.
Back from result/source conversion retains same ZIP and selected entry. Do not
dispose archive ownership merely because the source Viewer was hidden. When
leaving a fullscreen Viewer for another entry, respect existing fullscreen and
teardown gates; the inline archive panel appears in normal flow with no focus
trapped behind an old surface. No fullscreen/password logic belongs in decoders.

Home/Close archive/replace/unmount invalidate selection/attempt tokens, clear
password input and session credential immediately, wait for Viewer/file release,
abort active extraction and close the Worker. ZIP B never tries ZIP A's secret.
Stale errors/submissions must not reopen the archive or replace its current item.

## 10. File-level impact map (M10B2 only)

All names in ADD are new proposed files; MODIFY paths actually exist now.

| Action | Path | Reason |
| --- | --- | --- |
| ADD | src/components/ArchiveEntryAccess.tsx | selected-entry gate and selection-token coordination |
| ADD | src/components/ArchivePasswordPrompt.tsx | local typed input/show flag, inline state and accessibility |
| ADD | src/components/archive-password.css | small keyboard-safe responsive panel |
| ADD | src/components/ArchiveEntryAccess.test.tsx | stale selection, navigation, Cancel and conversion lifetime integration |
| ADD | src/components/ArchivePasswordPrompt.test.tsx | input, focus, Enter/Escape, errors, EN/ZH and secret isolation |
| MODIFY | src/app/MediaApp.tsx | gate only selected encrypted archive files; preserve conversion/ordinary paths |
| MODIFY | src/archive/archive-session.ts | one private credential; same-entry retry/cancel; implicit cache/read authorization; clear on close/terminate |
| MODIFY | src/archive/archive-engine.ts | derive encryption metadata and context-aware adapter error mapping |
| MODIFY | src/archive/archive-policy.ts | normalized encryption metadata / unsupported-encryption blocked category if necessary; no limit increases |
| MODIFY | src/archive/archive-session.test.ts | credential scope, coalescing, release/retry/replacement/stale guarantees |
| MODIFY | src/archive/archive-engine.test.ts | encrypted integrity/ambiguity/unsupported mapping and bounded writers |
| MODIFY | src/archive/archive-policy.test.ts | encrypted sizes/ratio/total and safe metadata |
| MODIFY | src/media/errors.ts | explicit stable unsupported/ambiguous codes, no raw secret fields |
| MODIFY | src/i18n/messages.ts, src/i18n/media-errors.ts | paired password/access/error text and exhaustive stable-code mapping |
| MODIFY as needed | src/i18n/messages.test.tsx, src/i18n/localization-ui.test.tsx | typed key parity and live error/label updates |
| ADD small fixtures | tests/fixtures/zip/password-*.zip + manifest.json updates | only minimal synthetic fixtures and provenance, never large generated cases or real secrets |
| ADD documentation | docs/milestones/milestone-m10b2-password-zip.md, milestone-m10b2-android-validation.md | actual implementation/tests/phone acceptance and limits |

**DO NOT TOUCH by default:**

- `src/archive/archive-entry-virtual-file.ts`: Session can transparently supply
  credentials; current read/slice/release contract needs no UI/password fields.
- `src/archive/archive.worker.ts`, `archive-worker-protocol.ts`: password/cancel
  forwarding already exists; metadata/error unions flow through their imports.
- `src/app/use-media-source.ts`, `src/media/media-session.ts`: existing source
  replacement/navigation gates are reusable; no archive-reopen strategy.
- `src/pages/Viewer/**`, `src/formats/**`, `src/player/**`, `src/renderer/**`:
  reuse bytes and exported navigation controls, no codec/playback changes.
- `src/creation/**`, `src/conversion/**`, `src/video/**`, `src/video-source/**`,
  `src/video-conversion/**`: no Creator, canonical frame source, encoder,
  video/Mediabunny work; existing Workers stay under their current subsystem paths.
- `package.json`, `package-lock.json`, `.nvmrc`, `.github/workflows/pages.yml`,
  `vite.config.ts`, PLAN.md, AGENTS.md, V0.2 release docs, M10A1/M10A2 historical docs.

If an unexpected required change crosses these boundaries, document concrete
evidence and stop for scope review rather than silently refactoring shared media.
Do not edit nonexistent test files based solely on the proposed names above.

## 11. Fixtures and provenance to retain in M10B2

Use installed 7-Zip-produced tiny ZipCrypto/AES fixtures as independent reads,
plus deterministic generated fixtures for edge conditions. Record producer,
method, strength, known synthetic credential identifier and expected binary/hash
in test-only manifest/documentation. Test credentials are not real secrets and
must not become UI screenshots/log output. Do not use a large archive as a fixture.

Required matrix:

1. Existing plain stored/DEFLATE, empty, wrong-extension, Zip64 and path fixtures.
2. ZipCrypto and AES-128/192/256 with minimal animated GIF/APNG/WebP and static image.
3. Public → encrypted → public → encrypted, same-secret entries and A=X/B=Y.
4. Correct-password corrupted ZipCrypto body, corrupted AES auth tag, damaged AES
   salt/verifier, truncated ZIP and unsupported strong/invalid-strength metadata.
5. Controlled encrypted oversized, ratio-over and aggregate-over declarations;
   actual sink cap/size mismatch, before-password preflight assertions.
6. Large generated encrypted reads for cancellation/partial-auth output under
   ignored `.tools/`; no committed multi-megabyte pressure binaries.
7. Header-false-accept behavior via known controlled fixtures/mocks and source
   semantics; never add password search/recovery logic to create the case.

Audit temporary fixtures/scripts are not promoted automatically; reproduce and
minimize justified M10B2 fixtures with documented provenance. Hidden-directory
mutation tests are structural rejection tests, not interoperability claims.

## 12. Automated tests required in M10B2

Preserve all 1054 existing behaviors, adapting only contracts where genuinely
necessary. Add targeted regression assertions for:

- Plain archive open and first selection unchanged, metadata open extraction=0;
  unselected encrypted siblings do not request input or extract.
- Metadata kind/strength and blocked-policy precedence; no cipher bytes reach
  detector/decoder. Use entry ID, never MediaSession ordinal, for lookup.
- Both encryption families absent/wrong/correct; same Reader and entry identities
  survive retry; only complete success creates a cache/password candidate.
- AES default + explicit auth checks, AE-1 CRC where applicable, corrupt salt
  caveat, CRC/inflate/size ZipCrypto ambiguity, unsupported method vs encryption.
- First cached candidate tried once, failed automatic input removed, successful
  next-entry reuse, mixed public/encrypted, one-latest different-password semantics.
- Cancel prompt leaves archive/current selection usable and does not immediately
  re-prompt; explicit Unlock resumes; Next/Previous while prompting cancels A.
- Close/Home/replace/unmount during prompt/submission/read; late old success,
  error, Blob, candidate promotion and old submit ignored after ZIP B appears.
- Same-entry new-credential attempt aborts/joins the old one; concurrent normal
  reads coalesce; release/range reads/fresh transferred buffers keep existing cache policy.
- Failed partial plaintext/auth output discarded; a fresh writer on retry;
  no partial Blob/URL/cache or media open; actual output and metadata guards unchanged.
- Abort before/during read/decrypt/inflate/write, joined soft close and bounded
  hard termination; no late result resurrects ownership.
- Encrypted GIF/APNG/WebP → normal Viewer; conversion → Preview/Back → same ZIP,
  selected-entry navigation and re-materialization after Viewer release.
- UI label/ARIA/error association, Enter, Escape, show/hide reset, focus return,
  keyboard-safe layout, locale changes preserving current state and typed key parity.
- Privacy spies: no input/secret/length/hash in console/error/diagnostics/network/
  localStorage/sessionStorage/IDB/URL/snapshots; close/terminate private references
  removed, no source request spreading into logs. Test the app's references and
  observable effects, not an impossible assertion of physical memory zeroization.

Only numeric nonsecret diagnostics if useful: prompt/invalid/encrypted-entry counts.
Existing extraction/Worker counters are normally enough; do not invent a password
value/length/hash metric or expose the whole Session for a cleanup test.

## 13. Desktop validation

Run formal Node 24 npm ci/lint/typecheck/full tests/build after implementation,
with 1054 baseline behaviors preserved, then a production `/AniView/` preview:

- Plain ZIP unaffected; independent ZipCrypto/AES128/192/256 wrong→correct and
  same-password next entry; public siblings and different-password policy.
- Selected encrypted entry before Viewer, prompt Cancel/retry, rapid Next/Previous,
  close/replace while submitting, same archive still usable after an error.
- Encrypted animation Viewer controls and conversion/Preview/Back/ZIP navigation.
- Integrity/unsupported/limit/corruption messages stay distinct and retry behavior
  matches the state machine, including no automatic retry for AES auth failure.
- 1280/768/390/360 layouts, keyboard Enter/Escape/tab/focus, long safe entry name,
  both languages and ordinary/debug mode. No original media/password upload.
- Home cleanup: active Workers/Bitmaps/ArchiveSessions/extractions/URLs 0, cache
  empty, no pending password state, cleanupErrors 0. Do not serialize the credential
  to prove it was cleared; use private-state/owner tests and nonsecret counters.
- Lazy bundle/startup comparison: no eager ZIP/crypto on Home, existing archive
  Worker/inline module only, no new external asset/CSP/COOP/COEP requirement.
- Lightweight Creator + ordinary Viewer + existing conversion smoke; no unrelated
  full video matrix unless implementation introduces a shared regression.

## 14. Fresh Android acceptance in M10B2

Freeze a clean production build and fixtures, secure context, no HMR. Give actual
verified URLs (or approved USB localhost), not stale tunnel links. Preserve them
during tests. M10B1's desktop Worker/API results do not replace these phone gates.

**Edge:** plain ZIP; ZipCrypto and AES; wrong→correct; same-secret next entry;
public sibling; encrypted animation Viewer; one encrypted-source conversion and
Back to same ZIP; Home cleanup. Check keyboard/show-hide, scrolling and focus.

**Quark:** AES or ZipCrypto; wrong→correct; Cancel without closing archive;
explicit retry; Next/Previous; keyboard/show-hide/viewport response; Home cleanup.
Use small files first, a moderate cancellation case only if stable. Stop escalation
after a reload/crash; no 512 MiB phone stress is required.

Both report actual browser/workflow results, obvious jank/reload/crash, entry
integrity/limits outcomes, available numeric cleanup JSON. A screenshot/report
must not include a revealed real password. All password/media processing remains
local. No UI diagnostic should ask users to copy the password or its hash/length.

## 15. Risk gates and stop conditions

| Level | Risk | Gate |
| --- | --- | --- |
| LOW | text/accessibility/selected lock indicator | paired EN/ZH, focus/scroll tests, no extra entry browser |
| MEDIUM | cache guard and same-entry active coalescing | targeted tests for new input vs old Promise; unchanged range cache semantics |
| MEDIUM | different-secret ZIPs | one private latest-success field; documented re-prompt; no unbounded candidates |
| HIGH | verifier/corruption ambiguity | code-level context + honest retryable ZipCrypto wording; no confident false claim |
| HIGH | partial unauthenticated plaintext | fresh bounded sink; no downstream publication before complete auth/size/stale success |
| HIGH | stale UI/ZIP replacement/password refs | archive/entry/selection IDs, abort/join, immediate reference clearing |
| HIGH | native memory / non-instant cancellation | unchanged guards/timeouts, real Android stable cleanup; never move work onto UI thread |
| HIGH | password leaked in debugging/storage | code-only transport, private state, logging/network/storage regression |

Stop productization for a focused spike if Reader recreation becomes necessary,
error context cannot support the agreed truthful UI, encryption bypasses a limit,
cancel/close leaks a Worker/codec/plaintext reference, Android cannot execute the
required existing path, a new dependency/crypto/CSP change appears necessary, or
preserving conversion ownership would require broad shared-media changes.
Do not silently upgrade zip.js, disable CRC/auth, widen limits or remove tests.

## 16. Readiness and next state

**M10B1 COMPLETE. M10B2 READY.** Library/API/desktop-engine feasibility is verified;
no unresolved product architecture decision is needed for the bounded first scope.
Intrinsic ambiguity, browser-managed password storage and native memory are
documented limitations, not claims of support or physical wiping.

M10B2 must still implement, test and obtain fresh Android product acceptance
before being called complete. Keep M10A2 historical branch/docs and released
V0.2 untouched. **STOP — do not begin implementation from this audit task.**
