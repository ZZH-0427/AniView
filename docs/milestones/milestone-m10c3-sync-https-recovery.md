# M10C3 — GitHub sync and HTTPS Android preview recovery

2026-11-11. **READY FOR ANDROID PRODUCT VALIDATION.**
No Android PASS, main merge, tag move, Release or Pages deployment.

## GitHub synchronization

Initial local HEAD was `3fb0d02a032010f61c777fbb1f4cc3694fffe9be`, implementation
commit `c6915e9f8d2b26faf5f4b5234f282360df985a12`. Working tree was clean.
`git ls-remote` failed with connection reset, so it was not used as proof that
the branch was absent. An authenticated GitHub API ref read returned404;
the expected baseline commit/tree and protected refs were separately verified.

One ordinary push again hit a connection timeout. The repository's existing
exact-object Git Data API method was then used: all85 implementation blobs and
three documentation blobs, trees and both commits matched their local Git SHA.
The feature ref was created only after a fresh race check, without force. Initial
remote HEAD was independently read back as3fb0d02, matching local HEAD; upstream
`origin/feat/v0.3-rar-7z-product` was established. This handoff's later changes are
M10C3 documentation only and must be synchronized by a normal fast-forward/API
`force:false` update with the same object/ref checks.

The large corresponding-source blob exposed transport issues in Node/curl;
the built-in .NET client succeeded using normal TLS/default proxy. Its exact
3,623,878-byte blob SHA is `c4390038083167a86840dae88f8abacef1aecb1e` (HTTP201,
then object verification). Credentials stayed in memory and were not printed or
stored in header files. No proxy/security settings, persistent Git config, history
rewrite, branch deletion or force push was used. Main and v0.2.0 remain unchanged.

## Frozen build

The production build remains the clean code snapshot c6915e9. The then-current
3fb0d02 differs only in three milestone documents. All60 frozen assets and30
public fixtures match their saved sizes/hashes. The complete production build's
exit0 report is retained; no native compiler or feature rebuild was needed here.

```text
7-Zip26.05 / Emscripten6.0.13
WASM bcbd8a4466062683a7e5d5c195be745fe18ea1065a4c6ccfe157dbca230fe970
JS   19aa0a07b46578bed8a31ee1ea6c8848d79d4ffd14498f88020a07e5ea66de6d
```

The18-component-asset manifest passes. Actual binary memory remains nonshared,
initial16MiB /maximum64MiB, with growth enabled. No application/decoder/Player/
session/password/resource-limit code was changed. The prior95-file/1,188-test,
native filename43-case, boundary22-case and compatibility34-case results remain
applicable; this task verifies delivery rather than relabeling those as phone tests.

## Selected HTTPS service

Page: https://distributor-promotions-participate-surfaces.trycloudflare.com/AniView/?debug=1

Samples: https://distributor-promotions-participate-surfaces.trycloudflare.com/AniView/validation/extended-archive/

The temporary static origin serves the immutable c6915e9 build/fixtures from
ignored frozen directories. HTTPS uses the existing cloudflared executable with
QUIC and official `--region us`, connected to the US route rather than the prior
HKG connector. This is not a production Pages deployment. TLS verification stays
enabled. Runtime assets remain on the same expected origin under `/AniView/`.

The temporary server applies normal immutable caching and Brotli/gzip content
negotiation to fixed application assets only. Every decoded body still matches
the frozen hash; media/password/session persistence is not introduced. Local
JS/CSS/Worker/glue/WASM return200 with correct MIME; missing WASM returns404,
not an HTML fallback. Origin GET/HEAD-only behavior rejects POST with405. CSP
retains same-origin script/worker/connect and WASM allowance, without script eval.

## Actual fresh HTTPS product smoke

A new isolated installed-Edge browser, with no browser asset prewarm or automatic
retry, passed the complete product sequence. `secureContext=true`, HMR=false,
served commit=c6915e9, sourceDirty=false. App15s deadlines and resource caps remain.

| Actual flow | Result |
| --- | --- |
| Fresh ordinary ZIP → real Canvas → Home |PASS; no SevenZip requests|
| RAR5 directory/list and first media |9 entries/6 media; real Canvas PASS|
| RAR5 Next/Previous and selected identity |PASS|
| Animation→APNG→Preview→Close→Back |PASS; original archive/selection retained|
|7z selected extraction and Viewer |PASS|
| Encrypted RAR5 wrong→correct password, Next reuse |PASS|
| Home and complete ownership cleanup |PASS|

First cold RAR5 Viewer became ready in4104ms. The first network WASM response,
not disk cache, completed in1407ms: HTTP200, application/wasm, decoded287473 bytes,
expected SHA. Runtime metrics prove an actual native WASM instance,16MiB memory
while open; merely fetching the binary was not accepted as instantiation proof.

All51 observed requests/responses used same-origin GET. Correct content types and
JS/WASM hashes, zero loading failures, zero console/Worker/CORS/CSP errors.
Workers21created/21terminated, active0; the generated object URL was revoked.
Every Home snapshot has zero active Workers/Bitmaps/ArchiveSessions and zero
Extended Worker/WASM/extraction/pending access/plaintext bytes/URL/cleanup errors.

## Earlier failures and operating conditions

Earlier HKG/US runs while bulk uploads were active retained their real15s timeout
results: glue/body delivery consumed the budget. A standalone WASM transfer was
18.6s. The final test used the US route and a quiet bulk-transfer window. These
changes demonstrate a valid delivered product under the recorded conditions;
they do not prove a single underlying ISP/network cause or relax app limits.

One intermediate isolated test also assumed a fixed solid-RAR entry order. The
archive correctly displayed the next APNG; the script was corrected to derive
actual selected paths, retaining all identity/Canvas/password/cleanup checks and
the prior failure evidence. No application change or suppressed failure resulted.

The alternate localtunnel registered but its HTTPS address was unreachable; it
was not accepted as ready. Only the selected verified URL above is for handoff.
No source/build/service change is allowed during Android acceptance. Keep the
computer, selected local server and tunnel alive; avoid simultaneous bulk uploads
and reverify after sleep/network change. A temporary tunnel has no permanent URL
guarantee. Android Edge/Quark may still expose device-specific behavior.

## Next gate and evidence

Follow the [Android validation guide](milestone-m10c3-android-validation.md) for
RAR4/RAR5/7z, ordinary/solid/password/header cases, the historical RAR4 repeated
password sequence, Unicode, Viewer/conversion/Back/navigation, cancel/Worker
rebuild, EN/ZH/soft keyboard and final zero-resource snapshots. All samples are
public; download and choose archives directly, without extracting first.

M10C2's original phone failures are retained unchanged, not retroactively passed.
This recovery stops at readiness; user-supplied new Android results are required
before M10C3 can close. No next milestone is started.

Local evidence is under `.tools/m10c3/sync-recovery/` (ignored): frozen/local audit,
origin/cache/encoding proof, actual`https-us-final.json`, prior failure reports,
exact API events/sync reports and process/service records. Tokens are excluded.
