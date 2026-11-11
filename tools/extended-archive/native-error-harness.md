# Controlled native error regression

Run from the repository root after applying the reviewed native patches:

```text
node tools/extended-archive/native-error-harness.mjs --source .tools/m10e-s2/source-lf --label source-lf
```

This independent developer harness requires Node.js 24.22.1 and the existing
Emscripten 6.0.13 SDK (`EMSDK` may select its location). All generated objects,
configuration, JS/WASM, command receipts and results stay under ignored
`.tools/m10e-s2/error-harness/<label>/`. It never patches its input source tree,
loads an archive, constructs an archive, or writes the production runtime.

Before compiling or executing, the runner checks the exact SHA-256 of the three
backported files against the reviewed official 26.06 blobs at upstream commit
`d3296e39e1f1f92c7b41c0c3848e65640428d42d`. It will not execute the old callbacks.
`Rar3Decoder.cpp` is included directly into the test translation unit so its two
static callbacks execute unchanged. `InBuffer.cpp` and the necessary supporting
sources are independently compiled from the supplied source tree.

The 20 cases cover:

- Both PPM callbacks capture `E_FAIL`, `E_ABORT` and nonzero-success `S_FALSE`
  from the real `CInBufferException`, return `0xFF`, preserve the captured HRESULT,
  count extra bytes, and stop refilling the failed stream.
- Reinitialization clears the captured error and buffer state; normal bytes,
  aligned buffered reads and normal EOF keep their original behavior.
- Shared `CInBuffer` input preserves the original HRESULT after buffered bytes.
  Its byte, lookahead, partial/full read and skip APIs do not refill after failure.
  Normal EOF and processed-size accounting survive reinitialization.
- The real `CDecoder::Code` clears a stale status before decoding and propagates
  a captured status over `CodeReal`'s generic `S_FALSE`; an unsuccessful call
  leaves the solid-continuation guard closed.

The Code status cases are white-box unit tests. Only this test translation unit
uses Clang's `-fno-access-control`, which permits access without changing class
layout or editing upstream source. A controlled `Read` observes initialization
and injects the status field saved by the separately tested callbacks. The input
supplies one zero byte to select the LZ table branch and then ordinary EOF.
`CodeReal` rejects the incomplete table; checks require no PPM allocation, no
output writes and exactly two bounded input reads. Its implementation is unchanged.

This establishes source-level error handling, not an admitted archive trigger,
exploitability, or native memory safety in general. It does not throw arbitrary
exceptions across the `ISequentialInStream::Read` noexcept boundary. Successful
normal/PPM decoding, encrypted streams and successful solid sequences remain
separate product/compatibility tests. The harness does not replace those checks.

The executable reports JSON lines and returns nonzero for any failed assertion.
The runner records every compile/link/run command, input hashes, artifact hashes,
the individual cases and explicit coverage limitations in `report.json`.

The initial 2026-11-11 execution is **BLOCKED**, not a test pass: the independent
objects compile, but Windows application control denies the existing pinned
`.tools/emsdk/upstream/bin/wasm-emscripten-finalize.exe` at link postprocessing
with error 4551. Its SHA-256 is
`0abc535fedc4399022373c3cfe9a54291db2fde33aefc5c0b5875037c20acb92`.
The root agent confirmed this for the same command/tool inside and outside the
process sandbox. The checks and toolchain are preserved; no security setting or
tool executable was changed. Host authorization of that exact trusted tool is
needed before rerunning the command above. The blocked receipt is retained under
the ignored output directory; no runnable harness or dynamic result is claimed.
