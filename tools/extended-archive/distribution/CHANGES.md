# AniView component modification record

2026-11-11 — **7-Zip 26.05 + selected 26.06 Rar3/InBuffer security/error-handling
backport + AniView RAR4 filename patch**. Baseline revision
`b88c6bc09339de32f7d18bbab900686b244f42ba`; selected upstream revision
`d3296e39e1f1f92c7b41c0c3848e65640428d42d`; Emscripten 6.0.13 / Node 24.22.1.
This is not a complete upstream 26.06 upgrade.

Exact patch order:

1. `system-emscripten.patch`: retain the Emscripten portability branch.
2. `rar4-filename.patch`: validate full declared raw RAR4 filenames before
   truncation. Reject non-Unicode embedded NUL, invalid encodings and surrogate
   pairs, out-of-prefix copy runs and excessive decoded lengths. Preserve legal
   Unicode separators, encoded zero operands and the 1,024 UTF-16-unit boundary.
3. `rar3-inbuffer-2606-backport.patch`: import only the paired upstream changes in
   `CPP/7zip/Compress/Rar3Decoder.cpp`, `CPP/7zip/Compress/Rar3Decoder.h` and
   `CPP/7zip/Common/InBuffer.cpp`. The RAR3 C byte-reader callbacks catch input
   refill exceptions, retain the input HRESULT and propagate it after normal
   decode return. The byte-reader state initializes for each decode. The shared
   input buffer marks a failed read as finished before throwing so a captured
   failure does not cause another refill. These shared-buffer changes also apply
   to existing registered users such as RAR1/2 and 7z Deflate/Deflate64.

All 189 native compilation units and the final component are rebuilt together;
no object-only substitution is used. The native receipt records source/object
hashes and the complete link-object list, while the manifest records the exact
patch/recipe inputs and official backported source hashes. Packaging retains the
original 26.05 engine archive plus all patches rather than relabeling that archive
as 26.06. Patch application disables automatic line-ending conversion per command.

The existing indexed read-only `native/bridge.cpp` adapter remains in place:
length-aware BSTR conversion, unsafe/limit outcomes, callback-error preservation
and lower-only selected-output caps. Encrypted headers keep existing
password-or-corruption ambiguity. RAR4 literal Unicode conversion remains scoped
to Unicode-flagged names; legacy escape serialization and RAR5/7z names are
unchanged.

The format/codec registration set, Worker protocol, toolchain and nonshared
16 MiB initial / 64 MiB maximum linear-memory configuration remain unchanged.
No CAB handler, RAR writer, additional format, relaxed workload limit, application
feature or unrelated upstream codec refactor is added. The corresponding source,
exact patches, build receipt, full notices and rebuild/replacement instructions
accompany this component under the retained terms in `licenses/`.
