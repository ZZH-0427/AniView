# M10E-S1 — Native security impact review and remediation decision

2026-11-11. **Static review COMPLETE; NATIVE-SECURITY-01: REMEDIATION REQUIRED.**
Recommend **B — BACKPORT REQUIRED FIX** in a separately authorized task. The
supported RAR3 error path cannot be excluded; its exact frozen-WASM security
effect remains **UNKNOWN / NOT EXCLUDED**. This is not a demonstrated exploit,
memory-corruption finding or browser crash. M10E remains BLOCKED; Android RC and
M10F are not unlocked.

## Baseline, method and evidence boundary

- Branch: `feat/v0.3-rc-audit`; clean starting documentation HEAD
  `bf64ca4ff4c9665850a280230d218bd52e1ded7a`.
- Actually built/tested RC source: `86728599149381455ddbfaba7cd529ccfea11ab6`.
  Later documentation commits do not identify a rebuilt candidate.
- Main/peeled v0.2.0: `0cb82c0a446a160806596d618bbbc61e16a5752d`;
  annotated tag object: `3f83ab43fa880432bef9e84784da29b8c4dc9843`.
- Read-only inputs: official source/diffs, existing build receipts/objects,
  registrations/callers, normal fixture manifests and prior regression records.
  No compiler, linker, decoder or archive execution; no new archive, exploit
  sample, native patch application, dependency change or safety-check bypass.
- Fresh `node tools/extended-archive/verify-runtime.mjs` PASS checks bytes,
  hashes, memory-section declarations and distribution files only. It does not
  compile or instantiate WebAssembly. Existing test/build results are inherited
  evidence, not rerun results from this review.

The previous audit's automatic safety stop and unresolved runtime question remain
historical facts. This review uses static analysis, not an alternative execution
route around that stop. Official source copies were retrieved through Git Blob
API and their Git blob SHA-1 identifiers checked. They are analysis copies only;
no source/build/product tree was patched. Earlier text-reconstructed analysis
copies are not used as the final source authority.

## Official upstream comparison

