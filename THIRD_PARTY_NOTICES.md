# Third-party components

AniView uses the components below. Their license texts and acknowledgements are
retained under [`third_party/licenses/`](third_party/licenses/). The production
site distributes the complete notice collection as
[`third-party-notices.txt`](public/third-party-notices.txt).

This inventory covers third-party code shipped in the browser application,
including generated runtime helpers. No project license is granted for AniView
v0.1.0; its package metadata is `UNLICENSED`. Each third-party component remains
governed by its own terms, independently of AniView's project licensing.

| Component | Audited version | License | Use | Retained license/source |
| --- | --- | --- | --- | --- |
| libwebp | 1.6.0, commit `4fa21912338357f89e4fd51cf2368325b59e9bd9` | BSD-3-Clause, additional patent grant | Animated WebP decoder compiled to WASM | [COPYING](third_party/licenses/libwebp/COPYING), [PATENTS](third_party/licenses/libwebp/PATENTS), [AUTHORS](third_party/licenses/libwebp/AUTHORS) |
| Emscripten | 6.0.13 | MIT OR NCSA | Generated WebP runtime glue and SDK support | [LICENSE](third_party/licenses/emscripten/LICENSE) |
| musl libc | 1.2.6 in Emscripten 6.0.13 | MIT with upstream component acknowledgements | C library portions linked into WebP WASM | [COPYRIGHT](third_party/licenses/emscripten/MUSL-COPYRIGHT) |
| LLVM compiler-rt | SDK fork based on 22.1.8 | Apache-2.0 WITH LLVM-exception; legacy notices retained | Compiler/C runtime support in the SDK | [LICENSE.TXT](third_party/licenses/emscripten/COMPILER-RT-LICENSE.TXT) |
| dlmalloc | 2.8.6 in Emscripten 6.0.13 | Upstream public-domain declaration; Emscripten changes covered by its license | WASM allocator | [Source declaration](third_party/licenses/emscripten/DLMALLOC-NOTICE) |
| apng-js | 1.1.5 | MIT | APNG parsing | [LICENSE.txt](third_party/licenses/apng-js/LICENSE.txt) |
| Node EventEmitter | Bundled within apng-js 1.1.5 | MIT | Bundled parser dependency | [EVENTS-LICENSE.txt](third_party/licenses/apng-js/EVENTS-LICENSE.txt) |
| omggif | 1.0.10 | MIT | GIF LZW, palette and transparency decoding | [LICENSE](third_party/licenses/omggif/LICENSE) |
| gifenc | 1.0.3 | MIT | V0.2 development GIF creator: Worker quantization, palette mapping and encoding; lazy from ordinary Viewer | [LICENSE.md](third_party/licenses/gifenc/LICENSE.md), [source-header acknowledgements](third_party/licenses/gifenc/SOURCE-HEADER-NOTICES) |
| @zip.js/zip.js | 2.23.0 | BSD-3-Clause | Local ZIP metadata and extraction | [LICENSE](third_party/licenses/zip.js/LICENSE), [source-header notices](third_party/licenses/zip.js/SOURCE-HEADER-NOTICE) |
| zlib-streams, zlib and Chromium-derived portions | Bundled within zip.js 2.23.0 | BSD-3-Clause and zlib; Chromium acknowledgements | ZIP compression-stream runtime | [Combined license](third_party/licenses/zip.js/ZLIB-STREAMS-LICENSE) |
| zlib-streams-ts | Bundled within zip.js 2.23.0 | BSD-3-Clause and zlib | ZIP JavaScript compression-stream fallback | [LICENSE.md](third_party/licenses/zip.js/ZLIB-STREAMS-TS-LICENSE.md) |
| React | 19.3.1 | MIT | UI runtime and JSX runtime | [LICENSE](third_party/licenses/react/LICENSE) |
| React DOM | 19.3.1 | MIT | Browser rendering | [LICENSE](third_party/licenses/react-dom/LICENSE) |
| scheduler | 0.28.0 | MIT | React DOM scheduling dependency | [LICENSE](third_party/licenses/scheduler/LICENSE) |
| Vite | 8.3.5 | MIT | Build-generated production preload helpers | [Core license](third_party/licenses/vite/LICENSE) |
| Rolldown | 1.2.15 | MIT; bundled Rollup/esbuild MIT acknowledgements | Generated module/interoperability helpers | [LICENSE](third_party/licenses/rolldown/LICENSE), [THIRD-PARTY-LICENSE](third_party/licenses/rolldown/THIRD-PARTY-LICENSE) |

The npm versions above were checked against installed package metadata after
`npm ci` and the committed lockfile. Bundled subcomponents without their own
package/version metadata are identified by their enclosing package, rather than
an invented standalone version.

The full notice collection accompanies the static Pages artifact. It is not
loaded as application JavaScript and adds no media-processing dependency.
Future codec, SDK or dependency updates must review both the source license
mirrors and the production notice collection. The optional WASM rebuild script
preserves the aggregate collection instead of overwriting other components.

See the [release licensing audit](docs/releases/licensing-audit.md) for source
provenance, exact WebP artifacts and the distinction between runtime and build
tooling. Dependency licenses do not grant rights to user-selected images or ZIP
contents; those remain subject to their respective owners' terms.

## V0.2 development GIF creator

Milestone 8A1 audited the following component in a standalone technical spike.
Milestone 8A2 retains the same version as a runtime dependency of the lazy GIF
creator on the V0.2 feature branch. It is not part of the published v0.1.0 release
or ordinary Viewer startup. No V0.2 production deployment is implied.

| Component | Audited version | Declared license | Development use | Retained license/source |
| --- | --- | --- | --- | --- |
| gifenc | 1.0.3 | MIT | Dedicated Worker GIF quantization, palette mapping and encoding | [LICENSE.md](third_party/licenses/gifenc/LICENSE.md), [source-header acknowledgements](third_party/licenses/gifenc/SOURCE-HEADER-NOTICES) |

The feature-branch distributable includes gifenc's full retained texts in
`public/third-party-notices.txt`, alongside the existing collection. Published
v0.1.0 artifacts remain unchanged. See the [spike licensing audit](docs/spikes/gif-encoder-licensing.md)
for the exact published-package evidence. AniView's own package remains
`UNLICENSED`; gifenc's terms apply independently.
