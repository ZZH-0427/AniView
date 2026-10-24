# Historical acceptance corpus

Milestone 7B moved the former `public/validation/` tree here. These original
CC0-1.0 samples are test inputs and are not needed by the viewer runtime. Vite
does not copy this directory into the production build.

- `zip/`: mixed and mixed encrypted/public ZIP acceptance samples.
- `viewer/`: six-format ZIP, 200-frame WebP and EXIF orientation JPEG.
- `stability/`: boundary images, 1000-frame animations, rejection samples,
  archive recovery inputs and `samples.json` provenance/metadata.

Regenerate the corpus with the existing `tools/archive/generate-fixtures.mjs`,
`tools/viewer/generate-fixtures.mjs` and `tools/stability/publish-fixtures.mjs`
commands. The last command stages samples from ignored stress-generator output;
its historical name no longer means publishing them to the website. The stress
generators and 100 MiB archive remain outside production.

Browser checks use local file selection through CDP. To repeat an Android check,
download the relevant file from this repository and select it in the normal
viewer. Historical `/AniView/validation/...` URLs are intentionally retired.