| Version | Exact official commit | Version date | Release publication UTC |
| --- | --- | --- | --- |
| [26.05](https://github.com/ip7z/7zip/releases/tag/26.05) | `b88c6bc09339de32f7d18bbab900686b244f42ba` | 2026-10-21 | 2026-10-21 13:05:54 |
| [26.06](https://github.com/ip7z/7zip/releases/tag/26.06) | `d3296e39e1f1f92c7b41c0c3848e65640428d42d` | 2026-11-06 | 2026-11-07 11:45:33 |

Both tags directly reference commits. The [exact comparison](https://github.com/ip7z/7zip/compare/b88c6bc09339de32f7d18bbab900686b244f42ba...d3296e39e1f1f92c7b41c0c3848e65640428d42d)
has four commits and 73 changed files. Three intervening commits concern upstream
macOS build workflow; the version commit contains the product changes. Release
notes mention bug/vulnerability fixes without identifying every changed hunk as
a security fix. Version date, commit date and release publication differ.

The comparison intersects the actual build in ten changed C++ translation units:
Rar3Decoder, InBuffer, CopyCoder, DeflateDecoder, LzxDecoder, QuantumDecoder,
MultiStream, RarHandler, Rar5Handler and Windows/FileFind. Paired headers and the
Synchronization.h annotation are reviewed separately. Changes in excluded archive
handlers, UI/update code and build/documentation files are not automatically
part of the product. The selected Arc_gcc.mak/7zip_gcc.mak recipes did not change.

Official 26.06 blob identities for the proposed backport:

| Path under CPP/7zip | Git blob SHA-1 |
| --- | --- |
| Compress/Rar3Decoder.cpp | `d0be9b72825bd346017a2e92b3edad542c711c39` |
| Compress/Rar3Decoder.h | `5a5334be2f8f87f693e00639076c8c318300f846` |
| Common/InBuffer.cpp | `047eb862567539734128ade326fa38f0822dc238` |

These identify source blobs, not runtime SHA-256 hashes.

## Function-level changes

Here, "linked" means an existing object was supplied to the recorded successful
link. It does not assert every function survived optimization in the final WASM.

| File / function | Change and precondition | Security relevance | Compiled / linked | User-input reachability |
| --- | --- | --- | --- | --- |
| Rar3Decoder.cpp `Wrap_ReadByte` | Catch exceptions during a real input refill; retain `CInBufferException.ErrorCode` in `hresult`, count an extra byte and return 0xFF. Other caught exceptions do not set that HRESULT. | Error/exception boundary of an `extern "C"` `throw()` callback; no new length/index/copy check. | Yes | Supported RAR4 compression can enter RAR3/PPM. Exact failing combination not established. |
| Rar3Decoder.cpp `Wrap_ReadBits8` | Same handling for aligned-byte reads; buffered reads need not refill. | PPM initialization/parameter-read error handling, not a demonstrated bounds fix. | Yes | Same supported decoder path and qualification. |
| Rar3Decoder.h `CByteIn::Init` | Add HRESULT state and initialize it to S_OK for each decode. | Error-state lifetime; changes internal CDecoder object layout. | Included by decoder and registry translation units | Used by RAR3 decoder. |
| Rar3Decoder.cpp `CDecoder::Code` | Initialize the byte reader; after CodeReal returns normally, override its result with the stored non-S_OK input error. | Preserve error result. This is not an immediate stop before every output write. Allocation, lengths and solid controls are unchanged. | Yes | Supported RAR4 path. |
| InBuffer.cpp `CInBufferBase::ReadBlock` | Set `_wasFinished=true` before throwing when Read returns non-S_OK in the exceptions branch. | Stop subsequent refills after a captured input failure. No new `processed` length validation; S_OK+zero-byte EOF is unchanged. | Yes; exceptions enabled | RAR1/2/3 and registered Deflate/Deflate64 use this buffer. |
| CopyCoder.cpp/.h | Move unchanged copy loop to CCopyCoderBase and delegate from COM coder. | Ordinary refactor/layout change; no independent vulnerability established. | Yes | Stored RAR entries and 7z Copy. |
| DeflateDecoder.cpp/.h | Add `_outWasInit`, adjust initialization and keep-history behavior. | Real state/behavior change; no primary evidence assigning it a separate product vulnerability. | Yes | Deflate/64 available to 7z; keepHistory=true setter only called by excluded CAB handler. |
| RarHandler.cpp / Rar5Handler.cpp `Extract` | Save `lps.ClsPtr()` and use the same object's fields. | Local pointer access refactor; no parser/dispatch/bounds change in these hunks. | Yes | RAR4 / RAR5. |
| LzxDecoder.cpp constructor / `Set_DictBits_and_Alloc` | Initialize/reset window position and over-dictionary state when allocation changes. | Relevant to separate CAB/LZX issue below. | Yes | No registered adapter or included caller; current user path excluded. |
| QuantumDecoder.cpp/.h | Change initialization/parameter interface paired with CAB changes. | Do not infer a RAR/7z defect. | Yes | Unregistered; CAB caller excluded; no linked-object incoming symbol. |
| MultiStream.cpp/.h | Remove CMultiStream implementation; add split-name helper. | Split-file behavior/refactor. | Yes | Active source client is excluded SplitHandler. No supported RAR/7z caller found. |
| Windows/FileFind.cpp | Rewrite POSIX basename helper and trailing-separator handling. | Filename helper behavior. | Yes | FileDir references exist, but bridge uses constant `/input/archive`; imported entry names are never filesystem extraction paths here. No hostile archive-name input edge found. |
| Windows/Synchronization.h | Add lifetime diagnostic annotation. | No functional runtime fix identified. | Header | Not a new parser/codec path. |

Exact upstream source: [RAR3 callbacks](https://github.com/ip7z/7zip/blob/d3296e39e1f1f92c7b41c0c3848e65640428d42d/CPP/7zip/Compress/Rar3Decoder.cpp#L41-L65),
[RAR3 error propagation](https://github.com/ip7z/7zip/blob/d3296e39e1f1f92c7b41c0c3848e65640428d42d/CPP/7zip/Compress/Rar3Decoder.cpp#L931-L943),
[reader state](https://github.com/ip7z/7zip/blob/d3296e39e1f1f92c7b41c0c3848e65640428d42d/CPP/7zip/Compress/Rar3Decoder.h#L134-L145),
[InBuffer](https://github.com/ip7z/7zip/blob/d3296e39e1f1f92c7b41c0c3848e65640428d42d/CPP/7zip/Common/InBuffer.cpp#L51-L100).

## Compilation, registrations and call chains

The existing native build has **189 compile rules, 189 unique existing object
link inputs: 139 C++ / 50 C**. `tools/extended-archive/build-runtime.mjs:20-39`
selects COMMON/WIN/7ZIP_COMMON/AR_COMMON/7Z/RAR/COMPRESS/CRYPTO/C groups with
`-Oz -DZ7_ST -DZ7_EXTRACT_ONLY -D_FILE_OFFSET_BITS=64 -fexceptions`.
Cab/Chm/Wim groups and 7zRegister/7zUpdate/7zEncode/7zHandlerOut are excluded.
`Z7_EXTERNAL_CODECS` and `Z7_SFX` are not defined.

Existing `.tools/m10c3/native-build/build.ninja:44/110/126` compile InBuffer,
LzxDecoder and Rar3Decoder; line195 supplies all objects to the link. commands.json,
existing build log and object symbols corroborate this. RarCodecsRegister.o
references the Rar3 constructor; Rar3Decoder.o references InBuffer functions.
The final optimized WASM lacks an internal symbol/link map sufficient to prove
every retained instruction. No new map/build was generated for this review.

The application accepts byte-zero ZIP/RAR4/RAR5/7z signatures. The extended
Worker rechecks RAR4/RAR5/7z; ZIP uses its separate backend.
`tools/extended-archive/native/bridge.cpp:89-100` directly constructs only
RAR4/RAR5/7z handlers; RegisterArc is a no-op. There is no arbitrary container
factory, extension-based CAB opening or automatic archive recursion.

Native call-chain line numbers below refer to the existing patched26.05 tree
at `.tools/m10c3/source`; official source hyperlinks above use exact26.06 lines.

- **RAR4**: RarHandler.cpp:1793-1825 selects Copy for method '0'; methods '1'..'5'
  select RAR1/2/3 according to unpack version, including RAR3 ID `0x40303` for
  supported versions29..40. The registered decoder's Code is called at1862.
  PPM input callbacks and InBuffer are therefore on a supported static path.
- **Input-error precondition**: Read can propagate an input error. Independently
  of host I/O failure, encrypted RAR uses CFilterCoder; its incomplete AES-block
  read can return S_FALSE (FilterCoder.cpp:521-527; RarAes.h:19-20;
  MyAes.cpp:41-49). This is a possible non-S_OK source edge, not output E_ABORT.
  We have not shown a complete admitted archive reaching that error while the
  affected PPM callback is active. WASM termination/publication/recovery effects
  are consequently unresolved; no adversarial execution was performed.
- **RAR5**: Rar5Handler.cpp:1051-1095 selects Copy or ID `0x40305`, not RAR3.
  No direct Rar5Decoder-to-InBuffer reference was found. The RAR3 change is not
  assigned to RAR5 merely because it uses the same component.
- **7z**: untrusted folder method IDs select among the actual static registry;
  encoded headers use the same decoder machinery. There is no product-level
  per-method allowlist limited to the few codecs exercised by fixtures.
  However, 7zDecode.cpp:302-305 explicitly rejects the entire `0x403xx` RAR
  family. Other IDs need a registered decoder; unknown IDs have no generic
  fallback. Deflate/Deflate64 and their shared InBuffer remain relevant.

There are 25 codec/filter registrations: Copy, Delta, ARM64/RISCV, Swap2/4,
LZMA/LZMA2, PPMD, Deflate/Deflate64, BZip2, RAR1/2/3/5, BCJ/BCJ2,
PPC/IA64/ARM/ARMT/SPARC, 7zAES and AES256CBC. There is **no LZX registration,
method adapter or external-codec fallback**. Do not invent an LZX 7z method ID.

## Independent CAB/LZX assessment

The [original CNA record for CVE-2026-125742](https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/2026/125xxx/CVE-2026-125742.json),
published 2026-11-10, describes an LZX window-state problem during multi-volume
CAB continuation, affecting upstream versions below 26.06. The official version
commit changes LZX state reset and CAB-side folder/method/bounds checks; the four
LZX additions alone are not claimed to be the complete CAB remediation.
This CVE is not assigned to RAR3/InBuffer by this review.

**SOURCE PRESENT: yes. COMPILED / LINK INPUT: LzxDecoder.o yes; CAB parser/handler
no. USER-INPUT REACHABLE: no supported static route found.** Excluding CAB alone
would not suffice if another registered method used LZX. Here LZX is a plain
class without an ICompressCoder adapter; its source callers are Cab/Chm/Wim,
all excluded. Undefined-symbol inspection of all 189 objects found no incoming
NLzx reference. No static registry or external-codec route supplies an alternative.
This establishes a reliable current path boundary; linker garbage collection is
expected, but final-machine-code absence is not independently proven.

Classification: **NOT APPLICABLE to this exact supported product call graph**.
Reassess if handlers, registry, build groups or external-codec policy change.
No CAB sample, exploit reference or crafted archive was downloaded/executed.

## Risk classification and safeguards

| Question | Classification | Reason / limit |
| --- | --- | --- |
| RAR4 → RAR3/PPM + failed input read | **UNKNOWN / NOT EXCLUDED** | Source fix applicability and supported decoder path confirmed; full admitted trigger and frozen-WASM effects not established. Insufficient basis for NOT APPLICABLE or a demonstrated AFFECTED verdict. |
| RAR5 direct use of RAR3 | **NOT APPLICABLE** | Separate method/decoder; no direct InBuffer dependency found. Not a blanket claim of RAR5 security. |
| 7z direct use of RAR3 | **NOT APPLICABLE** | Explicit method-family rejection. |
| Shared InBuffer error-state behavior in 7z Deflate/64 | **UNKNOWN / NOT EXCLUDED** | Compiled/registered/reachable decoder; exact security manifestation unproven. Backport must cover this shared behavior. |
| Deflate keepHistory=true change | **NOT APPLICABLE to identified state setter path** | Sole caller is excluded CAB; general Deflate remains reachable and initialization/failure regressions still required. No separate vulnerability inferred. |
| CAB/LZX issue | **NOT APPLICABLE** | Excluded handlers plus absent adapter/registry/object incoming edges, not merely rejected CAB signature. |

No newly demonstrated AniView vulnerability is classified AFFECTED. UNKNOWN is
not release clearance. Exact risk severity, crash/disclosure and exploitability
are not established by these source changes alone.

The nonshared 64MiB WASM maximum limits linear-memory growth, not intra-heap
overwrites or all JS/Blob/ArrayBuffer/native/GPU memory. The 4MiB callback caps
selected output, not all intermediate/header allocations. Known-dictionary,
entry/path limits can be checked after native open; encoded headers can allocate
earlier and unknown dictionary size is not proof of small allocation. The 15s
timer terminates a dedicated Worker when scheduled; it cannot prevent a native
error before the deadline. Worker isolation is useful containment, not proof of
memory safety. None of these safeguards closes the unresolved source path.

## Options and decision

| Option | Evaluation |
| --- | --- |
| **A — KEEP 26.05 WITH EVIDENCE** | Not recommended. CAB exclusion is supported, but supported RAR3/shared-input error handling is not excluded.1191 ordinary tests and limits cannot fill that evidence gap. No claim that version age alone requires change. |
| **B — BACKPORT REQUIRED FIX** | **Recommended.** Exact upstream Rar3Decoder.cpp/.h + InBuffer.cpp changes form a source-level dependency closure on existing 26.05 interfaces. Preserve portability and RAR4 raw-name patches, ABI, handlers, registry and limits. Smallest justified native change for the supported-path question. It remains a maintained modified26.05 component, not stock 26.06 or a claim to all upstream security fixes. |
| **C — UPGRADE TO 26.06** | Valid alternative if backport maintenance is rejected or closure fails. Includes official aggregate changes, but adds reachable Copy/Deflate layout/state changes and other compiled differences. Requires complete rebuild/regression/refreeze and distribution refresh; latest version alone is not proof. |
| **D — MORE EVIDENCE** | Would remain blocked if no native change is authorized. Not the preferred next step: the upstream error-handling fix has a small statically closed source set, so remediation avoids depending on an unproven exclusion. |

The three-file backport needs no new Ppmd7, InBuffer.h, Rar3Vm or MyCom API.
The existing RAR4 NUL/Unicode patch affects filename validation in RarHandler,
not these files. The upstream RarHandler hunk is elsewhere; static inspection
finds no text/symbol conflict. No patch/dry-run is performed here.

**Rebuild closure is larger than the changed source set.** Rar3Decoder.h changes
CDecoder layout; RarCodecsRegister.cpp includes it and allocates `new CDecoder`.
Keeping that factory object from the old layout is invalid. Use a fresh full
189-object component build, including all header dependents, rather than replacing
two object files. Existing Ninja rules do not record header depfiles; the normal
script rewrites shared commands.json, normally invalidating all objects, but that
side effect is not sufficient independent proof of rebuild completeness.

## Required separately authorized remediation and validation

1. Record the exact upstream commit/blobs and coherent three-file diff as a new
   native patch. Preserve the raw-name/Unicode and portability patches; do not
   modify the product ABI, codec scope, dependencies or safety limits.
2. Build twice from fresh, separate complete native object trees using pinned
   Emscripten6.0.13/Node24 and identical inputs. Compare JS/WASM hashes; inspect
   actual memory section for one nonshared16MiB initial/64MiB maximum memory,
   growth enabled. Rebuild all layout-dependent factories.
3. Verify error-state behavior with reviewed, controlled stream/error-injection
   unit harnesses rather than exploit archives: callbacks must not leak exceptions,
   reader stops refilling failed input, error propagates, normal EOF/solid state
   remains correct. Any additional dynamic investigation needs its own permitted
   scope; this task does not authorize bypassing the earlier safety stop.
4. Rerun existing RAR4 NUL/Unicode43 cases, compatibility34/195 hashes (including
   ordinary/encrypted RAR4/RAR5/7z and the repeated historical RAR4 password/header/
   solid sequence), native boundaries22, Worker cancel/rebuild/reopen and output/
   dictionary/input/path/count/deadline checks. Cover RAR3 PPM and shared-buffer
   RAR1/2/Deflate/64 with normal available inputs and approved harnesses.
5. Exercise supported 7z codec/filter registry paths, including encoded headers,
   solid and passwords; record actual coverage and gaps rather than infer all
   methods from a handful of normal fixtures. Confirm CAB/LZX remains unreachable.
6. Refresh source package, change record, exact patch and recipe hashes, manifest,
   notices and component replacement instructions. Keep 7-Zip LGPL/unRAR and all
   toolchain license materials; no project-license decision changes. Option C
   additionally pins/reviews the new source archive and all compiled changes.
7. Run npm ci/lint/typecheck/test/build, preserving at least 95 files/1191 tests
   and all new regressions. Repeat complete product builds and compare manifests.
   Rerun desktop RAR/7z→Viewer→conversion→Back/Home and cross-feature password
   ZIP/Creator/conversion/video isolation, no eager SevenZip on Home/ZIP, local
   network/privacy assertions, `/AniView/` assets and cleanup counters.
8. Freeze a new source identity and production artifact before Android RC.
   Edge/Quark must exercise the changed native RAR/7z/password/solid/cancel/reopen
   paths and fresh cleanup evidence, including the historical RAR4 password
   sequence. Old M10C Android evidence remains historical; it cannot validate a
   different runtime. M10E's pending new Android cross-feature gate remains.

Unchanged architecture, licensing research and older functional results remain
valid historical evidence. They do not count as test passes on the remediated
binary. Viewer/Creator/ZIP cores need no speculative changes, but build identity,
lazy loading and cross-feature isolation must be checked in the new candidate.

## Frozen component and retained evidence

Current component remains 7-Zip26.05/Emscripten6.0.13, nonshared 16/64MiB.
Static runtime verification passes 18 manifest assets; no binary/source change:

```text
WASM bcbd8a4466062683a7e5d5c195be745fe18ea1065a4c6ccfe157dbca230fe970
JS   19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d
Corresponding source 4180d1a660ac1af72125335fdf6ce45fae2a6ac8b61b1887816ead4563c64183
RAR4 filename patch dfceaf8cd8c094c42830914ef97203c0e86e39f8e3efa7f0031d840be3b14b2a
```

The current source package/notices/manifest remain consistent; they describe the
unchanged old component, not an implemented security backport. Previous 95 files/
1191 PASS and two identical 57-file/5,957,987-byte builds are preserved in the
[M10E milestone](../milestones/milestone-m10e-v0.3-stability-rc-audit.md).
No new runtime test/build or Android result is claimed by this document.

Raw local static evidence: ignored `.tools/m10e-s1/upstream/` contains tag/release/
CNA receipts and the 73-file diff inventory; `upstream-files/` has official blob
copies/receipts; `build/` has the 189-object inventory, source classifications,
symbol scans and static verification; `rar-diff/static-review.txt` records the
function analysis. The existing `.tools/m10e/security/` comparison and original
failure-stop records are retained. No private media/passwords or exploit data
are added to Git.

**Final decision: NATIVE-SECURITY-01: REMEDIATION REQUIRED.** This completes the
static decision task, not remediation or RC acceptance. Stop for the next
independent native-remediation task; no merge, push, version, tag, Release,
Pages deployment, Android unlock or M10F action is performed.
