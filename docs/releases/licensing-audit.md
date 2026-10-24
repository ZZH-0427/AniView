# v0.1.0 third-party licensing audit

Audited on 2026-10-24 during Milestone 7B. The release inventory is
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md); the full redistribution
text is [public/third-party-notices.txt](../../public/third-party-notices.txt).

## AniView's own license

The owner finalized the v0.1.0 licensing decision on 2026-10-25:

- Project license: **None / UNLICENSED**, intentionally for v0.1.0.
- package.json and root package-lock metadata: `license: "UNLICENSED"`.
- `private: true` remains set to prevent accidental npm publication.
- Root LICENSE, LICENSE.md or LICENSE.txt: none.
- No project-level open-source license or permission to reuse, modify or
  redistribute AniView code is granted by the project without separate authorization.
- Third-party licenses, complete notice texts and patent grants remain retained.

The earlier audit found the project decision unresolved; this explicit owner
decision resolves that gate. Public source visibility and `UNLICENSED` metadata
do not grant a project license. AniView's own code and C bridge are distinct
from third-party components, which remain governed by their respective terms.

## Evidence and scope

All five direct runtime npm dependencies were checked in the installed
node_modules metadata and lockfile: React 19.3.1, React DOM 19.3.1, apng-js 1.1.5,
omggif 1.0.10 and @zip.js/zip.js 2.23.0. React DOM's scheduler 0.28.0 dependency
was checked separately. MIT texts for React, React DOM and scheduler were copied
unchanged into the source notice mirrors and production collection.

apng-js's existing license mirror matches its installed LICENSE.txt. Its bundled
EventEmitter module has a Joyent/Node MIT notice at lib/index.js; the retained
EVENTS-LICENSE.txt covers that bundled code. There is no separately installed
events package/version to report. omggif has its MIT notice at the start of
omggif.js; its package metadata and existing mirror agree. No codec behavior
was changed by this audit.

zip.js's existing LICENSE mirror matches the installed package LICENSE. Source
headers also contain Gildas Lormeau copyright years 2022, 2025 and 2026 and a
BSD-style disclaimer. Those exact conditions/disclaimer are additionally
retained in SOURCE-HEADER-NOTICE, along with the package-level license.
The zlib-streams WASM-side combined license includes zlib's terms and
Chromium/ARM-derived source acknowledgements. It was retained in full.

The package's streams/zlib-js/README.md identifies the JavaScript fallback as
zlib-streams-ts. Its upstream license was verified from the
[official source at commit 688fdc5541a7f696de1fe90253b5b3efc452bae8](https://github.com/gildas-lormeau/zlib-streams-ts/blob/688fdc5541a7f696de1fe90253b5b3efc452bae8/LICENSE.md)
and mirrored in full. It declares BSD-3-Clause for the TypeScript port and
retains zlib's original terms. The zip.js artifact does not state a standalone
version for this embedded copy; the inventory identifies it as bundled with
zip.js 2.23.0. The existing zlib-streams license was also checked against its
[official source](https://github.com/gildas-lormeau/zlib-streams/blob/main/LICENSE).

## WebP WASM provenance

The optional [build script](../../tools/webp-wasm/build.py) fixes libwebp to
commit `4fa21912338357f89e4fd51cf2368325b59e9bd9`, whose configure.ac reports
1.6.0. Its source archive SHA-256 is
`a1e18776b2bfdf59db4089cefb7453d3207bb6e77c24d649e0757e3a08fdca14`.
The retained COPYING, PATENTS and AUTHORS match that local pinned source after
line-ending normalization. The existing libwebp patent grant was preserved.

The build checks Emscripten 6.0.13. The installed SDK version file also reports
6.0.13, and its LICENSE matches the existing mirror. Generated glue is covered
by the SDK's MIT/NCSA notice collection, including its Node-derived path code
notice. The C bridge is AniView-authored source and is covered by the owner's
no-project-license decision.

SDK subcomponents were reviewed because the output includes C library and
stack/runtime support. The SDK musl VERSION reports 1.2.6; its full COPYRIGHT
was copied. The compiler-rt README identifies the SDK fork as based on LLVM
22.1.8, and its full Apache-2.0-with-LLVM-exceptions license collection, including
legacy notices, was copied. SDK stack_limits.S supplies the emscripten_stack_*
functions present in the committed module. The allocator source identifies
dlmalloc 2.8.6 and its upstream public-domain dedication; that declaration is
retained alongside the Emscripten license for SDK modifications.

The audited WebP artifacts are unchanged:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| aniview-webp.wasm | 138,564 | `30bb0e1ef94546744b2d64d6891eb5d0a8442fba7b21859eddcc526da42467e8` |
| aniview-webp.mjs | 29,865 | `39d331735d901e02a0b9e75a7df22711a77bf94eaf267dc8fa2ac6fd7cd3f350` |
| aniview_webp_bridge.c | 2,678 | `fe8902b33867fc56e7ea16020840eb3b237abc8c10b71a5737de10b437ae7a50` |

## Build tooling and generated helper code

Installed Vite 8.3.5 and Rolldown 1.2.15 both declare MIT licenses. The Vite
package source contains production preload-helper/module-preload plugins;
Rolldown supplies module interoperability helpers. Their core license texts
and Rolldown's Rollup/esbuild acknowledgements are included in production
notices to accompany copied helper code.

The full Node build toolchain is not distributed as part of the Pages runtime.
Vite's package LICENSE.md also inventories its own build-tool dependencies;
the installed dependency graph and original licenses remain available through
the committed package-lock and npm ci. The production notice file includes
the core/helper portions identified above rather than copying every
development-only package license into the browser artifact. No new npm package
or codec/toolchain download is required for normal npm builds.

## Distribution and maintenance

The source mirrors and public aggregate were checked for complete retained
license texts. public/third-party-notices.txt is a 56,901-byte static text file
at this audit revision, copied unchanged by Vite into the Pages artifact. It
is not imported into the runtime JavaScript bundle.

The rare WASM maintenance script formerly replaced this file with only libwebp
and Emscripten notices, which could discard notices for other components.
It now preserves the aggregate and prints a reminder to audit notices after
changing the codec or SDK. Its codec license-copy outputs remain intact.
Python syntax was checked without rebuilding WASM or altering global tooling.

The release inventory records component versions, declared licenses, uses and
license sources; it does not assert rights over user media. The owner's separate
no-project-license decision does not change third-party license terms.
Re-audit these records when updating dependencies, codecs or the WASM toolchain.
