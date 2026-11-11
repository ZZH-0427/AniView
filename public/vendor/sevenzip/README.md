# AniView bounded read-only SevenZip component

This directory is a separately replaceable third-party runtime for RAR4, RAR5
and 7z. It is loaded only after AniView identifies one of those binary signatures.
ZIP continues to use zip.js. No npm runtime dependency is added by this component.

See `manifest.json` for the shipped file hashes, exact build inputs and ABI, and
`THIRD_PARTY_NOTICES.md` plus `licenses/` for the component's terms. The matching
`corresponding-source.tar.gz` includes the exact original engine/wrapper source
archives, AniView's native adapter, build recipe and portability change. This
component's licensing does not choose a license for AniView as a whole.

## Build and replace

Use Node.js 24, Git, Ninja and Emscripten 6.0.13 (revision
`e13ee988ce3d87a738dd8f3661d02223308c412a`). From an AniView source checkout:

```text
node tools/extended-archive/prepare-runtime.mjs
node tools/extended-archive/build-runtime.mjs
node tools/extended-archive/package-runtime.mjs
node tools/extended-archive/verify-runtime.mjs
```

The source package contains the same `tools/extended-archive` tree and exact
upstream archives. Extract it to an empty directory and copy
`upstream/7zip-b88c6bc.tar.gz` to `.tools/m10c3/7zip.tar.gz` and
`upstream/wrapper-7b53d4a.tar.gz` to `.tools/m10c3/wrapper.tar.gz` (create the
directory first). Then run the commands above; preparation verifies and extracts
those local archives without a download. Point `EMSDK` and `NINJA_EXE` at your
installed tools. `SEVENZIP_SOURCE` can point to another extracted or modified copy of
that engine. The build writes a private compiler configuration using the Node
executable that invokes it; it does not install or download another Node.

The committed `system-emscripten.patch` documents the portability branch, and
`rar4-filename.patch` validates length-delimited RAR4 names before truncation.
The recipe applies these exact patches with forward/reverse verification. Their
hashes and native build-input receipt are recorded in `manifest.json`; copies
are in `patches/`. See `CHANGES.md` for the dated modification record.
`native/bridge.cpp` is the read-only indexed adapter. It
exports no allocator stress probe or extraction-preflight bypass. `av_extract`
has three arguments: entry index, lower-only output cap in bytes, UTF-8 password
or null. Its native selected-output cap cannot exceed 4 MiB.

RAR4 raw validation distinguishes non-Unicode names from the legal NUL separator
between legacy and compressed Unicode names. It checks the compressed grammar,
copy bounds, surrogate pairs and decoded length before the original decoder runs;
UTF-8 names without a separator use the upstream strict validator. Truncated or
invalid encodings never fall back to a different name. The exact 1,024 UTF-16-unit
boundary is preserved. Literal Unicode serialization is limited to Unicode-flagged
RAR4 paths, retaining private-use characters while preserving legacy-name escape
behavior. RAR5/7z serialization is unchanged. Encrypted-header failures retain the existing ambiguous
password-or-damage outcome because filename parsing precedes header CRC checking.
Native metadata conversion also uses the BSTR's explicit length and rejects embedded
NUL/control characters before handing a UTF-8 string to JavaScript. The Worker
checks `av_last` immediately after each string getter so a rejected string is
never published as a silently truncated path. Extraction also preserves a native
output/password callback's precise error if the decoder later reports a generic
failure. These adapter safeguards are separate from the upstream parser's work.

Replace **both** `bounded-sevenzip.js` and `bounded-sevenzip.wasm` together,
preserving this ABI. Keep the 16 MiB initial / 64 MiB maximum nonshared wasm32
memory configuration to use AniView's supported safety policy. Recreate
`manifest.json` and the matching source package, then rebuild AniView and rerun
the relevant archive tests. Build verification checks hashes for provenance;
there is no runtime hash lock preventing you from using a modified component.
An isolated modified build is supported without contacting any remote service.

The complete generated native command list is written to
`.tools/m10c3/native-build/commands.json`. Environment variables `EMSDK`,
`NINJA_EXE` and `SEVENZIP_SOURCE` allow local tool/source replacement. A compiler
installation blocked by the operating system must be corrected through its
normal trusted-tool policy, not by weakening the application/browser sandbox.

The 64 MiB bound covers WASM linear memory, not JavaScript, Blob storage, browser
compiler or total device memory. Resource-limited solid extraction can process
preceding data. Only single-file read-only archives are within the product scope.
No multivolume pairing, SFX guarantee, recursive browsing or archive writing is
provided.

Engineering license readiness is an engineering assessment, not legal advice or
a guarantee that every combined-work/distribution scenario satisfies all terms.
