# Android ZIP acceptance samples

These two tiny, original test archives are copied from `tests/fixtures/zip/` by
`tools/archive/generate-fixtures.mjs`. They are deliberate public validation
assets, not user media. Provenance: original project GIF/APNG fixtures and original
two-frame red/green WebP, dedicated to the public domain under CC0-1.0.

- `mixed.zip`: seven entries, three animations in order GIF, WebP, APNG; nested
  paths, directory and hidden/non-media metadata.
- `encrypted-mixed.zip`: public GIF, ZipCrypto WebP, AES APNG, public GIF. The
  public test-only password is `AniView-test`. AniView currently shows a
  password-protected message instead of a password prompt.

No large archives or third-party artwork are published here.
