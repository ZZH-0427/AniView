# Bounded archive development tools

The runtime recipe and native adapter in this directory are the product version
of the isolated M10C2 build. The current identity is **7-Zip 26.05 + selected
26.06 Rar3/InBuffer security/error-handling backport + AniView RAR4 filename
patch**, using Emscripten 6.0.13 / Node 24.22.1 and nonshared 16/64 MiB memory.
This is not a complete 26.06 upgrade. No research allocation probe, native
extraction-preflight bypass or RAR compressor is included.

The production adapter additionally length-checks native BSTR metadata before
UTF-8 conversion, rejects embedded NUL/control characters, and preserves a first
output/password callback error over a later generic decode result. The raw
STORE-only RAR4 negative fixtures `nul-name-rar4.rar` and
`control-name-rar4.rar` live in the generator's `negativeRows` manifest and must
be rejected before metadata publication. `rar4-filename.patch` additionally
validates declared raw names before upstream truncation; a BSTR-only guard cannot
recover discarded bytes. Legal compressed-Unicode separators are preserved.
No native parser exploit is claimed.

The original 26.05 source archive stays pinned. Apply patches in exactly this
order: `system-emscripten.patch`, `rar4-filename.patch`,
`rar3-inbuffer-2606-backport.patch`. The last patch imports only Rar3Decoder.cpp/.h
and InBuffer.cpp from official revision
`d3296e39e1f1f92c7b41c0c3848e65640428d42d`; exact source SHA-256 checks prevent
mixed paired implementations. Patch commands use `git -c core.autocrlf=false
apply` so a Windows global setting cannot change the reviewed LF bytes.

Use `prepare-runtime.mjs --root <fresh-source-root>` and point `SEVENZIP_SOURCE`
to its extracted `source/`. Build twice with two previously unused
`SEVENZIP_WORK` object directories. Compare the JS/WASM hashes in their receipts.
Package with `package-runtime.mjs --build <second-object-directory>` (or retain
`SEVENZIP_WORK`), then run `verify-runtime.mjs`. Packaging requires a schema-2
receipt with the complete 189-unit compile/link set and unchanged native inputs.
It derives binary identity from that receipt rather than an older frozen hash.

The `distribution/` Markdown files are the authoritative notice/rebuild templates.
Packaging refreshes their public copies and ships both templates and copies with
all patches, original source archives and the full native receipt. A fresh
allowlisted staging directory avoids carrying previous package debris forward.
The source package's internal manifest describes the two binaries; only the
outer published manifest adds the enclosing source-package hash. Verification
cross-checks the actual source archive members, build inputs, receipts and notices.

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
