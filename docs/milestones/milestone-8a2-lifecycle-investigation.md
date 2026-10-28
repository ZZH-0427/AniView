# Milestone 8A2 — local lifecycle investigation

Status: **CLOSED**.

Final classification: **Development-server-only Vite/HMR reload behavior**.
**Product fix required for Milestone 8A2: No.** The production-preview comparison
was reported normal in Android Edge and Quark. The only remaining milestone
user-flow blocker is documented in the [8A2 productization status](milestone-8a2-static-to-gif-productization.md):
Android repeated-download preservation, not lifecycle recovery.

Investigation started **2026-10-28** on `feat/v0.2-static-to-gif`, based on
`a038491`. This is the closed investigation's documentation record. Diagnostic
source additions remain temporary local working-tree changes, excluded from
the documentation commit, release and GitHub Pages deployment. No media
persistence or product recovery behavior has been implemented.

## Current finding

The current reproduced issue is classified **B / development-server-only**:
both Android Quark and Edge reproduce Vite/HMR disconnect recovery followed by
a full-page reload on A, and the user explicitly reports that B (static production
preview) has no issue in either browser. These are new documents, not in-place
React navigation to Home. No product behavior change or persistence workaround
is warranted by these results.

Exact per-environment attempt counts and separate generated-result outcomes were
not supplied; no standardized ten-cycles-plus-Blob completion is invented. This
is a coverage note, not an open lifecycle blocker. The original approximately
four reports from the earlier static4198 service remain retrospectively
unattributed; they are not silently relabelled HMR events.

| Android Browser | Vite Dev/HMR | Production Preview |
| --- | --- | --- |
| Quark | Reproduced | Reported normal |
| Edge | Reproduced | Reported normal |

QQ's later encoding/compatibility PASS is not lifecycle comparison evidence;
no QQ production-preview lifecycle result is claimed here.

Create GIF is **in-memory React state only**: `App` initializes `creating` to
`false`. It is not represented by a URL path, router, hash or query. A complete
reload creates a new App and empty MediaApp and therefore shows Home. Source
File handles and a generated Blob do not survive that reload. The diagnostic
journal does not change any of this behavior.

The only normal Creator → Home path found in the source is the explicit Back
button → existing CreationSession disposal → App callback setting `creating`
to `false`. Blur only clears the drag overlay. No Creator visibility/pagehide/
freeze handler navigates Home. Preview Close returns to Creator. Unmount cleanup
disposes its existing owner but does not invoke the Back callback.

**The previous Android address at port 4198 already served a static production
build**, through `tools/creation/preview.mjs` reading `dist`. It was not a Vite
development server. An old fixture-page link saying “development build” was
misleading and has been corrected to “production preview (no HMR)”. If the four
observations occurred on that service, HMR cannot be their direct explanation.

## Temporary evidence collection

Collection starts before React mounts and only with `?debug=1`. Lifecycle
diagnostics remain available on Home, Creator and preview so a return Home does
not remove the evidence panel. It records:

- `visibilitychange` with `document.visibilityState`;
- `pagehide` / `pageshow` with their `persisted` flags;
- document `freeze` / `resume` when emitted;
- `document.wasDiscarded`, or `null` when unsupported;
- Navigation Timing type and a document ID based on `performance.timeOrigin`;
- the current committed AniView screen, App mount/unmount and explicit Creator
  entry/Back actions;
- Vite update/full-reload/connect/disconnect/invalidate **event names only**;
- a boot count for instrumented documents in this tab and origin.

The bounded journal uses **diagnostic-only sessionStorage**, key
`aniview.debug.lifecycle.v1`, at most 128 events and 32 KiB with UTF-16 accounting.
It preserves evidence across reloads; it does not restore a screen, settings,
sources or Blob. StrictMode effect replay and repeated starts do not increment
the document boot count. Ports are separate origins with separate counters.
Storage denial or quota failure falls back to in-memory diagnostics and is
explicitly displayed. Stored records are rebuilt from allowlisted fields.

