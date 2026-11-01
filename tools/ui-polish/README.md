# V0.2 P1 UI regression checks

Run `npm run build`, then `node tools/ui-polish/run-browser.mjs` with the installed
Node 24 and Edge. No browser or dependency download is performed. The driver uses
the existing CDP helper and production preview under `/AniView/`, without HMR.

Prerequisites are the original procedural fixture outputs from the accepted
creation and video-source tools: `.tools/creation/fixtures.json` (first two small
PNGs), `.tools/mp4-product/fixtures/small.webp` and
`.tools/video-source/fixtures/benchmark.mp4`. See those tools' existing
fixture instructions if absent; do not substitute downloaded user media.

The checks cover all four Preview return paths at 1280/768/390/360, reflow while
Preview is open, pointer and keyboard activation, visible focus and Download,
unchanged result URL/metadata/encode count, source/trim/output error location,
Creator 0/1/2 source states, debug preservation, workspace cleanup and lightweight
static/ZIP regression. This is not the codec or stress matrix and does not replace
Android Edge/Quark UI acceptance.

Reports, screenshots, downloads and profiles remain ignored in `.tools/ui-polish/`.
