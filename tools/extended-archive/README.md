# Bounded archive development tools

The runtime recipe and native adapter in this directory are the product version
of the isolated M10C2 build. They keep the same pinned 7-Zip26.05/Emscripten6.0.13
source and 16/64MiB memory bounds, and remove the research allocation probe and
native extraction-preflight bypass. No RAR compressor was derived or implemented.

The production adapter additionally length-checks native BSTR metadata before
UTF-8 conversion, rejects embedded NUL/control characters, and preserves a first
output/password callback error over a later generic decode result. The raw
STORE-only RAR4 negative fixtures `nul-name-rar4.rar` and
`control-name-rar4.rar` live in the generator's `negativeRows` manifest and must
be rejected before metadata publication. `rar4-filename.patch` additionally
validates declared raw names before upstream truncation; a BSTR-only guard cannot
recover discarded bytes. Legal compressed-Unicode separators are preserved.
No native parser exploit is claimed.

The fixed toolchain remains 7-Zip26.05/Emscripten6.0.13/Node24, nonshared16/64MiB.
Build twice from freshly prepared sources using `rebuild-1` and `rebuild-2` labels
to compare emitted JS/WASM hashes. Packaging checks the native build-input receipt
and includes the exact patches, source archive and dated change record.

Desktop acceptance order after building/packaging:

```text
node tools/extended-archive/rar4-filename-browser.mjs --build dist
node tools/extended-archive/policy-boundary-browser.mjs
node tools/extended-archive/preview.mjs --root dist --port 4295
```

With that preview running, set `ANIVIEW_EXTENDED_BUILD=dist`,
`ANIVIEW_EXTENDED_ROOT=dist` and
`ANIVIEW_EXTENDED_URL=http://127.0.0.1:4295/AniView/`, then run
`compatibility-browser.mjs`, `run-product.mjs` and `lifecycle-browser.mjs` from
this directory. The filename runner generates 43 original cases (19 valid,
24 rejected), independently checks header/data CRC and NAME_SIZE, and requires
the original raw-NUL regression to fail during native opening before listing.
It self-hosts an ephemeral local server. `--baseline --build <preserved-old-dist>`
records the old behavior without granting a PASS. The ordinary compatibility
matrix retains the original RAR4 password/header/solid sequence and its hashes.

`prepare-runtime.mjs` verifies exact source archives. `build-runtime.mjs` builds
the component. `package-runtime.mjs` packages its source/notices and hashes.
`verify-runtime.mjs` verifies the emitted binary memory section, hashes and required
distribution materials; release/build tooling can import its `verifyRuntime` API.
The shipped component's separate README documents replacement/rebuilding.

`fixtures.mjs` creates public original media archives under ignored
`.tools/m10c3/fixtures`. These are never copied by Vite into the normal production
artifact. The generator uses the existing installed 7-Zip26.03 and a separately
obtained official RARLAB RAR7.23 evaluation tool (`RAR_EXE` override), and verifies
every selected file's hash using native 7-Zip independently of the WASM decoder.
RARLAB's trial tool permits at most40days' evaluation; continued tool use beyond
its evaluation period requires a license. It is not bundled, installed into the
system or distributed by AniView. Its own license is retained only in the local
ignored test-tool directory. Obtain an appropriately licensed tool to regenerate
fixtures later. The product uses only the separately licensed read-only engine.

The development download was the official RARLAB page's stable7.23 link:
https://www.rarlab.com/rar/winrar-x64-723.exe . SHA256:
`8ff0daf3ed564cc743c0e23ff2e253997ffc74460f9673f0b6dd037b2db4ce7b`.
Windows Authenticode verified a valid win.rar GmbH signature before use. The
installer was unpacked with installed7-Zip; the installer and shell-registration
tools were not executed. This is tool provenance, not a runtime dependency.

Generated RAR5/7z fixtures contain GIF, animated WebP, APNG, JPEG, PNG and static
WebP plus Unicode text. Public password: `aniview-test`. RAR4 media uses a minimal
uncompressed STORE metadata fixture, verified by installed7-Zip; it does not
implement a compression algorithm or cryptography. Existing pinned libarchive
RAR4 encrypted/header/solid fixtures preserve their original public password
`password` and expected selected hashes. Medium archives use a valid1000×1000
original PNG below4MiB plus bounded synthetic padding, within15MiB input policy.

Preview/browser scripts in this directory are developer validation tools, not
product APIs. They must preserve production `/AniView/` paths and keep samples
out of the ordinary `dist/` artifact. Phone acceptance uses a frozen production
build without HMR; a technical smoke is not a substitute for UI acceptance.