There are no filenames, paths, URLs, media bytes or HMR payloads in the app
journal, and no diagnostic upload, beacon, polling or analytics. No unload or
beforeunload listener was added. Normal pages without the debug query neither
collect lifecycle records nor touch diagnostic storage.

## Controlled environments

Both use the same working tree and installed Node.js 24.22.1 / npm 11.19.1.

| Environment | Command | Dedicated port | HMR |
| --- | --- | --- | --- |
| Development | `node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 4199 --strictPort` | 4199 | Yes |
| Production build preview | `npm run build`, then `node tools/creation/preview.mjs --host 0.0.0.0 --port 4200` | 4200 | No |

Both LAN pages returned HTTP 200. The development HTML contains `/@vite/client`;
the preview HTML contains only production hashed assets. The static preview is
not a Vite development server. The `/AniView/` base remains intact. No Pages,
main branch, tag or release was updated.

Current LAN links (replace the IP if the computer changes network):

- Development: `http://192.168.31.225:4199/AniView/?debug=1`
- Production preview: `http://192.168.31.225:4200/AniView/?debug=1`

## Evidence status

Lint, TypeScript, **50 test files / 658 tests**, and the production build pass.
The 12 new recorder tests cover lifecycle events, persisted flags, reload
history/boot counting, unsupported APIs, storage failures, bounded retention,
sanitization, disabled debug and listener cleanup. Existing encoder, session,
viewer and resource-limit tests remain present.

Fresh **desktop Edge 156** results (canonical completed run):

| Check | Vite development | Static production preview |
| --- | --- | --- |
| Creator background/return, ten repetitions, each about 5.02–5.04 s | 0/10 returns Home; same document and boot | 0/10 returns Home; same document and boot |
| One additional background/return with generated result | 0/1 returns Home; same Blob URL, 221 bytes still readable, two sources retained | Same result |
| Additional CDP-controlled freeze/resume | New document, boot +1, Home; HMR disconnect observed | Same document, boot and Creator |
| Explicit manual reload | New document, boot +1, Home, navigation type `reload` | Same result |
| Normal Home and Creator without debug | No lifecycle DOM or storage key | Same result |
| Browser errors | 0 | 0 |

The runner activates another real tab, verifies `visibilityState === 'hidden'`,
waits at least five seconds and reactivates AniView. It does not dispatch fake
visibility events. Background-throttling-disable flags are omitted. Headless
desktop tab switching is still **not** Android app switching or OS discard.

The development controlled-freeze probe recorded this sequence:

```text
freeze → resume → hmr:ws:disconnect → pagehide(persisted=false)
       → new Document / boot 1→2 / navigationType=reload / wasDiscarded=false
       → Home
```

There was no `navigation:creator-back`. The matching production freeze/resume
probe did not reload. A separate **deliberate restart** of a script-owned
loopback Vite server reproduced the same disconnect → reload → Home mechanism.
That reconnect path emitted no `hmr:beforeFullReload`. No LAN service was
restarted in that probe. These establish a **development-only reload mechanism
under those controlled conditions**, not the cause of the four Android reports
from the earlier static service. No product behavior was modified to hide it.

Manual reload in each environment gave `wasDiscarded=false`: those observations
prove reload and lost in-memory navigation, **not browser discard**. No actual
browser discard has yet been independently observed. Development `app:unmount`
also includes StrictMode's mount-effect cleanup; it alone is not proof of root
replacement or a new document.

Detailed records are ignored `.tools/lifecycle/report.json`, `summary.json`,
`hmr-reconnect-report.json`, per-environment before/after snapshots and screenshots.
An earlier exploratory developer freeze observation is retained separately in
`first-freeze-observation.json`; its successful ordinary background cycles are
not added to the canonical counts above.

### Android follow-up received

