# AniView component modification record

2026-11-11 — based on 7-Zip 26.05 revision
`b88c6bc09339de32f7d18bbab900686b244f42ba`, Emscripten 6.0.13.

- `system-emscripten.patch`: retain the documented Emscripten portability branch.
- `rar4-filename.patch`: validate the full declared RAR4 filename before the
  upstream legacy-name truncation. Non-Unicode embedded NUL is rejected. Legal
  Unicode separators and zero bytes inside encoded operands remain supported;
  malformed/truncated encodings, invalid surrogate pairs and out-of-prefix copy
  runs are rejected. The existing decoder processes validated names with enough
  bounded space to preserve exactly 1,024 UTF-16 units.
- `native/bridge.cpp`: propagate that failure through existing unsafe/limit
  outcomes. Encrypted headers preserve password-or-corruption ambiguity because
  parsing occurs before header CRC verification. Existing final metadata/path
  checks, selected-output cap and Worker protocol remain in force. Literal
  Unicode conversion is scoped to Unicode-flagged RAR4 paths so private-use
  characters round-trip without changing legacy escape serialization.

The change affects RAR4 filename parsing; RAR5/7z decode implementations, normal
RAR decompression, compiler version and 16/64 MiB nonshared memory policy are
unchanged. The matching source, exact patches and rebuild/replacement recipe
accompany this component under the upstream terms in `licenses/`.
