# Video → Animation Reference Delta Audit

Status: **Video→Animation Reference Delta Audit: COMPLETE**

Research date: 2026-10-31. Baseline: `feat/v0.2-animation-to-video`, `e7c6215`; frozen product implementation `31813b2`. **This is research, not Milestone 8D1 implementation.** No video-input decoder integration, sampling/resize code, dependency change, product UI, deployment, or merge is included.

## 1. Evidence boundaries and provenance

Labels used throughout:

- **SOURCE CONFIRMED**: read the specified pinned source or installed declarations; this does not mean that code was executed on Android.
- **DOCUMENTED**: the publisher's documentation, README, or public form says this; not an independent conversion/performance test.
- **INFERRED / PROPOSED**: AniView's analysis or recommended policy, still requiring the 8D1 gate.
- **UNKNOWN**: unavailable evidence or a platform-dependent property that public APIs do not expose.

Read together with [the preceding reference audit](video-conversion-reference-audit.md), [license audit](video-conversion-license-audit.md), [8B1 canonical conversion architecture](../spikes/milestone-8b1-unified-animation-conversion.md), [8C1 engineering record](../spikes/milestone-8c1-animation-to-mp4.md), [8C1 Android record](../spikes/milestone-8c1-android-validation.md), [8C2 productization](../milestones/milestone-8c2-animation-to-mp4-productization.md), and [8C2 Android acceptance](../milestones/milestone-8c2-android-validation.md). Existing 8C evidence concerns animation decoding and video **encoding**; it does not prove video **decoding** or sampling.

The installed package is **Mediabunny 1.65.0 / MPL-2.0**. Its `src/media-sink.ts`, `src/sample.ts` and `src/input-track.ts` were byte-hash compared against the previously pinned upstream sources and match. The source authority for this document is commit **cd6612380c7e3f1261d74b9b550e6fc3b65a53bc**. Unversioned live documentation is supporting evidence, not a substitute for that pin.

