# M10D — V0.3 scope freeze and pre-RC cleanup

Date: 2026-11-11. **M10D — PASSED / CLOSED**, with final feature-branch
commit/ref equality and clean-worktree verification recorded at delivery.
**M10E — V0.3 Stability & Release Candidate Audit: READY**, not started here.
This is not a release candidate, release approval or deployment.

## Scope and baseline

Started from clean `feat/v0.3-rar-7z-product` at
`d831a870e594cca5d906a6079d4bd09b0ebbb65b`, after the read-only repository audit
was accepted. Created `feat/v0.3-pre-rc-cleanup` from that cumulative V0.3 state,
not from main. Remote baseline refs were verified read-only before branching.

[V0.3 scope freeze](../releases/v0.3-scope-freeze.md) is the authoritative
capability/limit summary: existing static/animated Viewer; direct canonical-RGBA
GIF/WebP/APNG Creator; six-direction animation conversion and accepted video
paths; ordinary/password ZIP; bounded single-file RAR4/RAR5/7z; EN/ZH. Direct
WebP/APNG creation does not use a GIF intermediate.

The freeze distinguishes existing trim, discrete FPS and output-size presets from
deferred free-form FPS/resolution enhancements. Advanced animation editing, more
languages, multi-volume/extra archive formats, SFX guarantees and recursive archive
browsing remain deferred. No feature or resource ceiling is added or expanded.

## Changes

| File | Result |
| --- | --- |
| `src/app/App.tsx` | Statically gate both the WebP engineering lazy import and its query branch with `import.meta.env.DEV`. Production ignores the legacy spike query and renders the ordinary application. |
| `src/app/App.test.tsx` | Preserve the original test and add three cases: two production query variants render Home; development still renders the real lazy engineering page. |
| `tools/release/check-build.mjs` | Reject emitted Spike JS/CSS names and unique engineering-page markers; retain fixture exclusion, base-path, runtime and distribution checks. |
| `tools/webp-wasm/README.md` | Document the retained development-only harness and ordinary production Viewer regression path. |
| `docs/releases/v0.3-scope-freeze.md` | Source-checked scope, resource ceilings, deferred work and release boundary. |
| `docs/README.md` | CURRENT / COMPLETED / HISTORICAL / SUPERSEDED / RELEASE ARCHIVE index. |
| This report | M10D changes, validation, footprint and handoff. |

No router redesign, codec/Player/Creator/archive backend change, dependency or
license change. Spike source and independent browser-check tooling remain.
Historical reports and Android raw evidence were neither edited nor relocated;
M10C2's initial Edge timeout/Quark backend failure remain alongside followup data.
The index explicitly prevents old NOT STARTED/PENDING plans being treated as
current status, and links immutable V0.2 release-branch records without merging
or copying them.

## Automated validation

Formal local environment: Node `v24.22.1`, npm `11.19.1`, installed under
`D:\tool\nodejs`. In order, all exit 0:

