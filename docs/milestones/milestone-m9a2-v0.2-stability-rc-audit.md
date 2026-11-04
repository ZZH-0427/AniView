# M9A2 — V0.2 Stability & Release Candidate Audit

Status: **PENDING ANDROID RC VALIDATION**, 2026-11-04, Asia/Singapore.
Desktop, automated, build, security, license and documentation gates passed.
No product-code fix was required. V0.2 is NOT RELEASED. Feature/UI/localization
freeze remains in force; no M9B, main merge, tag, version bump or Pages deployment.

## Checkpoint and scope

Baseline: `f60654844853fca0bb4892eaa7953355ff61e287`, branch
`feat/v0.2-video-to-animation`. Start worktree was clean and remote feature HEAD
matched. Main/origin main: `4a3dc69542ca2923744904cd10ddbf1a35f36ff9`;
v0.1.0 tag object: `498f596377c6ba13cdc300a695b2b49370982811`, unchanged.
The eventual phone validation candidate is recorded in the Android archive;
it is not RC-qualified until fresh Edge/Quark acceptance passes.

Environment: formal `D:\tool\nodejs\node.exe`24.22.1, npm11.19.1;
Windows x64 build26200.9457/25H2; installed Microsoft Edge156.0.4314.58,
headless Chromium with the existing browser helper's GPU-disable setting.
OS build was read from the registry; a denied CIM query was not substituted
with an invented OS edition. Browser/CDP/UA details are in the numeric evidence.

Required architecture and8A2/8B2/8C2/8D2, UI audit, M9A1b/M9A1c and naming
records were reviewed. These historical records remain historical. Existing
Vite/HMR background reload is dev-only; full reload returning Home is accepted
in-memory navigation, not a request for persistence or routing changes.

## Automated and build gates

Clean `npm ci`, lint, typecheck, **79 files /1001 tests**, build: PASS.
Exact tests:1001 passed,0 failed,0 skipped. No existing test was removed,
disabled or weakened; no new product behavior or dependency was introduced.
Two consecutive clean Vite production builds were identical for **all35 files**,
including the clean-source candidate metadata. `/AniView/` paths verified.

Manifest: [v0.2-rc-build-manifest.json](../research/v0.2-rc-build-manifest.json):
25 JS files (including9 Workers),5 CSS,1 WASM, HTML/favicon/notices/identity.
No sourcemaps, validation media, held/test Workers, logs, caches or unexpected
artifacts. The existing explicitly queried WebP spike chunk is inherited from
the baseline, not an automatically loaded8C/8D harness or a new release feature.
No new source-map policy, codec build or language splitting was introduced.

| Main artifacts | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Ordinary startup JS including shared preloads |325399|100489|
| Entry CSS |10958|3078|
| Creator UI/session lazy JS |28744|8689|
| Video conversion UI/session JS |31172|9437|
| VideoSource Worker |274358|72288|
| Shared animation Encoder Worker |45991|16013|
| Creator GIF Encoder Worker |24191|9240|
| Native MP4 Encoder Worker |300564|77663|
| MP4 coordinator/runtime |3514|1539|
| Source runtime |7131|2518|
| Native MP4 Preview |795|491|
| Shared WebP WASM |394132|159999|

Compared with accepted localization9d377b5, ordinary JS changes by26 raw bytes,
gzip unchanged, from the naming amendment; CSS/Workers/WASM are unchanged.
Expected growth only. Mediabunny is inside Source/MP4 Workers, not the ordinary
entry; its standalone package size is not added again as a fake bundle delta.
All9 Worker JS bundles and the WebP WASM keep the accepted hashes.

## Fresh desktop cross-feature evidence

[Numeric evidence](../research/v0.2-rc-desktop-evidence.json) records one
uninterrupted debug-enabled document and separate final ordinary-page checks.
The main document never reloads during the mixed workflows. No media content
or user filenames are archived; fixtures are original procedural test media.

