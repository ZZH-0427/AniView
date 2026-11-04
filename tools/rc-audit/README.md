# M9A2 production RC audit tools

Use installed Node24/npm/Edge and the existing procedural fixtures generated
by tools/creation, tools/conversion, tools/video and tools/video-source. These
tools add no product module/dependency and perform no media upload.

1. Verify a clean feature baseline. Run npm ci, lint, typecheck and tests;
   save Vitest's JSON to `.tools/rc-audit/vitest.json`.
2. Run two clean production builds, preserving them as
   `.tools/rc-audit/build-1` and `build-2`; run `audit-build.mjs` to compare all
   bytes and write the SHA256 manifest. Keep build directories ignored.
3. Capture `npm audit --json`, `npm audit --omit=dev --json` and runtime npm tree
   in `.tools/rc-audit/`. `audit-dependencies.mjs` records actual packages,
   notices and hygiene; it never applies a fix. `check-mpl-source.mjs` fetches
   one exact source tarball, verifies lockfile integrity and compares upstream
   source/LICENSE without installing it. Node24's existing env-proxy support
   can be used where required; certificate verification remains enabled.
4. `node tools/rc-audit/run-browser.mjs` starts the product-only preview on4258,
   runs the uninterrupted A/B/C/D/E×3 workflows, cancellation/replacement,
   actual download/readback, cleanup, responsive and recovery checks. The
   missing-VideoDecoder wrapper is test-only. It never enters dist/phone builds.
5. `write-records.mjs` writes compact desktop/security/license evidence from
   the captured files. Historical date/baseline records describe this audit.

`preview.mjs --root PATH --port PORT --host HOST` serves production files and a
fixed procedural sample allowlist under `/AniView/validation/rc/`. GET/HEAD only;
no generic filesystem browse or upload route. The existing cloudflared/approved
loopback workflow may expose a frozen build for the fresh Android gate.

All browser profiles, screenshots, logs, actual downloaded test media and the
corresponding-source archive stay in ignored `.tools/rc-audit/`. Numeric evidence
is saved before browser/process close; closing the browser is not cleanup proof.
Optional shared browser-helper event observation captures method/static URL and
console metadata only. It does not persist selected media or change product APIs.