| Reference | Inspected revision | Primary evidence / licensing boundary |
| --- | --- | --- |
| Mediabunny | `cd6612380c7e3f1261d74b9b550e6fc3b65a53bc` | [Sinks](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-sink.ts), [samples](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts), [track](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/input-track.ts), [source](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/source.ts). Existing dependency; no upstream modification. |
| FrameKit | `b134ad6e873cf84c6d6dd99933e80e3e7d60c127` | [VideoGifApp](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/src/VideoGifApp.jsx), [memory estimate](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/src/utils/format.js). MIT; inspection only. |
| Video-To-Gif-Converter | `ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f` | [Single-page source](https://github.com/dylansallred/Video-To-Gif-Converter/blob/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f/Video-To-Gif-Converter.html). Repository API did not identify a license; do not assume reuse permission. |
| htmlapps-video-to-gif-webp | `4d6ce3e49acffeca3f2af41ef9b97fb78ccab7a2` | [README](https://github.com/ttomohisa/htmlapps-video-to-gif-webp/blob/4d6ce3e49acffeca3f2af41ef9b97fb78ccab7a2/README.md), [UI source](https://github.com/ttomohisa/htmlapps-video-to-gif-webp/blob/4d6ce3e49acffeca3f2af41ef9b97fb78ccab7a2/src/index.template.html), [timing record](https://github.com/ttomohisa/htmlapps-video-to-gif-webp/blob/4d6ce3e49acffeca3f2af41ef9b97fb78ccab7a2/docs/RUNTIME_TIMING.md). App MIT; bundled FFmpeg/runtime licenses remain separate. |
| video-frames | `eb51d359a485493abc2a805141ba21ea79912231` | [Constants/defaults](https://github.com/0ran/video-frames/blob/eb51d359a485493abc2a805141ba21ea79912231/src/data/toolData.js), [extraction](https://github.com/0ran/video-frames/blob/eb51d359a485493abc2a805141ba21ea79912231/src/lib/extractFrames.js). No identified repository license; inspection only. |
| apng-tool | `6bf071d6e800aae6c0ab2d61ab9fc7a99f2b7ef3` | [README](https://github.com/MeiYongAI/apng-tool/blob/6bf071d6e800aae6c0ab2d61ab9fc7a99f2b7ef3/README.md). MIT. Large application HTML could not be retrieved after bounded retries; controls below are DOCUMENTED, not source-verified defaults. |
| gifly | `6dc88303f020aef145047fc1d07dd06923d6b43d` | [Settings](https://github.com/HoijunKim/gifly/blob/6dc88303f020aef145047fc1d07dd06923d6b43d/frontend/src/lib/settings.ts), [timing](https://github.com/HoijunKim/gifly/blob/6dc88303f020aef145047fc1d07dd06923d6b43d/frontend/src/components/VideoTiming.svelte), [size](https://github.com/HoijunKim/gifly/blob/6dc88303f020aef145047fc1d07dd06923d6b43d/frontend/src/components/SizeControls.svelte), [LICENSE](https://github.com/HoijunKim/gifly/blob/6dc88303f020aef145047fc1d07dd06923d6b43d/LICENSE). PolyForm Noncommercial 1.0.0; Windows/Wails/FFmpeg application, not evidence of browser decoder compatibility. |
| EZGIF | Public forms retrieved 2026-10-31 | [GIF](https://ezgif.com/video-to-gif), [WebP](https://ezgif.com/video-to-webp), [APNG](https://ezgif.com/video-to-apng). Live controls and publisher claims; no upload, conversion, or performance benchmark was run. |

There is also a different browser product named [NIKI GIFLY](https://nikitools.shhan.net/niki-tools/gifly). Its indexed publisher description mentions MP4/MOV, three animated output formats, trimming and a 60-frame limit; direct page retrieval failed. Its numeric defaults, actual enforcement, and decoder implementation remain UNKNOWN. The source-audited `gifly` row in this document refers explicitly to **HoijunKim/gifly**; the two products' numbers and licenses must not be mixed.

## 2. VideoSampleSink: exact 1.65.0 semantics

**SOURCE CONFIRMED.** [Public sink declarations and implementations](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-sink.ts#L1890) separate packets in decode order from decoded samples in presentation order. [Live sink documentation](https://mediabunny.dev/guide/media-sinks) agrees.

| Question | Answer and consequence |
| --- | --- |
| `samples(start, end)` order | Presentation order, not packet/decode order. The range machinery seeks to a preceding verified key packet and decodes required dependencies. It can yield the sample at/before `start` as coverage. Do not assume every yielded PTS is ≥ start. |
| B-frames | The native decoder wrapper includes timestamp/reordering handling and AVC SPS workarounds. The sequential range does not stop feeding simply because one packet PTS passed end; decoded presentation timestamps determine the boundary. This is the appropriate foundation, not a new application B-frame reorderer. |
| Units | Mediabunny packet/sample timestamps and durations are **seconds**. WebCodecs native timestamps/durations are integer **microseconds**. Canonical frame duration remains **milliseconds**. Never pass one unit directly as another. |
| `samplesAtTimestamps` selection | Normally the **last source PTS at or before** the requested timestamp: floor/previous, not nearest and not next. Internal comparison uses `sample.timestamp - requested > 1e-10` seconds, so its exact boundary includes a tiny numerical tolerance. |
| Between frames / gaps | A held previous sample is returned until a later PTS wins; selection does not require the requested time to lie within `sample.timestamp + sample.duration`. Thus it is not a strict duration-coverage query. |
| Before first / after last | Before a first selectable frame it may return null. At EOF it can return the last held sample for remaining timestamps, including queries beyond the media end. Missing packets/keys also permit null. Bounds must be validated by AniView before sampling. |
| Exact timestamp / duplicates | Exact PTS selects that frame within the tolerance. Several requested timestamps mapping to the same frame receive separately owned results; the implementation clones held samples for repeated answers. |
| Timestamp order | Nondecreasing timestamps reuse the current decode run where possible. Backward requests are allowed but can restart batches and repeat keyframe preroll. Monotonic is an optimization, not a promise of no decode work for all gaps. |
| Individual `getSample(t)` calls | Each invokes a separate finite timestamp iterator. Calling it N times forfeits a persistent sequential decode context and may repeatedly seek/decode the same GOP. Not the baseline sampler. |
| Lazy input | Both iterable and async iterable timestamps are accepted; no upfront `Array.from` of the whole request list. Nevertheless the producer is pulled ahead and timestamps/results can accumulate internally. Lazy input is not equivalent to output backpressure. |
| Hidden queues | Internal scheduler constant `MAX_QUEUE_SIZE = 4` considers sample queue plus native decode request queue. It is not a cap on all source frames, codec reference surfaces, or GPU memory. A held frame resolving many requests can enqueue a burst of clones without the per-packet throttle limiting that burst to four. |
| Early exit | Iterator `return()` marks termination, wakes waits and closes held/queued samples. It does not close a sample already yielded to the caller, and does not synchronously join all decoder-pump work. Caller-owned samples and job teardown still need explicit cleanup. |

The source locations are [range iteration](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-sink.ts#L484), [timestamp iteration](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-sink.ts#L678), and [decoder wrapper / Android copy](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-sink.ts#L1411).

Upstream [sink tests](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/test/browser/media-sinks.test.ts#L35) assert that all 48 frames are returned for an AVC fixture exercising B-frame reordering, including an Annex-B variant, and assert that a yielded fallback sample survives iterator return. These tests were **read, not run** here. The async timestamp-progress test supplies two timestamps before waiting for the first sample; it is not a proof that an encoder-ACK-gated producer supplying only one timestamp cannot deadlock.

**Recommendation: Yes, use Mediabunny for VFR/B-frame video input in 8D1**, with the acceptance fixtures below. The source supports that design; successful 8D1 desktop/Android video decoding is still unproven.

## 3. SamplingPolicy specification — proposed, not implemented

### 3.1 Timeline origin and trim

Use the video track's visible presentation timeline; ignore audio. Probe metadata and the first displayable samples before fixing the origin.

- `getFirstTimestamp()` is the first **decode-order packet's** PTS; it may be negative/nonzero and is a hint, not a universal visible-origin oracle.
- `computeDuration()` queries the last presentation packet and returns its **end timestamp**, not “end minus first timestamp.” Metadata duration may be approximate.
- Let `T0` be the beginning of valid visible video: the first displayable PTS if positive, otherwise composition zero. Discard fully negative preroll; a sample crossing zero may cover time zero only within the valid edited timeline, with its output time clipped to zero. Do not shift every negative PTS forward and accidentally expose preroll.
- Let `E` be the validated video presentation end. UI duration is `E - T0`. Example: first visible PTS 5 s and end 10 s gives a 5 s clip, not 10 s. A negative preroll packet is not extra visible duration.
- Normalize user trim inward to integer microseconds relative to `T0`: start rounds up, end rounds down; clamp to valid visible bounds, then reject empty ranges. Use half-open **[start, end)**.
- Keep `T0` in track ticks/rational seconds; do not independently round its offset on every frame. Contradictory/nonfinite metadata, no visible frame, or a nonpositive interval is an explicit source/timeline failure.

[Track timing source](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/input-track.ts#L345) and [publisher explanation of negative timestamps](https://mediabunny.dev/guide/packets-and-samples#negative-timestamps) support the distinction. Edited/negative-origin behavior still needs its own 8D1 fixture; ordinary zero-based MP4 is not sufficient evidence.

This is not a promise of general edit-list support: if multiple/empty edits or an edit ending within a frame do not yield an unambiguous valid interval through the available APIs, classify that source timeline as unsupported in the first spike. Do not silently substitute approximate container duration for a validated presentation end. Proposed engineering parameters initially select from zero to the minimum of 5 seconds, visible duration and the dynamic workload limit; no product trim UI is implemented here.

### 3.2 Integer grid and count

For integer output FPS `F`, `Q = 1,000,000`, integer trim start `S`, end `U` and `D = U - S > 0`:

```text
relative grid time g(n) = S + floor(n * Q / F + 1/2),  n = 0, 1, ...
absolute source query = T0 + g(n) / Q seconds
emit only while g(n) < U
durationUs(n) = min(g(n + 1), U) - g(n)
canonical durationMs = durationUs / 1000
```

This is round-half-up from a rational grid, not repeated floating-point addition. Durations are positive and sum to exactly `D` integer microseconds. Compare source PTS recovered in track ticks against requested rational time; use safe integer/BigInt cross-products. The application's exact floor-PTS policy is explicit; the library's internal `1e-10` tolerance is not a product timing contract.

For positive integer-microsecond `D` the exact grid count is:

```text
N = ceil(F * (2 * D - 1) / (2 * Q))
```

This is the count of grid points, not an implementation added in this audit. A preview utility and actual sampler must use the same definition. **Do not use `ceil(D * F / Q)` blindly after rounding grid timestamps.**

| Case | Expected canonical result |
| --- | --- |
| 1 s at 10 FPS | 10 frames; 100 ms each; no frame at the excluded 1 s endpoint. |
| 1.03 s at 10 FPS | 11 frames; last 30 ms; total 1.03 s. |
| [2 s, 7 s) at 15 FPS | 75 frames; source queries offset by `T0 + 2 s`; canonical output begins at zero. |
| 10 s at 15 FPS | 150 frames; alternating rounded microsecond intervals; total exactly 10 s. |
| 41,667 µs at 24 FPS | **1** frame: the next rounded grid point is 41,667 µs and is excluded. Naive ceiling would incorrectly say 2. |
| VFR source / target grid | Select most recent source PTS ≤ each query. Hold a frame for repeated target slots, skip short source frames not hit by the grid. Do not assume source average FPS. |
| CFR with B-frames | Feed/decode in codec order through the library; sample its presentation stream. Never assign frames using packet sequence index or DTS. |

For duplicate source PTS, use the last sample in the stable presentation stream at that timestamp, closing superseded handles; reject nonfinite/decreasing output PTS rather than inventing a new sort buffer. Record exact-boundary and duplicate-PTS behavior in the fixture oracle.

### 3.3 Chosen algorithm and the timestamp-iterator alternative

**Proposed baseline:** one sequential `VideoSampleSink.samples` iterator, with an AniView floor-PTS sampler retaining current sample and at most one lookahead. Consume/close skipped source samples; retain the current sample across repeated target times without cloning it for every output. Reuse its pixels through the output Canvas, then wait for encoder acceptance before the next canonical buffer.

Find the preceding verified key packet for the requested start, enforce a provisional preroll guard, and begin the observable sequential run at that key timestamp where practical. This lets the job count preroll samples it actually receives, instead of pretending output sample count measures all decode work. The sink still controls codec preroll/reordering internally; its hidden work is not completely observable.

A finite, **small bounded** `samplesAtTimestamps` batch is a useful comparison in 8D1, not the default whole-clip iterator. Do not feed all 150 timestamps and assume only one native frame is retained. Do not connect a single-credit async timestamp producer directly to the encoder ACK: resolving a held source sample may require the next source frame or timestamp EOF, so such a feedback loop can deadlock. Finite batches avoid that particular producer deadlock but can repeat seeks and still need clone/queue measurements.

## 4. Orientation, pixel aspect, and resize

### 4.1 Metadata is not baked pixels

**SOURCE CONFIRMED.** The track exposes coded size, square-pixel size, display size, transformation matrix, rotation and flip. `VideoSample` retains orientation metadata; it is not automatically an upright RGBA image. Track display dimensions may contain overrides. A native `VideoFrame` constructor path in 1.65.0 does not simply adopt the native frame's rotation/flip as the library's metadata.

Use track coded dimensions for input limits, and display/square-pixel dimensions plus rotation for aspect-correct output planning. In this version `VideoSample.codedWidth/codedHeight` alias visible-rectangle dimensions (source comments defer a correction to v2); they are not the sole authoritative coded-allocation guard.

[Track geometry](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/input-track.ts#L637), [sample geometry](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts#L302), [PAR tests](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/test/browser/par.test.ts), and [transformation metadata tests](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/test/node/video-transformation-metadata.test.ts) were inspected.

The library's matrix helper assumes rotation followed by optional horizontal flip and snaps to multiples of 90°. Initial scope therefore covers standard 0/90/180/270° orientation, flip, and pixel aspect ratio. Arbitrary shear/affine effects are not silently declared supported.

Canonical animation pixels must be **upright, full-canvas, square-pixel RGBA8**, with no residual rotation metadata. Resolve orientation exactly once at the source boundary. No format-specific changes to Player/Renderer are needed.

### 4.2 Three resize paths

| Path | Operations / ownership | Memory and quality implications | Decision |
| --- | --- | --- | --- |
| A. `VideoSample.transform` → `copyTo({format: RGBA})` | Transform uses a Canvas and returns a **new** sample; original and transformed sample are separately owned. The option is `rotate` (additional rotation), not CanvasSink's `rotation` override. Both width/height need explicit fit. | Bakes rotation/flip/PAR, normalizes orientation, and can use mipmap scratch canvases for >2× downscale. Canvas constructor creates another native VideoFrame where available; RGBA extraction adds a CPU buffer. Module-level transformation Canvas cache retains up to three canvases. Native conversion support still needs probing. | Good reference/quality comparison; not the initial minimum-allocation path. |
| B. `CanvasSink` with width/height/fit/pool | Wraps a VideoSampleSink, transforms/draws, closes the source sample, yields a Canvas wrapper. | **Default poolSize 0 creates a new Canvas per yield**; explicitly choosing 1 reuses it. Mipmap scratch/cache can still exist. Timestamp methods inherit clone/queue behavior. Sequential Canvas conversion transforms even samples the grid would later skip; pool 1 overwrites earlier contents when advancing. No public dispose/close method releases every Canvas immediately. | Convenient reference path; not chosen for sampling current+lookahead. |
| C. `VideoSampleSink` → one owned output OffscreenCanvas via public `sample.draw` → `getImageData` | Only selected frames are drawn. Derive output dimensions from upright display aspect; use public `sample.draw(context, 0, 0, W, H)` to apply library rotation/flip/PAR. Transfer the returned ImageData backing buffer. | One application output Canvas, one canonical RGBA buffer; avoids transformed-sample VideoFrame and transformation-cache/mipmap path. GPU/CPU backing copies remain implementation-dependent. Canvas smoothing quality is a hint; strong downscales can differ from the library mipmap path. | **Recommended 8D1 baseline**, subject to visual-quality and Android gates. |

[Transform/cache source](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts#L1567), [public draw](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts#L1136), and [CanvasSink conversion](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-sink.ts#L2208) establish these differences. [Upstream pixel tests](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/test/browser/video-samples.test.ts#L423) cover draw/transform with flip and rotation; those tests were not executed here.

Do not replace C with direct `drawImage(sample.toVideoFrame())` while ignoring orientation metadata, or write new rotation/crop mathematics. No raw YUV resizer is recommended. If C's downscale quality fails, measure A/B before selecting a more complex bounded scratch strategy.

## 5. RGBA extraction, color, and alpha

### 5.1 Extraction routes

**SOURCE CONFIRMED.** Native `VideoFrame.copyTo` and Mediabunny `VideoSample.copyTo` can copy planes. Default output may be native I420/NV12, not RGBA; the default allocation size is not necessarily `W * H * 4`. Requesting an RGB format, a layout, or color conversion does not itself guarantee all browsers accept that combination. Raw copy does not bake rotation, PAR or resize. Some library-backed conversion paths create temporary native frames.

For path C, obtain a Worker OffscreenCanvas 2D context, use an sRGB RGBA8 readback, and transfer `ImageData.data.buffer` without a redundant `slice`. Validate exact byte length/offset and ownership. This is **one explicit CPU RGBA materialization**, not zero-copy video decoding: native YUV→RGB, rendering, readback, and encoder WASM copies still exist.

A direct RGBA copy probe is useful for no-resize/no-orientation comparisons, but it is not the universal first path. `toCanvasImageSource()` is borrowed: for some backing types it returns a temporary native frame automatically closed on the next microtask. Use it immediately; do not store it across `await`. `toVideoFrame()` returns a separately owned frame that needs its own close.

[Sample copy/ownership source](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts#L825), [image-source conversion](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts#L1542), and [WebCodecs VideoFrame/copy contract](https://www.w3.org/TR/webcodecs/#videoframe-interface) are primary references. The specification defines API behavior, not a guarantee of identical RGB rounding or memory allocation across drivers.

### 5.2 Color/HDR policy

**PROPOSED:** first 8D1 tests opaque 8-bit SDR AVC MP4 and VP9 WebM. Probe the effective decoder configuration in the actual Worker, then decode/draw/read at least one real frame. `isConfigSupported`/`track.canDecode()` alone is not proof that the entire file succeeds.

Use codec profile/bit-depth metadata and exposed decoded format to exclude known 10/12-bit/HDR inputs; reject PQ/HLG/BT.2020 and unsupported wide gamut explicitly. Mediabunny's `hasHighDynamicRange()` is a conservative flag that also includes some wide-gamut primaries; do not describe every flagged P3 SDR file as physically HDR. If bit depth/profile cannot be established for the proposed restricted input set, fail clearly rather than claim a verified SDR8 path. Untagged accepted SDR may use the library/browser's color defaults, and is not a colorimetric fidelity guarantee.

No manual YUV conversion, tone mapping, HDR-to-SDR promise, or wide-gamut pipeline is added. Rotation/aspect/order tests should use robust color patches and an independent oracle; native video-to-RGB output is not expected to be byte-identical across browsers.

### 5.3 Alpha video

**Defer VP9 alpha / transparent video beyond 8D1.** Check container/track transparency before creating the sink. The source has separate alpha decode/merge paths that can create additional Workers and queues; opaque-video resource reasoning does not cover them. Reject transparency explicitly; do not silently flatten an allegedly preserved-alpha conversion. Alpha animation outputs from opaque video simply contain opaque RGBA pixels. Future alpha-video work needs its own decode, premultiplication, composition and ownership gate.

## 6. Ownership, cancellation, and memory model

### 6.1 Resource ownership

| Resource | Owner / release |
| --- | --- |
| Source VirtualFile and local source handle | Input adapter/controller; release only owned data. A borrowed file must not be invalidated when another consumer owns it. No uploads. |
| Input / CustomSource / range requests | Video source Worker; `Input.dispose()` plus source dispose callback aborts/invalidates pending reads. Stop after cancellation/job generation change. |
| Sequential iterator and internal held samples | Library; explicitly request iterator return on error/cancel/early finish. This is not a synchronous decoder-pump join. |
| Yielded current/lookahead VideoSample | AniView source adapter; `close()` in all completion, advance, limit, error and cancellation paths. Do not assume iterator return closes yielded results. |
| Original vs transformed sample, or native clone | Separate owned objects. Close each. Closing a sample created with a native VideoFrame closes that owned frame; it is not a borrowed constructor argument. |
| Output Canvas/context | Source Worker; reuse, clear/reset dimensions during orderly teardown, then terminate the job Worker. No claim that dimension reset instantly frees driver memory. |
| Canonical RGBA ArrayBuffer | Source → broker → encoder by transfer; exactly one in flight. After transfer it is detached at the old owner. Encoder ACK is the next-frame credit. |
| Encoder and output | Existing encoder Worker; dispose on any outcome. Result encoded buffer/Blob may outlive job Workers until result close; object URLs must be revoked independently. |

`VideoSample.close()` is idempotent and releases its native frame/reference, but Canvas/non-native storage ultimately also involves GC. `clone()` creates another handle/reference, not necessarily a deep pixel copy; both handles still need closing. These distinctions are visible in [sample lifecycle source](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts#L709).

Proposed cancellation order: invalidate job → stop credits/range RPC → return iterator and close caller-owned samples → dispose Input/source and encoder → revoke job-owned URLs → terminate job Workers in finally. If cooperative shutdown stalls, bounded hard termination is the fallback. Do not flush/decode the remainder of a video merely to cancel. Late messages must be discarded by job ID without attaching stale results.

### 6.2 Android hidden work: mandatory correction to the old model

**SOURCE CONFIRMED.** In 1.65.0 the Chromium+Android native decoder wrapper uses a source-visible-size OffscreenCanvas in `copyFrameIfNeeded`. It draws the decoded VideoFrame, creates a replacement VideoFrame, and closes the original. During flush it can read a 1×1 pixel region to force completion. This applies before AniView receives the sample, even when AniView chooses path C or avoids `transform`.

Consequences:

- “One application output Canvas” does **not** mean one Canvas in the entire pipeline.
- The internal source-sized Canvas and native replacement frames must be included when comparing 1080p input with a 480-pixel output.
- Lower output dimensions alone do not remove source-resolution decode/DPB/Canvas cost.
- Native `decodeQueueSize` measures pending decode requests, not total DPB/reference/GPU surfaces.

### 6.3 Peak inventory and what can be measured

| Item | Proposed bound / evidence |
| --- | --- |
| Application current + lookahead source samples | ≤2 owned handles in the chosen sampler, including repeated target times without per-slot cloning. **Proposed**, not measured yet. |
| Internal sink/decoder buffers | Scheduler threshold 4, plus held/reordering/reference frames. Not a total frame count bound; timestamp-batch clones can exceed 4. |
| Application output Canvas | 1, logical RGBA size `4 * Wout * Hout`; actual CPU/GPU backing may be larger/multiple allocations. |
| Canonical RGBA | 1 in-flight buffer, `4 * Wout * Hout`, ownership transferred through broker. |
| Android source-copy Canvas | Typically 1 internal source-visible-size Canvas in this path, plus native frame resources. Lifetime ends with decoder wrapper/Worker reclamation, not output-frame ACK. |
| Transform/CanvasSink alternative | Can additionally retain up to 3 transformation-cache canvases and large mip scratch; CanvasSink pool is separate. Not present as an application choice in C. |
| Encoder working memory | Existing GIF indexed/palette/LZW storage, WebP WASM input/codec heap, or APNG scanline/compression chunks. These are in addition to canonical RGBA; do not call the encoder zero-copy. |
| Encoded result | Existing 64 MiB cap; accumulator capacity and final buffer/Blob overlap can transiently exceed valid output bytes. No raw-frame array is retained. |
| Range source | Proposed explicit 4 MiB CustomSource cache, no prefetch; ≤1 MiB application RPC chunk in flight. Parser metadata/other internal read buffers are separate. |
| Native decoder / GPU allocation | **UNKNOWN exact bytes**. No reliable standard JS counter exposes hardware DPB, GPU copies, or immediate physical reclamation. Record owned handles/counters and available process-level observations without inventing a peak MB value. |

An existing `decoderHeapBytes = 0` can mean no WASM decoder heap; it must not be presented as zero native video-decoder memory. Keep native allocation explicitly unknown rather than folding it into a measured-zero counter.

A useful accounting model is:

```text
known logical memory =
  output Canvas backing + one canonical RGBA
  + Android source-copy Canvas (where used)
  + source/cache/RPC and parser metadata
  + target encoder working storage and encoded output/capacity

plus UNKNOWN native decoder/reference surfaces, GPU backing, browser copies and GC overlap.
```

For scale: 1920×1080 RGBA is 8,294,400 bytes; 480×270 RGBA is 518,400 bytes. An Android source-copy Canvas can therefore dwarf the application output buffer. These are logical sizes, **not independently measured process/GPU peaks**.

The public iterator cannot account exactly for every internally prefetched/preroll/native frame. A decoded-sample work counter measures exposed samples, not total hardware work. Start the observable run at a verified keyframe when possible, count preroll, constrain preroll span and wall time, and report residual hidden work. Do not rename a partially observable counter “all decoded frames.”

## 7. Product benchmark: controls, not imported architecture

**No black-box media conversions or performance measurements were run against these products.** The table reports inspected controls/defaults or publisher documentation. A warning is not automatically a hard enforcement limit.

| Product | Trim / count preview | FPS | Size / Original / upscale | Frame/duration guard | Crop / speed / warning | What AniView can borrow |
| --- | --- | --- | --- | --- | --- | --- |
| EZGIF | Start/end, current-position buttons; public forms default 0–5 s. Count-preview behavior UNKNOWN. | Current public numeric forms default 10; GIF 1–50, WebP/APNG 1–60. | Current client controls: by width or height, value 800, max 1280; help also describes Original. Do not conflate help/server and current client defaults; upscale enforcement UNKNOWN. | Publisher lists GIF max 60 s, WebP/APNG 30 s, 200 MB input. A universal fixed 300-frame cap was **not established**. | Crop/aspect/black-bar choices. Speed on these specific forms not established. Local-processing option is now advertised; not accurately described as server-only. | Clear trim, size/FPS together, loop and reduced-size guidance. Do not copy its larger limits or claim an independently tested local decoder. |
| FrameKit | Segment start/end, timeline, estimated count `max(1, round(D*F))`. Generation distributes N times inclusively between start and end. | 1–30, default 12. | Default Original; long-edge fixed presets 640/500/480/320/256/200/160/128/80/64 plus percentages; fixed reductions omitted when ≥ source. | No hard frame cap in inspected generate path. RGBA estimate warns >200 MiB, danger >800 MiB; generation button does not thereby enforce a memory cap. | Crop, chroma key; speed 0.5–3×. Accumulates all ImageData frames before encoding. | Visible estimate and size presets. **Do not copy inclusive endpoint sampling, all-frame retention or warning-only memory protection.** |
| Video-To-Gif-Converter | Start/end, estimate uses ceiling of speed-adjusted duration × FPS. | 5/10/15/24/30, default 10. | Original and 90/80/75/70/60/50/40/30/25/20% size options. | >600 frames produces a “large conversion” warning in the inspected plan; a hard 600 cap is not established there. | Crop/geometry controls; speed 0.25–5×; workload warnings. | Preview-before-generate, understandable presets. Do not copy browser-video seek as an accurate frame extraction contract. |
| htmlapps-video-to-gif-webp | Start/end, 0.1 s or one-output-frame fine adjustment, estimated frame summary. | 10/15/20/30 + custom 1–60; default 15. | Width 320/480/720/Original + custom 16–4096; default 480; default target WebP. | Heavy confirmation when duration >15 s, frames >450, large Original, width≥720 with >300 frames, or lossless WebP >180. These are warnings, not a verified hard frame cap. | Crop/aspect, loop, quality; speed control not established. FFmpeg/WASM underlies conversion. | Compact settings and explicit workload confirmation, encoded tail-duration regression tests. Do not import its engine or thresholds. |
| video-frames | Start + optional duration, estimated count uses `floor(D*F)`; numbered sequences. | Custom 1–60, default 10; presets include 24 and 5. | Default original dimensions, custom width/height, aspect lock; max dimension 4096. | Source 100 MiB/300 s; hard 6000 frames; 1.2 billion output pixels PNG / 4 billion lossy; 900 MiB encoded accumulation. | Crop/speed not established. Collects encoded images in ZIP, first 10 preview Blobs. | Count/budget messaging and aspect lock. It exports a static image sequence, not animated GIF/WebP/APNG; its large ZIP budgets and seek-timeout behavior are unsuitable here. |
| apng-tool | DOCUMENTED dual-handle trim and fixed-total-frame mode; exact count-preview implementation UNKNOWN. | DOCUMENTED original/60/30/24/15/10/custom; default UNKNOWN. | DOCUMENTED Original/1080p/720p/480p/360p/custom and aspect lock; default/upscale guard UNKNOWN. | Hard max frame/workload limits UNKNOWN from retrieved evidence. | DOCUMENTED center crop, contain black bars, stretch; speed UNKNOWN. IndexedDB history is outside this task. | Trim, aspect-preserving presets and explicit fixed-count option for later product design. Do not assume safe bounds or adopt persistence. |
| gifly — HoijunKim | Start/end seconds, 0.1 s UI steps; count preview UNKNOWN. | Default 15; chips 10/15/24/30, positive custom input. | Default width 480; 240/360/480/640 chips; derived height/aspect choices; Original/upscale guard not established in inspected controls. | Hard frame cap/workload cap UNKNOWN in inspected settings/validation. | 0.25–4× speed, reverse/boomerang controls; target-size setting. | Grouped timing/size controls and collision-safe export naming as UI references. Desktop FFmpeg architecture and noncommercial source are not adopted. |

For exact source anchors: [FrameKit defaults](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/src/VideoGifApp.jsx#L49), [FrameKit generation](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/src/VideoGifApp.jsx#L564), [Video-To-GIF settings](https://github.com/dylansallred/Video-To-Gif-Converter/blob/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f/Video-To-Gif-Converter.html#L3324), [its warning](https://github.com/dylansallred/Video-To-Gif-Converter/blob/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f/Video-To-Gif-Converter.html#L6193), [htmlapps workload rule](https://github.com/ttomohisa/htmlapps-video-to-gif-webp/blob/4d6ce3e49acffeca3f2af41ef9b97fb78ccab7a2/src/index.template.html#L1003), and [video-frames caps](https://github.com/0ran/video-frames/blob/eb51d359a485493abc2a805141ba21ea79912231/src/data/toolData.js#L13).

## 8. FPS, size, trim, and last-frame recommendation

### 8.1 FPS

- **GIF: 5 / 10 / 20, default 10, normal maximum 20 FPS.** Keep 15/24/30 as timing experiments, not ordinary first-spike presets. Existing GIF delay is centisecond-quantized; independent per-frame rounding makes 15 FPS approximately 1.05 s per nominal second and 30 FPS approximately 0.9 s, before special short-delay normalization. This differs from encoders that alternate quantized delays using cumulative timestamps.
- **WebP / APNG: 5 / 10 / 15 / 20 / 24 / 30, default 15, maximum 30.** WebP uses integer-millisecond cumulative timestamps; APNG uses a bounded rational seconds fraction.
- Do not infer source FPS from packet count and then sample by frame index. Target FPS is a user/output policy; source VFR remains PTS-based.
- Loop defaults to `playCount = 0` (forever), speed fixed to 1 in 8D1. Audio, speed/reverse/boomerang, custom fractional FPS and editing are deferred.

These recommendations deliberately differ from some benchmark defaults because AniView is reusing **its existing encoders**. Current policy is visible in [GIF adapter](../../src/creation/gif/gifenc-adapter.ts), [conversion verification](../../src/conversion/conversion-session.ts), [WebP encoder](../../src/conversion/webp-encoder.ts), and [APNG delay conversion](../../src/conversion/apng-encoder.ts).

### 8.2 Size

Default **long edge 480**; presets **360 / 480 / 720** for the engineering controls. Preserve upright display aspect ratio, round each derived dimension to a positive integer, and **never upscale**: scale = min(1, requestedLongEdge / sourceDisplayLongEdge). These are long-edge caps, not unconditional output widths; portrait content gets the same workload protection.

For the initial spike, output long edge ≤720; Original is allowed only when the original upright dimensions already meet that bound and all pixel/frame budgets. Original is not an exemption. A 319×241 source remains 319×241 under a 480 preset. 1080p input can be decoded and reduced, but cannot select Original in this first-spike policy.

Animated output needs no H.264 even-dimension padding; retain correct odd dimensions. No crop, stretching, custom resizer, 1080-output preset or silent aspect changes. Strong-downscale visual quality remains a gate.

### 8.3 Tail and target quantization

The canonical last duration is **remaining selected time**, not another whole frame interval and not zero. `1.03 s / 10 FPS` therefore ends with 30 ms; all canonical durations sum to 1.03 s.

Keep this separate from encoded timing:

- GIF: existing centisecond rounding; AniView readback normalizes delays below 20 ms to 100 ms. A tiny tail must not silently be called duration-preserving.
- WebP: cumulative timestamps and final endpoint round to milliseconds; duplicate frames may coalesce. Physical encoded frame count may be smaller than canonical sampled count while visual duration remains correct.
- APNG: `apngDelay` chooses a bounded fraction (16-bit numerator/denominator). Fractional-millisecond paths must be measured; extremely tiny positive durations can quantize to zero.

**Proposed first-spike policy:** preserve exact positive canonical tail, predict target timing before generation, and reject/mark explicitly unrepresentable settings (including zero-quantized intervals or GIF legacy short-delay cases). Do not pad a whole interval, silently drop a sampled frame, or change existing encoders to disguise error. Such settings need a typed target-timing validation result; they are not an out-of-memory error. The harness must report canonical duration, encoded duration and expected target quantization separately.

## 9. Provisional limits and workload guard

All numbers below are **experimental recommendations for 8D1**, not new product limits, measured Android maxima, or changes to existing global constants.

| Item | Proposed first-spike value | Reason |
| --- | --- | --- |
| Sampled output frame cap | **150** | Conservative new video-input baseline; enough for 10 s at 15 FPS at a small size. Existing encoder metadata cap stays 200. |
| Why not 200 / 300? | 200 can be reconsidered after decode measurements; 300 conflicts with the existing 200-frame encoder cap | Existing image-source success does not establish native video-input peaks. Frame-pixel budget often binds before count. |
| Target FPS | GIF default 10/max20; WebP/APNG default15/max30 | Timing and existing encoder semantics above. |
| Output dimensions | Default long480; max long720; no upscale | Bound output Canvas/readback/encoder work; input decoding is guarded separately. |
| Output frame-pixel workload | **15,360,000** pixels over the entire job | Reuse existing workload ceiling without raising shared limits. |
| Selected visible duration | **≤30 s**, additionally constrained by exact count and pixel budget | Not a blanket 30 s promise. Small low-FPS clips only approach this ceiling. |
| Input container/codec | MP4 AVC or WebM VP9, opaque SDR8 | Actual Worker configuration and first-frame draw/readback probe required. |
| Input coded dimensions | Each side ≤2048 **and area ≤2,073,600 pixels** | Admit ordinary landscape/portrait 1080p while reducing the old broad 4 MP suggestion; Android source-copy/DPB cost remains source-sized. |
| Source/output encoded bytes | 64 MiB each | Existing conversion byte limits; include output capacity/Blob overlap in measurements. |
| Observed source samples | ≤1800 exposed decoded samples, including observable preroll | Additional CPU/work guard; not a claim to count hidden decoder output. |
| Observed decoded-source pixel work | ≤622,080,000 source pixels | Roughly 1080p ×300 frames. Independent of output sampling; provisional, not a peak-memory formula. |
| Keyframe preroll | ≤5 s before selected start | Prevent very distant keyframes from creating unbounded startup work. Verify actual packet key status. |
| Job deadline | 120 s, cooperative cancel plus bounded hard Worker termination | Operational recovery guard; not a throughput guarantee. |
| Source read cache / RPC | Explicit 4 MiB / ≤1 MiB chunk, no prefetch | Avoid default/cache assumptions and full-file copies. Other parser/native allocations remain separate. |

For output dimensions W×H:

```text
K = min(150, floor(15,360,000 / (W * H)))
reject if K < 1
maximum candidate durationUs = min(30 * Q, floor(K * Q / F + 1/2))
accept only if the exact grid count N <= K
and all input, observed-decode, target-timing and runtime guards pass
```

This gives a duration cap derived from both FPS and output dimensions; do not compute count one way in preview and another in generation.

| Proposed job | Output workload | Decision |
| --- | --- | --- |
| 320×240, 10 s, 15 FPS | 150 ×76,800 =11,520,000 | Passes output guards; input/decode guard still applies. |
| 480×270, 10 s, 15 FPS | 150 ×129,600 =19,440,000 | **Reject/reduce selection** despite meeting 150-frame cap. At most 118 frames, about 7.866667 s on this grid. |
| 720×405, 10 s, 15 FPS | 43,740,000 | Reject; at most 52 frames under the pixel budget. |
| 1080p input →720×405, 5 s, 10 FPS | 50 ×291,600 =14,580,000 | Passes output guards; 30 FPS source is ~311 million decoded source pixels before preroll, so verify remaining decode budget. |
| 1080p60 input →small output, long low-FPS selection | Output may fit | Can still fail the independent source-decode pixel/work/preroll guard. Shrinking output does not make source decode free. |
| 4K input →360-pixel output | Small output | Reject input coded-size guard in the first spike. |

Counters should distinguish sampled frames, consumed source samples, observable preroll, source pixels, input bytes/read bytes, output bytes/capacity and stage times. Incremental guards apply before requesting/processing the next application-owned item. Hidden prefetch/DPB means these operational limits cannot be advertised as an exact hardware decode-work cap.

## 10. Proposed 8D1 architecture and contracts

```text
local File → existing VirtualFile
  → controller-owned range-read RPC (bounded chunks, cancellation)
  → one VideoSource Worker:
       Mediabunny Input with explicit MP4 / WEBM formats
       metadata/config/first-frame probe
       timeline + output-size + exact-grid plan
       verified keyframe seek → sequential VideoSampleSink.samples
       current/lookahead floor-PTS sampler
       public sample.draw → one output OffscreenCanvas
       one canonical RGBA8 buffer + canonical duration
  → main-thread job broker (transfer only; no pixel work)
  → one existing AnimationEncoder Worker:
       GIF / libwebp-WASM / APNG
  → encoded bytes → bounded result Blob / object URL
```

Reuse [VirtualFile](../../src/input/virtual-file.ts), [AnimationFrameSource / CanonicalAnimationFrame / AnimationEncoder](../../src/conversion/model.ts), existing encoder factories/Workers and resource tracking. Proposed source metadata supplies upright width/height, exact planned sample count and playCount; `next` yields sequential canonical index/duration/RGBA, `acknowledgeFrame` releases the next credit, `reset` closes old resources before starting a new run, `close` is idempotent. These are design obligations, not new code in this research task.

Use `CustomSource` with local range reads, explicit cache size and no prefetch; its read contract can return a stream of bounded chunks. Avoid `VirtualFile.read()` without bounds and an entire-file ArrayBuffer sent to every Worker. File slices and archive entries have different backing costs: first 8D1 harness should use local files; later ZIP support must account for extracted entry ownership rather than assume all VirtualFiles are disk-backed. No remote URL source is needed.

Only one conversion job at a time. Two job Workers are the initial topology: source and existing target encoder; capability/metadata probing stays in the source Worker rather than an extra persistent Worker. No MessageChannel pipeline, parallel targets, decoder on main, new MP4 demuxer, custom H.264/VP9 codec, WebGL resizer, FFmpeg WASM, or decoded-frame list.

Backpressure is **encoder acceptance → next canonical frame credit**. Do not advance sample iteration or perform another readback merely because a postMessage returned. Range chunks also have bounded requests and cancellation. The broker never holds an expanding pending-frame array. The source may retain current/lookahead handles while the encoder consumes the single transferred buffer; library/native internal queues remain distinct.

Input probing includes actual MP4/WebM binary/container evidence, selected video track, effective codec/profile, dimensions, timebase/end, orientation/PAR, transparency/HDR flags, Worker APIs and one real decode/draw/readback. Do not trust MIME or extension. Ignore audio without decoding it. Defer MOV/QuickTime, generic MKV, HEVC, AV1, VP8, live/HLS, audio-only, DRM/encrypted and unsupported-profile files; fail clearly rather than introduce an automatic heavy fallback.

The engineering harness should remain separate from production navigation, Player, Decoder interfaces used by the viewer, MediaSession, CreationSession and resource limits. Future video viewing and conversion should share this source boundary; this does not require integrating video into the Viewer during 8D1.

## 11. Proposed 8D1 test matrix and gate

These are future required tests, **not completed tests**.

| Fixture / scenario | Oracle and required observations |
| --- | --- |
| Tiny MP4 AVC CFR | Numbered/color-coded frames, PTS/timescale, expected dimensions and floor-PTS selection. All three targets reopen. |
| Genuine AVC B-frames | Independently record DTS≠PTS and expected presentation order; assert no loss/reorder/duplicate mapping. A filename containing “B” is not proof. Use a tiny offline-generated fixture with packet manifest or a licensed upstream sample; no FFmpeg runtime dependency. |
| VFR MP4 | Irregular PTS/durations, including short frames and held frames; compare every target-grid selection with an independent manifest. Average FPS/index sampling must fail this fixture. |
| VP9 WebM | Opaque SDR8, actual Worker decode/configuration and RGB extraction, all three targets. |
| Rotation / PAR / portrait | 90° smartphone-like MP4 mandatory, plus 270°/flip and nonsquare PAR fixture where available. Corner labels verify no double rotation, stretch, clipping or swapped dimensions. |
| Timeline offsets / edits | Positive first PTS, negative preroll/cross-zero and non-keyframe start; correct visible duration, first image, excluded endpoint, bounded preroll. |
| Fractional trim tail | 1.03 s at 10 FPS →11 canonical frames/30 ms tail; 41,667 µs at24 FPS →1 frame. Tiny target-unrepresentable tails produce explicit classification, not false exact-duration claims. |
| Long source / middle trim | Seek to a middle 2–7 s interval of a longer file; prove no full-file decode, count observable preroll and test distant-key rejection. |
| Held frame / timestamp comparison | Very low-frame-rate or long-static source sampled at higher target FPS; compare sequential baseline with a finite timestamp batch, exposing clone bursts and avoiding ACK-producer deadlock. |
| Resize / no upscale | 1080p →480 and720; 319×241 stays original under480 preset; strong downscale quality, odd dimensions, aspect and correct upright pixels. |
| Limits / malformed / unsupported | 4K, alpha, known HDR/10-bit, missing video, unsupported codec/profile, corrupt input, output workload/byte/time guard, empty/reversed trim. Typed recoverable failures. |
| Cancel / failure / rerun | Cancel during range read, preroll/decode, draw/readback, encoder acceptance and finalization; rerun small successfully. Test stale messages and decoder errors. |
| Cleanup / repeats | Close and repeated jobs: all owned samples/native clones, Workers, URLs and sessions balanced; no media or names in diagnostic uploads because there are no uploads. Inspect available process memory trends without inventing native-byte counters. |

Suggested scale cases:

- Small: 64×48, six visibly distinct frames; full-frame comparisons plus timing manifest.
- Mandatory count case: **320×240, 10 s at15 output FPS =150 canonical frames**, within 11.52 million output pixels. Do not accidentally use480×270 for this fixed workload.
- Resize: 1920×1080 source →480×270; separate720×405 case with shorter selection/FPS so workload fits.
- VFR/B-frame and rotation cases are independent fixtures, not merely repeated scale tests.
- Source workload guard case: a small output from a dense/high-FPS source still reaches/rejects its decode-work limit.

Record: browser/device/build, secureContext, HMR false, input container/codec/profile/size/timebase, selected origin/trim, source PTS and selected indices for tiny fixtures, planned/emitted/encoded counts, canonical/encoded duration error, stage times, source read/decode/sample work, owned handle peaks, canonical RGBA peak, Canvas choices, encoder metrics, heartbeat max gap, cancellation stage, cleanup and rerun.

**Gate recommendation:** desktop production build plus fresh **Android Edge and Quark** production-build tests in a secure context (HTTPS, or explicitly approved USB localhost). Do not use Vite HMR for acceptance. Existing 8A/8B/8C phone results cannot replace these new video-input tests.

Pass requires presentation/VFR/B-frame mapping, trim/grid/count/tail, GIF quantization classification, WebP endpoint/coalescence, APNG rational timing, rotation/PAR/resize, no-upscale, operational guard behavior, responsive UI, cancellation/rerun and balanced cleanup. For tiny SDR visual fixtures compare expected image content with tolerance appropriate to native color conversion; do not demand unjustified cross-browser RGB byte identity. For timing, verify against exact canonical microseconds and the existing target encoder's predicted quantization separately.

Zero owned handles/Workers after cleanup is necessary but not proof of exact native-memory reclamation. Unobservable DPB/GPU peaks and performance/quality thresholds remain open measurements for 8D1. Failure there can reduce proposed limits or revisit the resize path before 8D2.

## 12. Delta from the preceding audit

| Previous assumption / broad proposal | New evidence | Updated conclusion |
| --- | --- | --- |
| A lazy monotonic `samplesAtTimestamps` feed would be sufficient to keep decoded samples close to one | Held-sample clone bursts, read-ahead queues, and the need for future timestamps/EOF | Use sequential presentation iteration + current/lookahead sampler as baseline. Keep finite timestamp batches as an experiment, not a memory proof. |
| `ceil(duration * FPS)` is an adequate universal count | Integer-µs rounded grid excludes a point exactly at end; 41,667 µs /24 FPS is a counterexample | Specify one rational grid/count contract, shared by preview and actual generation. |
| First timestamp and duration can be combined as simple length values | First is decode-order packet PTS; computeDuration is presentation end | Probe visible origin; calculate end minus origin; test edits and preroll. |
| One canonical RGBA implies roughly one frame of memory | Android decoder source-copy Canvas, native surfaces, lookahead, transform/Canvas caches, encoder copies | Separate owned canonical buffers from all source/native/Canvas/encoder resources. Exact native peak remains UNKNOWN. |
| Canvas/transform APIs are interchangeable convenience wrappers | CanvasSink default pool0; transform creates another sample and caches mip canvases | Prefer one application Canvas via public sample.draw for the first spike; benchmark quality/alternatives explicitly. |
| A broad ≤4 MP coded input and Original≤1280 might be suitable | New source-sized Android copy evidence; native video-input not tested yet | Propose narrower source area≤1080p and output long≤720 for 8D1; reconsider only after measurements. |
| A duration ceiling near20 s could summarize safety | Output pixels×frames and source decode cost are separate; small low-FPS clips can fit longer | Experimental max30 s plus exact count/pixel/decode/preroll/time guards; no fixed-duration safety claim. |
| Product limits/defaults can be copied from a prior benchmark | Current EZGIF client forms differ from older descriptions; other products use warnings or entirely different engines | Date and qualify observations; no universal EZGIF300-frame claim, no transplanted FFmpeg/ZIP/native limits. |

## 13. Avoid list and productization boundary

Do not retain all raw frames; sort all decoded samples in application memory; use one `getSample` seek per output frame as the default; pre-create every timestamp and assume bounded native output; feed an ACK-blocked single-credit timestamp producer; assume the internal queue4 is a total memory cap; omit close on yielded/clone/transformed samples; rely solely on GC; draw raw native frames while ignoring metadata; treat native plane copies as already upright RGBA; silently upscale/stretch/pad animation output; sample by source frame index; add a whole tail interval; hide target timing normalization; assume small output makes 4K decode cheap; adopt warning-only memory limits; add automatic FFmpeg fallback; implement persistence, Service Workers, or product UI in this audit.

8D1 should answer the decode/sampling/resize/ownership questions in an isolated harness. 8D2 may later decide the product trim controls, preset UX, unsupported-codec messages, Original/custom dimensions, download behavior, and whether broader containers/alpha/HDR are justified. No 8D2 product decision is implemented here.

## 14. Verification performed and remaining uncertainty

Performed: targeted installed-source/declaration inspection; matching pinned-source hashes; static inspection of upstream regression tests; primary product source/README/form inspection; timeline/count and budget arithmetic review; Git/remote release-state checks. No new runtime harness was written or run. No AniView lint/type/test/build rerun was needed for a new research Markdown file; previous passing results are not presented as new 8D1 evidence.

Unknowns retained honestly: device-specific decode support and failures, real VFR/B-frame/edit-list behavior on the two Android browsers, total native/GPU peak bytes, public-API-unobservable preroll/prefetch work, downscale quality/performance, source/capability subsets needing refinement, and unretrieved product defaults. These are gate measurements or documentation limits, not permission to start implementation during this task.

## 15. Git and release state

Only the research document is a new tracked-workspace candidate. No new commit/push is authorized by this research request, so none was created. `PLAN.md` / `AGENTS.md`, product source, tests, packages/lockfile, existing milestone records and existing audit documents are untouched.

Read-only GitHub verification found:

- Main: `4a3dc69542ca2923744904cd10ddbf1a35f36ff9`.
- `v0.1.0` annotated tag object: `498f596377c6ba13cdc300a695b2b49370982811`.
- Latest Pages deployment: `7301517861`, main SHA above, 2026-10-24T16:46:30Z.
- Production: https://zzh-0427.github.io/AniView/ remains the released main deployment.

AniView product code changed: **No**. Dependencies changed: **No**. Main untouched: **Yes**. v0.1.0 untouched: **Yes**. Production unchanged: **Yes**.

## 16. Next state

Milestone 8D1 has not started.