| Sequence | Result and lifetime proof |
| --- | --- |
| A: GIF Viewer→WebP→Preview/download→MP4→native Preview/download→source→Home | PASS; source retained, three repeated animation Preview returns, valid double downloads, Home zero. |
| B: MP4→nondefault0.4–2.4s/20FPS/360→APNG→WebP Cancel/rerun→locale→Home | PASS; source/settings/result/job identity retained, old target replaced, Home zero. |
| C: Creator add/reorder/remove/duration/loop→GIF→Preview→regenerate→download→Home→saved GIF→APNG | PASS; same-session regeneration revokes old URL; saved GIF reopens; Home zero. |
| D: ZIP entry→WebP conversion→Preview→return ZIP→Next→Home | PASS; ArchiveSession stays alive during borrowing; next entry plays; Home zero. |
| E: animation→video GIF/download→Creator GIF/Preview→ZIP→locale→Home | PASS, repeated3 times in the same document; zero resources at every Home checkpoint. |

Video, animation and MP4 Cancel→rerun passed. Active video A replacement by VP9
B passed. For ordinary images, picker input appends by design; cancellation,
Back/Close and opening B through the actual supported UI were tested without
inventing a replacement action.40 passing existing late/stale-isolation tests
are explicitly referenced; no synthetic late publication is claimed as a
browser event. Representative JPEG/PNG/static WebP open/Fit/zoom and GIF/WebP/
APNG frame/Replay/observed loop checks passed. More and conversion entry work.

Actual repeated downloads retained two distinct equal-byte nonempty files for
each GIF, WebP, APNG and MP4. Saved image outputs reopened in AniView, with
frame stepping and observed loops; saved MP4 reopened through native source
Preview and playback. Success still uses the product's actual output readback,
not merely encoder completion.29 Preview returns retain result/focus/visible
Download, including source-result checks at1440/1280/768/390/360 in both locales.
Home and result/CTA responsive checks total20 cases; screenshots remain ignored.
Existing Viewer core regression also passed7 groups (including six formats,
ZIP/recovery, real/synthetic visibility, fullscreen/resizes and delayed first
frame); existing release UI regression passed20 checks. These are separate
browser traces, not added to the177-worker uninterrupted-run total. Their
English assertions now use explicit English browser startup flags; the default
OS Chinese locale had correctly translated the UI and invalidated legacy text
assumptions. Only test configuration changed; bilingual RC checks remain active.

## Cleanup and responsiveness

36 Home snapshots passed global and last-session zero assertions before closing
the browser.177/177 Workers, peak3 (ZIP Worker plus conversion workers),5/5
bitmaps,5/5 archives,34/34 owned URLs. No monotonic leftover accumulation was
observed across the3 mixed repetitions.

| Observable active resource at Home | Value |
| --- | ---: |
| Global Workers / decoder / encoder / video-source / output-decoder Workers |0|
| Samples |0|
| Canvases |0|
| ImageData |0|
| Owned RGBA |0|
| Awaiting ACK |0|
| Object URLs |0|
| Archive sessions (`activeArchiveSessions`) |0|
| Bitmaps |0|
| Owned VideoFrames |0|
| Cleanup errors |0|

All8 successful video jobs report softClosed=true/hardTerminated=false.
The final capability-failure preparation starts no conversion, so its close
disposition is null. A cancelled MP4's callback-balance field can remain null;
owned count is0. These unknowns are preserved rather than invented as true.
One intentional oversize-image failure increments staticDecodeErrors; unexpected
console exceptions/rejections/warnings are0. Job-local visible50ms heartbeat
maximum62.7ms; timer gaps are observations, not main-thread stall attribution.

**No app-observable resource leak detected. Native/GPU memory remains outside
complete observability.** Successful normal source close uses the cooperative
path; browser/process termination was not used to obtain the Home-zero proof.

## Error recovery, privacy and compatibility

Oversized image→valid image; unsupported video codec→valid conversion;
sample-count/frame-pixel preflight→corrected valid conversion; protected ZIP
entry→next valid image; test-only missing VideoDecoder→typed
VIDEO_DECODER_UNAVAILABLE with ordinary static viewing still usable: PASS.
Existing archive tests retain unsupported-entry/path/integrity classification;
no10,000-entry or full codec conformance matrix was repeated.

