# M10C2 isolated component notices and source package

Engineering license assessment only; not legal advice. AniView's project license
has not been chosen or changed by this experiment. No production dependency or
release is approved here.

The research binary is built from **7-Zip 26.05**, copyright (C) 1999–2026 Igor
Pavlov, revision `b88c6bc09339de32f7d18bbab900686b244f42ba`. It includes RAR
decompression and is subject to **LGPL-2.1-or-later plus the unRAR restriction**,
with BSD/public-domain components described in the complete upstream License.txt.
Do not use restricted unRAR sources to recreate RAR compression. Selecting only
7z in an application does not remove terms from RAR code still in the binary.

Reference wrapper **sevenzip-wasm 26.5.0**, commit
`7b53d4abf78da9eb06f9447730ae31eaf9acd7c3`, supplied the Emscripten portability
fix in Windows/System.cpp. Its JS/WASM license is LGPL plus the unRAR restriction;
the npm prebuilt binary is not the binary used by this spike. The bridge replaces
the CLI with native indexed handlers, a bounded output stream and structured
getters. Build script records all compiler and link flags. The adapter and build
changes to this LGPL-derived library component are supplied as source under the
same applicable LGPL-2.1-or-later terms and unRAR restriction; this grant applies
to the component in this spike, not the rest of AniView.

Emscripten **6.0.13**, revision `e13ee988ce3d87a738dd8f3661d02223308c412a`,
generates runtime JS and uses its libc/libc++/compiler-rt dependencies. Preserve
Emscripten's MIT/University of Illinois-NCSA notices and the system library license
files in a redistribution source/notices package. Upstream wrapper's reference
container pins 6.0.1; this Windows experiment uses the already-installed 6.0.13
toolchain. These are different builds, not a claimed reproduction of npm's bytes.

Before providing the isolated phone harness, `package-evidence.mjs` assembles:

- Full upstream engine source tarball at the exact revision, both original
  pinned wrapper archive and its LICENSE, our bridge/build/loader source and
  the System.cpp change recipe.
- Full engine License.txt, copying.txt (LGPL) and unRarLicense.txt; Emscripten
  root and available system-library license texts; component versions and hashes.
- A downloadable corresponding-source package, separate from executable JS/WASM.

Future production distribution must keep the precise matching source package
and notices available alongside binary releases, with patches, build scripts,
compiler requirements and applicable component source. A moving homepage link
alone is insufficient. The full toolchain/system libraries are available from
the pinned Emscripten revision and SDK release; final release packaging must
verify that complete corresponding source for every linked library is included
or available through an appropriate compliance route. No legal clearance is
asserted by successfully generating this prototype package.

The JS/WASM remains a separate, lazy, locally hosted component with no integrity
lock that forbids replacement. A user can rebuild using `prepare.mjs` and
`build.mjs`, replace `artifacts/bounded-sevenzip.js` and `.wasm`, and run the
same harness. Keep the interface contract and repeat memory/fixture tests for a
modified build. Do not bundle the component irreversibly into application logic
or prohibit library modification/reverse engineering for debugging modifications.

Sources:

- https://github.com/ip7z/7zip/tree/b88c6bc09339de32f7d18bbab900686b244f42ba
- https://github.com/arktronic/sevenzip-wasm/tree/7b53d4abf78da9eb06f9447730ae31eaf9acd7c3
- https://github.com/emscripten-core/emscripten/tree/e13ee988ce3d87a738dd8f3661d02223308c412a
- https://7-zip.org/license.txt
