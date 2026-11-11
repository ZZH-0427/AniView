# AniView bounded read-only SevenZip component

This separately replaceable RAR4/RAR5/7z runtime is **7-Zip 26.05 + selected
26.06 Rar3/InBuffer security/error-handling backport + AniView RAR4 filename
patch**. It is not a complete 7-Zip 26.06 upgrade. AniView loads it only after
identifying a supported archive signature; ZIP continues to use zip.js.

`manifest.json` records the shipped hashes, exact build inputs, ordered patches,
backport source hashes and ABI. `native-build-receipt.json` records all 189
compiled units and object hashes, the link-object list, patch application and
binary hashes. The matching `corresponding-source.tar.gz` includes the original
engine/wrapper archives, native adapter, exact patches, recipe, receipt, notice
templates and small TypeScript adapter sources. See `THIRD_PARTY_NOTICES.md` and
`licenses/` for terms. These materials do not choose a license for AniView itself.

## Source and patch identity

The engine baseline remains 7-Zip 26.05 revision
`b88c6bc09339de32f7d18bbab900686b244f42ba`. Selected changes come from official
26.06 revision `d3296e39e1f1f92c7b41c0c3848e65640428d42d`:

1. `system-emscripten.patch`: the Emscripten portability branch.
2. `rar4-filename.patch`: full declared RAR4 filename validation before truncation.
3. `rar3-inbuffer-2606-backport.patch`: the paired
   `CPP/7zip/Compress/Rar3Decoder.cpp`, `CPP/7zip/Compress/Rar3Decoder.h` and
   `CPP/7zip/Common/InBuffer.cpp` changes for input exception/error propagation
   and stopping further input refills after a read error.

The third patch preserves the original RAR4 filename checks and does not import
unrelated 26.06 codec, handler or format changes. The source comparison is
https://github.com/ip7z/7zip/compare/b88c6bc09339de32f7d18bbab900686b244f42ba...d3296e39e1f1f92c7b41c0c3848e65640428d42d .

The recipe applies patches in that order using `git -c core.autocrlf=false
apply`, with forward/reverse verification; a repeat application is accepted only
when the exact reverse check succeeds. The three backported source files must
match their recorded upstream SHA-256 values. Keep LF bytes when preparing source
or applying patches. Changing global Git settings is unnecessary.

## Build and replace

Use Node.js **24.22.1**, Git, Ninja and Emscripten **6.0.13**, revision
`e13ee988ce3d87a738dd8f3661d02223308c412a`. Set `EMSDK` and `NINJA_EXE` to
installed tools. No install hook or application code downloads the runtime.
From an AniView checkout, this PowerShell example builds twice in fresh object
directories, then packages the second receipt:

```powershell
node tools/extended-archive/prepare-runtime.mjs --root .tools/sevenzip-rebuild
$env:SEVENZIP_SOURCE = (Resolve-Path .tools/sevenzip-rebuild/source).Path
$env:SEVENZIP_WORK = '.tools/sevenzip-rebuild/native-build-1'
node tools/extended-archive/build-runtime.mjs
$env:SEVENZIP_WORK = '.tools/sevenzip-rebuild/native-build-2'
node tools/extended-archive/build-runtime.mjs
node tools/extended-archive/package-runtime.mjs --build .tools/sevenzip-rebuild/native-build-2
node tools/extended-archive/verify-runtime.mjs
```

Use previously unused object directories for a complete rebuild. Compare the JS
and WASM hashes in the two `build-receipt.json` files before accepting a candidate.
`commands.json` and `build.ninja` remain in each object directory as local build
evidence. Packaging checks receipt/input/binary consistency and the actual source
archive contents. It accepts `--build` or `SEVENZIP_WORK` for the receipt directory,
`--stage` for an ignored staging root and `--product` for the component directory.
The default component destination is `public/vendor/sevenzip`; its docs are
generated from `tools/extended-archive/distribution/` templates. The source
package's internal manifest omits the enclosing source archive's hash to avoid
self-reference; the published manifest adds that hash.

For a standalone source-package rebuild, extract it to an empty directory. Copy
`upstream/7zip-b88c6bc.tar.gz` to `.tools/m10c3/7zip.tar.gz` and
`upstream/wrapper-7b53d4a.tar.gz` to `.tools/m10c3/wrapper.tar.gz`, creating the
directory first. Then run the commands above. Preparation verifies and extracts
those local pinned archives without downloading them. The compiler configuration
uses the Node executable that invokes the build and does not install another Node.

Replace **both** `bounded-sevenzip.js` and `bounded-sevenzip.wasm` together,
preserving the ABI. `av_extract` accepts entry index, a lower-only selected-output
cap and a UTF-8 password or null. The native selected-output cap remains 4 MiB.
No allocator stress probe or extraction-preflight bypass is exported. Preserve
the 16 MiB initial / 64 MiB maximum nonshared wasm32 memory configuration for
AniView's supported policy. Regenerate the matching source/receipt/notices and
manifest, then rebuild AniView and run the relevant archive checks.

`SEVENZIP_SOURCE` permits a local alternative engine tree. If deliberately
modifying the reviewed backport itself, update its expected source identity and
corresponding provenance checks so the distribution describes that modification
honestly. Build-time hash checks verify provenance; there is no runtime hash lock
preventing a modified compatible component from loading. A local modified build
does not require any remote service.

## Retained safeguards and limits

RAR4 raw validation distinguishes non-Unicode names from legal Unicode
separators. It validates compressed-name grammar, copy bounds, surrogate pairs
and decoded length before the original decoder; the exact 1,024 UTF-16-unit
boundary remains supported. Invalid or truncated encodings never fall back to a
different path. Literal Unicode serialization is scoped to Unicode-flagged RAR4
names, retaining private-use characters and legacy escape behavior. RAR5/7z name
serialization is unchanged.

Native BSTR conversion uses explicit lengths and rejects embedded NUL/control
characters. The Worker checks errors before publishing string getters and
preserves precise output/password callback failures over later generic errors.
Encrypted-header failures retain password-or-damage ambiguity where filename
parsing precedes header CRC validation. The backport does not make every decode
failure a password error or prove the entire engine free of security defects.

The component remains read-only and restricted to single-file RAR4/RAR5/7z.
Input 15 MiB, selected output 4 MiB, recognized dictionary 4 MiB, 1,000 entries,
existing path limits and 15-second operation deadlines are unchanged. There is
no multivolume/SFX guarantee, recursive expansion or archive writing. Solid
extraction may process preceding data. The WASM bound covers linear memory,
not JavaScript, Blob storage, compiler/native/GPU memory or total device memory.
A tool blocked by the OS must be addressed through its normal trusted-tool
policy, without weakening the application or browser sandbox.

Engineering license readiness is an engineering assessment, not legal advice or
a guarantee for every combined-work/distribution scenario.
