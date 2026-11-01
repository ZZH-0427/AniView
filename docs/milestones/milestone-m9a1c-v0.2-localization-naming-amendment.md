# Pre-RC Creator naming amendment

Status: **PASSED**, 2026-11-02. Branch: `feat/v0.2-video-to-animation`.
Baseline: `de28dc8`; M9A1c remains PASSED/CLOSED. M9A2 has not started.
V0.2 is not released. This is a naming-only post-close amendment, not a rewrite
of the original localization acceptance or an expansion of media functionality.

## Naming and actual capability

The canonical static-image feature name is now **Create animation / 制作动图**,
previously **Create GIF / 创建 GIF**. It remains distinct from unchanged
**Convert video / 转换视频** and the unchanged brand subtitle.

Inspection found a premise difference in the request: this checkout's Creator
does **not** have a GIF/WebP/APNG target selector. `CreationSession` still uses
`StaticGifEncoder`, creates an `image/gif` Blob and `.gif` download; its Preview
also describes a GIF. WebP/APNG output exists in the separate animation
conversion flow. This patch does not implement or claim direct three-target
Creator support. General naming is format-neutral; the current target-specific
Generate GIF / 生成 GIF, Generated GIF, Download GIF, progress and GIF limits/
palette/timing notes remain accurate and unchanged. A direct three-target
Creator, if desired, needs separate authorization outside this naming patch.

## Search classification and changes

- Product name: Home button text, accessible label/title and Creator heading
  share renamed semantic key `home.createAnimation` (formerly `home.createGif`).
- General copy: opening status, empty state, one-image helper and generic
  Creator failure/accepted-input messages now refer to animation creation.
- Current nonhistorical tool instructions/sample page and README use the new
  entry name. Historical milestone/audit records remain unchanged.
- Technical identifiers (`CreateGif`, `CreationSession`, `createGifDownloadNamer`,
  `create-gif-entry`, MIME/extensions and encoder error messages) remain stable.
  GIF-specific actions/constraints remain GIF-specific. No Creator-specific
  Back-to-Create-GIF copy existed; existing generic Back/Close is unchanged.

Only six bilingual message values changed; the semantic key rename leaves
**290 keys**, missing English0 / Chinese0. Existing parity/interpolation tests
pass. No language-bound keys or additional dependencies were introduced.

## Validation

Official installed Node24.22.1/npm11.19.1:

| Check | Result |
| --- | --- |
| npm ci | Pass |
| npm run lint | Pass |
| npm run typecheck | Pass |
| npm run test | Pass:1001 tests /79 files |
| npm run build | Pass, including `/AniView/` asset checks |

All999 previous tests remain; two new EN/ZH Creator cases cover heading,
empty/helper wording, unchanged GIF-specific action, disabled one-source
generation and unchanged session snapshot. Home EN/ZH tests also check visible
text, accessible name/title and absence of the old product name.

Installed Edge, local production preview without HMR, dedicated port4250:
eight Home/Creator × English/Chinese × 360/390px captures passed bounds checks.
The Home label stays on one line, SVG/text boxes do not overlap, and no
horizontal overflow occurs. Representative screenshots were visually inspected;
no CSS/layout change was necessary. One-source helpers were checked in both
languages. Selection, append, reorder, remove, duration, loop/play count,
language/settings retention, actual GIF generation, Preview play/pause/return
focus and a native saved GIF download passed. No browser exception occurred.
Existing WebP/APNG conversion UI/targets and all Session/codec/limit source
files are untouched. All nine Worker JS bundles and the WebP WASM remain
byte-identical to frozen localization candidate `9d377b5`.

Ignored local evidence: `.tools/creator-naming/{audit.json,ci.log,lint.log,
typecheck.log,test.log,build.log}`, `browser/report.json` and eight screenshots.
The small driver reuses existing installed-browser/preview tools and fixtures.
No new Android test was performed: the request explicitly accepts360/390px
responsive evidence for this copy patch; no repeat codec matrix was required.
`npm ci` reported13 moderate advisories; package/lockfile are unchanged and no
dependency remediation was mixed into the naming patch.

## Scope and next state

No workflow, layout, format, Session, Player, codec, decoder, encoder, sampling,
resource-limit, routing, PLAN or AGENTS change. No main merge, tag, Pages
deployment or release. The existing frozen Android acceptance artifact was not
modified. Ready for the separately requested M9A2 stability/RC audit; STOP here.
