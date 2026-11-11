# M10E — Android RC validation record

2026-11-11. **NOT STARTED / READY TO PREPARE ANDROID RC VALIDATION.**
Edge: **PENDING**. Quark: **PENDING**. New Android cleanup JSON: **NOT PROVIDED**.
No M10E Android PASS is inferred from earlier milestone testing.

## Gate and candidate identity

Current frozen desktop product source is
`d31abd8dbc4ab9e8b0bcf032b760c719f478ab6f`: 59 assets/6,049,630 bytes,
sourceDirty=false, two identical builds. The
[current desktop asset manifest](../research/m10e-s2-desktop-asset-manifest.json)
has canonical UTF-8/LF SHA256
`4874fbe6e66eed03d101a8b6a690f1c16755be02018e7f0605238b41cab459ea`.
The independent Linux 20/20 run uses CI commit d7bc6e8; it does not create another
product build or Android result. See the [S2 resolution](milestone-m10e-s2-native-security-backport.md).

Retained historical audit baseline: `86728599149381455ddbfaba7cd529ccfea11ab6`;
two clean builds produce the same57 assets/5,957,987 bytes. The
[asset manifest](../research/m10e-v0.3-rc-asset-manifest.json) SHA256 is
`43b1fec144b756d03d8a9635c645dd20ac2ed0d551ab54176cc4e8ebff085ea5`.
The manifest digest refers to UTF-8/LF bytes, as generated and committed; Windows
checkout line-ending conversion must be normalized for that documentation hash.
Package metadata remains0.2.0; this is not a released0.3.0.

[NATIVE-SECURITY-01](../research/m10e-v0.3-security-license-audit.md#native-gate-native-security-01)
is **CLOSED — VERIFIED BACKPORT WITH INDEPENDENT LINUX HARNESS**.
**No public HTTPS RC URL is prepared or provided.** Do not use an
old milestone/tunnel URL as M10E acceptance. The desktop loopback secure-context
check is not an Android HTTPS result. Source/glue/WASM are not updated here.

Before a separately requested handoff, identify the actual tested source and
build manifest again. Native or product changes require a new frozen identity
and explicit retest scope. Edge and Quark must use that same identified build;
do not alter it between their tests. HTTPS must actually load Home, ZIP, RAR/7z,
SevenZip, Viewer, Preview and Download with secureContext=true/HMR=false before
asking the user to begin. Tunnel registration alone is insufficient.

## Minimal matrix retained for the future handoff

This is a plan, **not completed testing**. Each browser should use one continuous
page/session where practical. Only public synthetic fixtures are needed.

| Sequence | Future phone steps |
| --- | --- |
| A | Extract a mixed static JPEG/PNG/WebP delivery ZIP in the phone file manager. Create representative GIF, Animated WebP and APNG outputs; Preview/return, download and open saved files, then Home. |
| B | Open password ZIP, wrong/correct public test password, Viewer and Back. Then open normal RAR5 and encrypted-header7z, unlock where required, Viewer/Back and Home. Confirm ZIP/extended state do not mix. |
| C | Cancel or replace an archive source, reopen and view another entry, then Home. Exercise EN/ZH and the password controls under the soft keyboard. |

Planned public sample set: `mixed-static.zip`, `password-mixed.zip`, `mixed.zip`,
`normal-rar5.rar`, `headers.7z` and `normal.7z`. Expected normal public fixture
password is `aniview-test`. Legacy RAR4 fixtures use `password`; text-only listing
is expected. Sample download URLs/hashes must be supplied and verified at the
actual handoff; none is represented as currently available on a public M10E URL.

No full codec/native negative matrix or video benchmark is required on the phone.
Add targeted checks only if the actual continuous flows expose a problem.

## Diagnostic copy and attribution

On the actual frozen URL with `?debug=1`, close all media/archives and return Home.
Expand Resource diagnostics, then Raw JSON, and copy that existing output; this
does not introduce a new telemetry/export feature. Provide one result per browser
with candidate identity and functional outcome. Report an exact code/step for
failures, reloads or crashes; do not paste personal passwords or private files.

Check fields actually present:

- Runtime activeWorkers, activeBitmaps, activeArchiveSessions and cleanupErrors.
- lastExtendedArchiveCleanup activeExtendedArchiveWorkers, activeWasmInstances,
  activeArchiveSessions, activeExtraction, pendingAccess, currentExtractedBytes,
  activeObjectUrls and cleanupErrors.
- Other present creation/conversion/video cleanup snapshots: active Workers,
  Bitmap/Canvas/ImageData/RGBA/ACK/VideoFrame/URL ownership and cleanupErrors.

Required active/error values should be zero, with created/terminated and
opened/closed balanced. Cumulative/peak counters need not be zero. Missing fields
or unperformed steps must be marked unprovided, not invented. This observes
application ownership, not complete browser/native/GPU/system memory.

| Browser | Candidate used | A/B/C | Cleanup evidence | Verdict |
| --- | --- | --- | --- | --- |
| Android Edge | Not yet supplied | PENDING | NOT PROVIDED | PENDING |
| Android Quark | Not yet supplied | PENDING | NOT PROVIDED | PENDING |

**Current M10E is READY TO PREPARE ANDROID RC VALIDATION, not PASSED/RC-READY.**
Preparation and real Edge/Quark evidence still require their own task; no remote
environment or phone acceptance starts here. M10F is not authorized or started.