Observed322 page/Worker request events were only same-origin static assets or
local blob/data URLs. Unexpected API/external requests:0; uploads/non-GET/HEAD:0.
Lazy JS/Workers/WASM resolve under `/AniView/`, with no remote codec CDN/backend
conversion dependency. Cold offline loading of uncached lazy assets is not
promised; no PWA was added. Ordinary Home/Viewer/Creator/conversion/video results
contain no diagnostics; explicit debug remains collapsed/local/numeric.

## Security, licenses, documentation and hygiene

[Security audit](../research/v0.2-dependency-security-audit.md): saved npm audit
12 moderate development-tool entries/one GHSA; production audit0; MUST FIX BEFORE
V0.2: none identified in the reviewed exposure. No force-fix or package update.
Full captured JSON and each classified node/path are committed separately.

[License audit](../research/v0.2-third-party-license-audit.md):8 runtime npm
licenses checked against installed originals;24 retained texts reviewed; required
notice omissions0. Mediabunny1.65.0/MPL-2.0 original67 sources/LICENSE match the
integrity-pinned published archive. Exact source availability is retained. Own
code stays UNLICENSED/private; no native AVC patent grant is asserted.

No tracked dist/node_modules/log/tmp/environment file, unexpected large binary
or credential-pattern match was found. Test archive passwords are test data;
no passwords/media go to diagnostics. Source maps remain absent.

### Actual V0.2 capability table

| Input | View | Convert/create |
| --- | --- | --- |
| JPEG / static PNG / static WebP | Static Viewer | Creator sources→GIF |
| GIF | Animated Viewer | Animated WebP / APNG / MP4 |
| Animated WebP | Animated Viewer | GIF / APNG / MP4 |
| APNG | Animated Viewer | GIF / Animated WebP / MP4 |
| MP4/H.264 | Native source Preview | GIF / WebP / APNG |
| Opaque8-bit SDR VP9 WebM | Native source Preview | GIF / WebP / APNG |
| ZIP | Browse supported entries | Individual animated entries through normal conversion |

README's unreleased feature sections match this surface; public demo/v0.1.0
coverage stays separately identified. Home uses Create animation/制作动图;
Creator accurately uses Generate GIF/生成 GIF, without direct WebP/APNG target
selection. English/简体中文 and native browser-language exceptions are documented.
Old Create GIF names in dated milestone records describe historical states;
they were not silently rewritten. No current capability contradiction was found.

## Findings and remaining gate

| Classification | Disposition |
| --- | --- |
| RC-BLOCKER | None found in completed desktop/security/license/build gates; Android RC gate remains pending. |
| FIX BEFORE RELEASE | No product fix identified. |
| ACCEPTED LIMITATION | Browser-dependent native video APIs/profiles; opaque8-bit SDR MP4/H.264 and VP9 WebM only; audio ignored; native/GPU observability; stated safety limits; native picker/gallery differences. |
| DEFER TO V0.3 | Direct multi-target image Creator; password ZIP; RAR/7z; advanced editing; custom FPS/resolution; additional languages; optional P2 polish. |
| OBSERVATION |12 dev advisory nodes; inherited explicitly queried WebP spike; published MPL use-description line is more complete than its mirror; contributor list is retained separately. |

Important fixed boundaries: Creator GIF256 colors/1-bit alpha/no dithering;
video-to-animation150 sampled frames,30s and720 long-side plus workload/source
guards; animation-to-MP4 one cycle/no audio/white alpha background/lossy H.264,
odd-size padding; unsupported encrypted ZIP/RAR/7z; refresh loses media sessions.
These remain accepted limits, not newly implemented features or hidden failures.

Fresh Android Edge + Quark RC smoke and representative ZIP remain required:
[Android archive](milestone-m9a2-android-rc-validation.md). Old8A–8D/UI/localization
phone results do not substitute. Do not mark M9A2 PASSED or nominate a qualified
M9B release baseline until this gate closes. No M9B action is authorized here.