The user supplied four initial Home snapshots, two Quark anomaly summaries and
later Edge development anomaly records, followed by explicit confirmation that
both production-preview browser tests had no issue. The received evidence is
summarized inline below; full local diagnostic copies remain uncommitted and
are not required to read this documentation record.
The anomaly Raw JSON copies are truncated and repeat earlier prefixes; they
are not treated as complete or independent raw histories.

| Browser / environment | Received outcome | Attempts / generated-result test |
| --- | --- | --- |
| Edge / development | Initially no anomaly; later explicitly reproduced, with HMR/reload evidence | Counts and result-present outcome not specified |
| Edge / production | User explicitly reports B has no issue | Counts and result-present outcome not specified |
| Quark / development | Repeated returns Home; two anomaly summaries, all marked development | Total attempts and result-present status not specified |
| Quark / production | User explicitly reports B did not return Home | Counts and result-present outcome not specified |

The repeated raw prefix contains this complete event sequence once:

```text
Document 1793188870491.6 / boot 1 / create-gif
12:01:14.398Z visibilitychange → hidden
12:01:19.769Z hmr:ws:disconnect (still create-gif, hidden)
12:01:20.804Z pagehide(persisted=false)
Document 1793188880153.6 / boot 2 / navigationType=reload
12:01:22.393Z boot; 12:01:22.397Z pageshow(persisted=false)
12:01:22.467Z Home
```

The two later Recent events sequences additionally show boot **3→4** and
**5→6**, each Creator → hidden → HMR disconnect → pagehide(false) → new boot →
Home. Their current document IDs are `1793188938328` and `1793189003795.2`, both
with `navigationType=reload` and `wasDiscarded=false`. This supports **three
distinct reload chains after deduplicating the shared prefix**, not an attempt
ratio. Boot count 6 alone does not mean six failures; unspecified intervening
boots could include intentional navigation or refresh.

This matches the independently reproduced Vite reconnect path. No evidence
identifies an in-place product navigation or OS discard in these cases. Why the
WebSocket disconnected is not established; browser suspension and network causes
must not be asserted without further evidence. A startup Home snapshot, including
Edge-A's initial `navigationType=reload`, is not counted as a background failure.

The later **Edge-A** record independently shows boot **2→3**:
`1793191456494.8` Creator → hidden → HMR disconnect → freeze → visible/resume →
pagehide(false) → `1793191777906.7` / boot3 / reload / Home. A further boot5
header (`1793192028530.3`) confirms that document's reload type but lacks the
connecting event suffix, so it does not add a quantified anomaly chain.
The earlier Edge boot1 Home / `back_forward` / pagehide(true) → boot2 `navigate`
is history/BFCache/new-navigation context and is excluded from Creator failures.

Across the supplied histories there are **at least four supported distinct
reload chains: three Quark and one Edge**, not a reproduction rate. No precise
denominator, per-environment ten-round completion or independent Blob-present
outcome is invented. The subsequent user report resolves the production-outcome
question: **Quark B and Edge B were normal**. This supports the development-only
classification for the currently reproduced issue and removes it as a confirmed
product-defect blocker. It does not independently prove that every standardized
acceptance step was completed or close the entire Milestone 8A2.

No source edits or LAN service restarts were made during the device test window.

## Android comparison procedure

**Android product acceptance must use a production preview build without Vite
HMR.** The development server is for development, debugging and rapid iteration;
it is not the final Android page-lifecycle or release acceptance environment.
The following development/production comparison is retained as the reproduction
procedure for this now-closed investigation, not an outstanding acceptance gate.

Do not edit source files or restart either service during the comparison.
Keep phone and computer on the same Wi-Fi and keep the computer awake.

For **each browser × each environment** (four combinations):

1. Open the link with debug enabled. Note the environment, Document ID, Tab boot
   count, navigation type and Was discarded value in Lifecycle diagnostics.
2. Enter Create GIF. Background the browser to another app for 5–15 seconds and
   return. Repeat **at least ten times**; record returns to Home / attempts.
