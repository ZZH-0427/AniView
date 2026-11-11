# Bounded SevenZip component notices

**7-Zip 26.05 + selected 26.06 Rar3/InBuffer security/error-handling backport +
AniView RAR4 filename patch**, Copyright (C) 1999-2026 Igor Pavlov and the authors
named in its source. Engine baseline revision:
`b88c6bc09339de32f7d18bbab900686b244f42ba`. Selected upstream backport revision:
`d3296e39e1f1f92c7b41c0c3848e65640428d42d`. The component is not a complete
7-Zip 26.06 upgrade.

Reference wrapper/build provenance: sevenzip-wasm 26.5.0, revision
`7b53d4abf78da9eb06f9447730ae31eaf9acd7c3`. The shipped binary is AniView's own
restricted source build, rather than the npm package's prebuilt binary. Generated
JavaScript and WebAssembly contain code covered by LGPL-2.1-or-later, the unRAR
restriction and applicable BSD/public-domain component terms. Full upstream terms
are retained in `licenses/7zip-License.txt`, `licenses/LGPL-2.1.txt`,
`licenses/unRarLicense.txt` and `licenses/sevenzip-wasm-LICENSE.txt`.

The unRAR restriction prohibits using decompression code to develop a
RAR-compatible compressor. This component is read-only and exposes no archive
creation/update/deletion interface. It does not use RARLAB's proprietary
compression implementation. Development fixtures created with a separately
obtained RARLAB evaluation tool do not distribute that tool.

Emscripten 6.0.13, revision `e13ee988ce3d87a738dd8f3661d02223308c412a`,
generated the runtime. Its MIT/NCSA terms and linked compiler-rt, libc++, libc++abi,
libunwind and musl notices remain in `licenses/`. Exact compiler/runtime source:
https://github.com/emscripten-core/emscripten/tree/e13ee988ce3d87a738dd8f3661d02223308c412a .
The pinned Emscripten SDK supplies the LLVM source/version identity; original
system-library notices remain intact.

AniView modifications retain the indexed read-only native adapter and bounded
integration. Three patches are applied in this order: `system-emscripten.patch`,
`rar4-filename.patch`, `rar3-inbuffer-2606-backport.patch`. The last patch imports
only upstream Rar3Decoder.cpp/.h and InBuffer.cpp input exception/error-state
changes. The original RAR4 declared-filename validation patch remains active.
`CHANGES.md`, the exact `patches/`, `manifest.json` and
`native-build-receipt.json` describe these 2026-11-11 modifications and their
compiled provenance. Original upstream licensing remains intact.

Library-derived modifications are supplied under the applicable
LGPL-2.1-or-later and unRAR terms. The matching `corresponding-source.tar.gz`
contains the original engine/wrapper archives, all three patches, native adapter,
recipe and templates, complete native build receipt and notices. `README.md`
documents rebuilding and replacing the separate JS/WASM component. Retain these
materials when redistributing it.

This notice does not select or relicense AniView's own application. Its existing
UNLICENSED/private policy remains unchanged. A Worker boundary or `private:true`
does not waive third-party obligations. These materials document engineering
readiness, not legal clearance; formal release must retain matching notices,
source and an appropriate replacement/relinking compliance route.