| Command | Result |
| --- | --- |
| `npm ci` | PASS; dependency/lockfile graph unchanged. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run test` | **95 files / 1,191 tests PASS**; original 1,188 retained plus three entry regressions. |
| `npm run build` | PASS, including production-content and SevenZip distribution verification. |

`npm ci` reports 10 moderate advisory findings. No audit fix, package upgrade or
lockfile rewrite is performed; M10D does not replace the separately authorized
M10E stability/security/RC audit.

## Actual installed-browser regression

All checks below use installed desktop Edge with actual Worker/WASM processing;
mobile-like viewports are emulation, not new Android device results.

| Check | Observed result |
| --- | --- |
| Production legacy query | `?spike=webp` and `?spike=webp&debug=1` render ordinary Home; no Spike assets or page errors. |
| Viewer core | Seven acceptance groups pass, including six image formats, GIF/WebP/APNG playback/step/zoom, ZIP browsing, recovery, visibility intent and viewport/fullscreen behavior. |
| RAR/7z product | Six groups, 30 media selections across RAR4/RAR5/7z including solid cases, 12 layout observations; password/header flows, conversion/Back and Home cleanup pass. |
| Home / ordinary ZIP | Actual request assertions show no early SevenZip Worker/glue/WASM loading; ZIP stays on zip.js. |
| Password ZIP | Nine groups/eight fixtures pass, including supported encryption, retries/cancel, conversion/return, EN/ZH/layout and cleanup. Workers 46/46, active 0. |
| Three-format Creator | 26 groups/five workloads/three quality scenes pass; direct GIF/WebP/APNG, preview/return, repeated downloads, cancellation and EN/ZH. Workers 257/257, active 0; transfers 1762/1762 detached and result URLs 49/49 revoked. |
| Development Spike | Independent real decode, changing Canvas, reset, close, corrupt-input recovery, reopen, transfers and phone/desktop layout checks pass. |

Extended archive final Home counters show active Worker/Bitmap/archive session,
extended Worker/WASM/extraction/pending access/plaintext bytes/object URLs and
cleanupErrors all zero. These are application-observable checks, not OS/native/GPU
memory measurements.

Evidence is isolated in ignored `.tools/m10d/`: command logs,
`production-entry.json`, `browser-steps.json`, `extended/`, `password/`,
`creation/` and `viewer-and-dev/`. Existing acceptance scripts were reused with
output-directory/import-resolution adapters only; assertions are unchanged and
their source hashes are recorded in `runner-provenance.json`. Existing `.tools`
evidence, caches and browser profiles were not cleaned. The temporary test
servers/browsers created by this run were closed.

The shared App entry was changed, so representative production navigation and
phone-width layout checks were rerun rather than inferred. Earlier M10A/B/C
Android acceptance remains historical; no fresh full Android matrix or M10D
real-device PASS is claimed or required for this development-only entry cleanup.

## Measured build footprint

Baseline: the saved clean M10C3 build from `c6915e9`, which has the same product
sources as `d831a87` before this cleanup. Same-platform files were measured, not
an assumed 5,616-byte saving. Generated `release-candidate.json` identity is
excluded from the stable total below because it changes with commit/dirty state.

| Measure | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Whole artifact file count | 60 | 57 | -3 |
| Bytes excluding build identity | 5,964,327 | 5,957,848 | -6,479 |
| JavaScript bytes | 1,412,926 | 1,407,197 | -5,729 |
| CSS bytes | 21,613 | 20,946 | -667 |
| Spike-specific emitted files | 2 | 0 | -2 |

Both Spike assets disappear; bundler sharing also folds the previous separate
i18n chunk, so other chunk names change. The JS/CSS delta is -6,396 bytes;
HTML contributes another -83 bytes. No resource limit is changed to obtain this.
All 19 SevenZip distribution files retain identical bytes. Exact raw totals,
asset hashes and initial validation build identity are in
`.tools/m10d/{baseline-build,bundle-diff}.json`; final clean-build identity is
verified after the source commit. This measurement does not designate a V0.3 RC.

## Runtime, distribution and preservation

7-Zip 26.05 / Emscripten 6.0.13 remain fixed. Actual WASM memory section remains
one nonshared memory, initial16MiB / maximum64MiB, growth enabled. Runtime source,
native RAR4 NUL/Unicode patch, 18 manifest assets, corresponding-source package,
licenses/notices and replacement instructions are unchanged and verified.

```text
WASM bcbd8a4466062683a7e5d5c195be745fe18ea1065a4c6ccfe157dbca230fe970
JS   19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d
```

RAR/7z still enforce 15MiB input, 4MiB selected output/known dictionary,
1,000 entries, 1,024/131,072 single/total UTF-16 paths and 15s operation deadline.
Only the ordinary Vite app is built; native WASM is not recompiled. The build
contains no validation/fixtures/tests/.tools/node_modules paths, retains
`/AniView/` asset paths and complete public notices/source/manifest.

## Git, production and remaining limits

Only the pre-RC feature branch is committed/pushed. Main and peeled v0.2.0 stay
`0cb82c0a446a160806596d618bbbc61e16a5752d`; the annotated v0.2.0 tag remains
`3f83ab43fa880432bef9e84784da29b8c4dc9843`. Historical feature/release branches
remain. Package version `0.2.0`, project license `UNLICENSED` and production Pages
are unchanged. No main merge/push, tag, Release, Pages deployment or repository
setting change occurs.

All prior format, solid, password/corruption ambiguity, platform codec, resource
and browser-controlled download limitations remain. No SFX/multivolume/arbitrary
archive compatibility or total-device memory guarantee is introduced. The audit's
local profile cleanup and tiny duplicate-fixture consolidation are intentionally
not performed. **Next: M10E READY; stop here and await its separate instruction.**