3. Select any two small static images and generate once. With the result still
   on Create GIF, perform one additional 5–15 second background/return cycle.
   Check whether the screen, source list and result remain available.
4. Expand Lifecycle diagnostics → Raw JSON and preserve the log. If Home
   appears, copy its lifecycle log immediately, before intentionally refreshing
   or re-entering Creator. State the cycle number and whether a result existed.

Copying the JSON into another app itself adds a lifecycle transition; report
that extra transition if it reproduces the problem. App switching and tab
switching on a desktop do not substitute for this real Android check.

## Classification and minimum next action

| Evidence | Interpretation / action |
| --- | --- |
| Same document and boot, hidden → visible, Creator retained | Normal background/foreground; no reload observed |
| New document and boot, Navigation Timing `reload` | A reload occurred; its trigger still needs evidence |
| New document with `wasDiscarded: true` | Browser discard evidence; propose the smallest recovery design before implementing it |
| HMR disconnect/full-reload followed by a new document | Development reload mechanism; compare against the static preview before classifying the Android issue |
| `pageshow.persisted: true`, same document/boot | BFCache restoration, not a fresh application boot |
| Same document/boot, Home, explicit `navigation:creator-back` | Existing explicit Back path executed |
| Same document/boot, Home without Back | Investigate root remount, HMR and navigation evidence; fix an identified product bug if reproduced without reload/discard in preview |

`wasDiscarded: false` does **not** prove that no reload or browser process
termination occurred. Unsupported flags and missing final pagehide/freeze events
must not be treated as proof of absence: a browser may terminate a hidden page
without delivering another event. See the [Page Lifecycle API guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
and [Vite HMR event documentation](https://vite.dev/guide/api-hmr).

The installed Vite client also reloads after a WebSocket disconnect and a
successful reconnect/ping. That path need not emit `vite:beforeFullReload`, so
both disconnect and full-reload events are observed, without their payloads.

The real-device evidence supports this causal chain:

```text
Create GIF
→ browser backgrounded
→ Vite HMR WebSocket disconnect
→ pagehide(false)
→ new document
→ boot count increases
→ Navigation Timing type = reload
→ in-memory navigation initializes at Home
```

| Alternative explanation | Evidence in this investigation |
| --- | --- |
| Android OS page discard | None |
| AniView actively navigating Home | None |
| CreationSession corruption | None |
| Encoder-triggered reload | None |

These entries describe the available evidence, not a universal guarantee that
any browser can never discard a page. Creator uses in-memory navigation/state;
after the development server causes a full reload, initializing at Home is the
expected result of that architecture.

**Decision: CLOSED — Development-server-only Vite/HMR reload behavior.
Use static production preview for further product acceptance; do not modify
product behavior to compensate for development HMR reloads.** No change to
navigation or recovery is recommended. Temporary instrumentation stays local
and uncommitted; no release or Pages deployment is made with these diagnostics.
**Product fix required for Milestone 8A2: No.** No IndexedDB persistence, OPFS,
CreationSession persistence, route recovery or Service Worker state persistence
is warranted or implemented for this issue.
GIF encoder, CreationSession, Player, Decoder, MediaSession and resource limits
are unchanged. No IndexedDB, OPFS, Service Worker, media/settings restoration,
new dependency or persistence-based recovery was introduced.

**This reproduced lifecycle issue is not a Milestone 8A2 product blocker.**
The root-cause investigation is closed. Exact Android attempt counts and the
separate Blob-present outcome remain unquantified coverage notes, not additional
blockers. Overall 8A2 status is **PENDING FINAL USER-FLOW CONFIRMATION**, solely
for Android repeated-download preservation as described in the productization
record. Milestone 8A1 remains **PASSED**, with **gifenc: ACCEPT WITH LIMITATIONS**.
No main merge, V0.2 deployment, tag or Release has been made; main, v0.1.0 and
production GitHub Pages (AniView v0.1.0) remain unchanged. 8B has not started.
