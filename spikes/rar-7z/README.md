# M10C2 bounded backend experiment

NOT an AniView feature. No product imports, archive UI, npm dependency, ZIP,
Creator, decoder or video changes. Source-only experiment; generated downloads,
fixtures, binaries, compiler objects and browser profiles are ignored.

From the repository root, use the installed Node 24 and existing Emscripten 6.0.13:

```powershell
node spikes/rar-7z/prepare.mjs
node spikes/rar-7z/build.mjs rebuild-1
node spikes/rar-7z/build.mjs rebuild-2
node spikes/rar-7z/fixtures.mjs
node spikes/rar-7z/supplement-fixtures.mjs
node spikes/rar-7z/edge-fixtures.mjs
python spikes/rar-7z/header-bomb.py
node --test spikes/rar-7z/backend.test.mjs
node spikes/rar-7z/runtime-init.browser.mjs
node spikes/rar-7z/package-evidence.mjs
node spikes/rar-7z/serve.mjs 4292
node spikes/rar-7z/run-browser.mjs desktop
```

Build uses `.tools/emsdk` and `.tools/python-build/bin/ninja.exe`; override EMSDK
and SEVENZIP_SOURCE / NINJA_EXE when needed. Ninja is a build tool, not a new app dependency.
`compile.mjs` forces the compiler's Node path to the current official Node runtime.
Build lists come from upstream makefiles, retaining decoders while removing
archive registrations and using Z7_EXTRACT_ONLY. Only 7z/RAR4/RAR5 handlers are
constructed; there is no archive creation or generic format entry point.

Read `contract.ts` for the actual API. Worker handles OPEN/LIST/EXTRACT/METRICS
and returns RESULT/PROGRESS/ERROR with generation+request IDs. Cancel/close/deadline
are parent-side hard termination; a CANCEL message cannot interrupt synchronous
native work. Reopen creates a fresh Worker; source/password state is caller-owned
for the duration of the experiment, not persisted. Fault-injection probe methods
are harness-only and must not be exposed in a product adapter.

Experimental bounds: input32 MiB, selected output8 MiB, 1000 entries, path1024,
total paths128 Ki chars, recognized dictionary8 MiB, cumulative source reads128 MiB,
deadline15 s; initial/max linear memory16/64 MiB, growth enabled. Those values
prove mechanisms; they are **not** approved production or all-Android limits.
Header/dictionary allocations can precede metadata checks; compiled memory cap
is the fallback. WASM cap does not bound browser/compiler/Blob/JS/OS memory.

The password API returns native typed outcomes. Some engine failures remain
ambiguous between corrupted encrypted data and wrong credentials; no text parser
pretends certainty. Passwords and native error text/argv are never logged. Public
test secrets occur only in the fixture harness, not user state.

See THIRD_PARTY_NOTICES.md before distributing any artifact. Phone testing uses
a frozen static production harness under `/AniView/`, no HMR, with an HTTPS tunnel
only to serve test code/assets. Processing never uploads source files.
