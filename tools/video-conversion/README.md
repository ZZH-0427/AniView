# Video → Animation product validation (8D2)

Use the installed Node24/npm environment and existing lockfile. No new browser,
codec, package manager or runtime is downloaded by these tools.

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
node tools/video-conversion/run-product.mjs
node tools/video-conversion/measure-bundle.mjs
```

The product suite uses installed desktop Edge and real controls under/AniView/.
It verifies six directions, retained results, actual downloads and native input
preview. Its PAR omission shim is test-only; it is never served to phones.
Original synthetic source fixtures are inherited from8D1 under ignored
`.tools/video-source/fixtures`; to regenerate on another checkout see the
[external fixture-tool instructions](../video-source/README.md). That FFmpeg CLI
is an offline oracle, not a browser dependency/fallback.

Freeze the reviewed production build separately before phone acceptance:

```powershell
node tools/video-conversion/preview.mjs --root .tools/video-conversion-product/site --port 4240
node tools/video-conversion/check-preview.mjs https://TRUSTED_PREVIEW/AniView/?debug=1
```

The caller must populate `site` with the reviewed build, not rebuild during
acceptance. The preview is GET/HEAD only and serves built files plus six named
public test clips at/AniView/validation/video-animation/. Source files picked in
the product are local File objects; the server accepts no uploads. Trusted
temporary public HTTPS supports the user's wireless test preference. A plain
LAN HTTP URL is not a secure WebCodecs acceptance origin. No Pages deployment.

Reports, browser profiles, generated/downloaded media and asset hashes remain
ignored in `.tools/video-conversion-product/`. The
[implementation record](../../docs/milestones/milestone-8d2-video-to-animation-productization.md)
separates inherited technical evidence from new product tests; the
[Android checklist](../../docs/milestones/milestone-8d2-android-validation.md)
remains pending until actual phone results arrive.
