# Milestone 8A1 GIF encoder package audit

Audited on 2026-10-25 against the published `gifenc@1.0.3` npm metadata,
the downloaded package archive and the installed package. This document
describes an isolated V0.2 technical spike. It does not change the v0.1.0
release licensing audit or assert that the encoder is a shipped Viewer feature.

## Project and dependency licensing

AniView remains `UNLICENSED` with `private: true`. No project LICENSE is added.
Third-party licenses apply to their respective components independently of
AniView's project metadata.

The actual package declares `license: "MIT"` and contains a complete
`LICENSE.md`, copyright 2017 Matt DesLauriers. Its unchanged 1,083-byte text
is retained in [third_party/licenses/gifenc/LICENSE.md](../../third_party/licenses/gifenc/LICENSE.md).
The SHA-256 of both the installed original and retained copy is
`47bc590c39d8ccccfc544875a9faebf44bafa828ef20315b396b5d0629f0cfd6`.

The package's `src/pnnquant2.js` carries acknowledgements for Mark Tyler,
Dmitry Groshev and Miller Cy Chan. Its `src/lzwEncode.js` carries the original
LZW implementation's author and source acknowledgements. Both complete leading
comments are retained in
[SOURCE-HEADER-NOTICES](../../third_party/licenses/gifenc/SOURCE-HEADER-NOTICES),
rather than dropping them when the Worker is bundled or minified. The published
package's top-level license declaration is recorded here; the source comments
are preserved without assigning a separate invented component version.

The standalone experimental build must distribute the complete retained
gifenc texts, together with the notices for other components it bundles.
The v0.1.0 production `public/third-party-notices.txt` remains unchanged.
For Milestone 8A2, the V0.2 branch promotes this exact version to a runtime
dependency of the lazy creator and appends its full license/header notices to
the feature-branch public collection. The published v0.1.0 artifact is unchanged.
The central inventory has a separate
[development component section](../../THIRD_PARTY_NOTICES.md#v02-development-gif-creator).

## Exact package provenance

- Package: `gifenc`, version `1.0.3`.
- Published: 2021-03-07; still the npm registry's latest version when checked.
- Runtime dependencies: none; upstream development tools are not added to
  AniView by installing this package.
- Archive: [official npm tarball](https://registry.npmjs.org/gifenc/-/gifenc-1.0.3.tgz).
- Metadata: [official version metadata](https://registry.npmjs.org/gifenc/1.0.3).
- Archive integrity:
  `sha512-xdr6AdrfGBcfzncONUOlXMBuc5wJDtOueE3c5rdG0oNgtINLD+f2iFZltrBRZYzACRbKr+mSVU/x98zv2u3jmw==`.
- npm tarball unpacked size: 172,516 bytes across 15 files.

The upstream [repository](https://github.com/mattdesl/gifenc) and
[MIT license](https://github.com/mattdesl/gifenc/blob/main/LICENSE.md)
corroborate the package declaration. The published npm archive is authoritative
for this audit: current upstream `main` has changed its package entry metadata
since the npm release, so it must not be substituted for the installed version.
The package is old; passing the spike gates does not establish an active
maintenance or support commitment.

## Published module and browser interface

The actual installed `package.json` declares:

| Field | Value |
| --- | --- |
| `main` | `./dist/gifenc.js` |
| `browser` | `./dist/gifenc.js` |
| `module` | `./dist/gifenc.esm.js` |
| `source` | `./src/index.js` |
| `unpkg` / `jsdelivr` | `./dist/gifenc.esm.js` |
| `exports` map | absent |
| bundled TypeScript declarations | absent |

Both distributed forms expose `GIFEncoder`, `quantize` and `applyPalette`.
The ESM artifact is 9,098 bytes raw and 3,926 bytes with Node's default gzip;
its SHA-256 is
`217761244379253ba5815510d3048a4fb1f4c4dbe9fb51a5cfbfe26f34eec093`.
The CommonJS artifact is 22,617 bytes raw and 5,655 bytes gzip. These are
upstream artifact measurements, not the size of AniView's final Worker bundle.
The main spike report records the actual Vite bundle and browser test results.

The upstream build targets include Chrome 58, Firefox 57, Safari 11, Edge 16
and Node 12. These syntax targets do not establish AniView support for those
browsers: the creation experiment also needs Worker, `createImageBitmap` and
OffscreenCanvas capabilities. The package has no built-in Worker API; AniView
owns the typed protocol, resource lifecycle and cancellation behavior.

## Source-level behavior relevant to the adapter

The published package sources were read directly. The corresponding upstream
[encoder](https://github.com/mattdesl/gifenc/blob/main/src/index.js),
[stream](https://github.com/mattdesl/gifenc/blob/main/src/stream.js),
[quantizer](https://github.com/mattdesl/gifenc/blob/main/src/pnnquant2.js) and
[palette mapper](https://github.com/mattdesl/gifenc/blob/main/src/palettize.js)
provide the public source context; experimental round-trip tests must verify
the installed implementation.

- The first frame supplies the global palette. Passing a palette for a later
  frame writes a local color table. Frames are full-canvas images positioned
  at the origin by the encoder.
- Delay is encoded as `Math.round(milliseconds / 10)` in a 16-bit centisecond
  field. The adapter must validate the representable range. Requested and
  decoded delays belong in the round-trip evidence.
- `repeat: -1` omits the Netscape extension and plays once; `0` encodes forever;
  positive N encodes N repetitions after the first play. Existing AniView
  decoder normalization produces total loop counts `1`, `0` and `N + 1`.
- GIF has one transparent palette index. The quantizer's `oneBitAlpha` option
  thresholds palette alpha after clustering, rather than guaranteeing the
  source pixel's alpha mask. The adapter must explicitly preserve its chosen
  per-pixel threshold and prevent opaque pixels from mapping to transparency.
- Both quantization and palette mapping create a `Uint32Array` over the input's
  entire backing buffer. A subarray with unrelated bytes must not be passed;
  the exact Canvas ImageData buffer is suitable.
- There is no built-in dithering. This audit does not claim photographic or
  gradient quality; measured and visual quality gates remain separate.

## Encoded buffer ownership

`bytes()` calls `slice()` and copies the encoded bytes; `bytesView()` calls
`subarray()` without copying. After `finish()`, the Worker can transfer the
backing ArrayBuffer with the exact valid byte length, discard encoder
ownership, and let the main thread construct a Blob from that valid range.
Capacity bytes beyond the range must never become part of the GIF file.

The default encoder output capacity is 4,096 bytes. Its stream grows by a
factor of two below 1 MiB and 1.125 at or above 1 MiB, while accommodating a
larger immediate write. A growth operation allocates a new buffer and copies
the used prefix, so old and new capacity can overlap transiently. Transferring
the final buffer avoids an additional `bytes()` copy; constructing a Blob has
the platform's immutable byte-ownership semantics and is not assumed free.

The encoder's shared typed LZW scratch is two `Int32Array(5003)` arrays plus a
`Uint8Array(256)`, totalling 40,280 bytes. Quantizer bins and heap, palette-map
cache, current RGBA/index data, source decode resources and the output stream
must also be included in memory reasoning. They are not a retained array of
decoded source frames. Actual peak proxies and capacity are recorded by the
experimental benchmark, without treating those proxies as an OS heap reading.
