# Bounded SevenZip component notices

7-Zip 26.05, Copyright (C) 1999-2026 Igor Pavlov and the authors named in its
source. Exact engine revision: `b88c6bc09339de32f7d18bbab900686b244f42ba`.

Reference wrapper/build provenance: sevenzip-wasm 26.5.0, revision
`7b53d4abf78da9eb06f9447730ae31eaf9acd7c3`. The shipped binary is AniView's own
restricted source build, **not** the npm package's prebuilt binary. Generated
JavaScript and WebAssembly contain component code covered by LGPL-2.1-or-later,
the unRAR restriction and applicable BSD/public-domain component terms. Full
upstream terms are preserved in `licenses/7zip-License.txt`,
`licenses/LGPL-2.1.txt`, `licenses/unRarLicense.txt` and
`licenses/sevenzip-wasm-LICENSE.txt`.

The unRAR restriction prohibits using the decompression code to develop a
RAR-compatible compressor. This component is read-only and exposes no archive
creation/update/deletion interface. It does not use the RARLAB proprietary
compression implementation. Development fixtures created with a separately
obtained RARLAB evaluation tool do not distribute that tool.

Emscripten 6.0.13 (revision `e13ee988ce3d87a738dd8f3661d02223308c412a`)
generated the runtime. Its MIT/NCSA terms and linked compiler-rt, libc++, libc++abi,
libunwind and musl notices are retained in `licenses/`. Exact compiler/runtime
source: https://github.com/emscripten-core/emscripten/tree/e13ee988ce3d87a738dd8f3661d02223308c412a .
The toolchain's pinned LLVM source/version information is supplied by that
Emscripten SDK revision; the original system-library notices remain intact.

AniView component modifications consist of the indexed read-only native adapter,
the Emscripten portability branch documented in the build recipe, the RAR4
length-delimited filename validation patch (2026-11-11), and the lower-only
bounded integration. `CHANGES.md` and the shipped `patches/` describe those
modifications; original upstream licensing remains intact. Library-derived modifications are provided under
the applicable LGPL-2.1-or-later and unRAR terms. The exact corresponding-source
package, build recipe, patches and replacement instructions accompany the runtime
in this directory. Retain these materials when redistributing this component.

This notice does **not** select/relicense AniView's own application. Its existing
UNLICENSED/private policy remains unchanged. A Worker boundary or `private:true`
does not waive third-party obligations. These materials document engineering
readiness, not legal clearance; formal release must retain matching notices,
source and an appropriate replacement/relinking compliance route.
