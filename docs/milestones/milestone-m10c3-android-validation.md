# M10C3 — Android RAR / 7z product validation

2026-11-11. **PENDING ANDROID RAR/7Z PRODUCT VALIDATION — NOT STARTED.**

Desktop/native/distribution gates now pass, including the
[RAR4 raw-name fix](milestone-m10c3-rar4-filename-fix.md). This branch prepares a
frozen production build without HMR for a later Android test session. Preparation
does not record an Android PASS or start formal acceptance.
Do not reuse M10C1/M10C2 or prior milestone URLs. Production remains v0.2.0.

Frozen code candidate: `c6915e9f8d2b26faf5f4b5234f282360df985a12`.
The clean-tree production build and public fixture set are prepared locally.
Exact served identity is in `/AniView/release-candidate.json`; native hashes are
in `/AniView/vendor/sevenzip/manifest.json`.

**No HTTPS phone entry is approved yet.** The first HTTP/2 quick tunnel returned
intermittent520/530 and lost its edge connection. A QUIC replacement at
`https://intervention-informed-elimination-momentum.trycloudflare.com/AniView/`
confirmed secure context, no HMR, the clean candidate identity and JS/WASM hashes,
but the actual archive/Viewer check hit the existing15s timeout. Local equivalents
pass and frozen origin assets return200 with exact hashes. External delivery is
not accepted; do not treat tunnel registration or a200 homepage as full readiness.
The failed HTTP/2 tunnel is stopped; the frozen local server/QUIC preparation are
retained for a later network recheck. No device test has started.

Feature push also remains pending: ordinary push returned HTTP408, followed by
connection resets / github.com:443 reachability failure. No authentication bypass,
force push, TLS change or persistent Git configuration change was used. Recheck
network delivery, push the current feature branch, and independently verify the
complete HTTPS page/Worker path before issuing phone instructions. Do not rerun
or relabel the passed native desktop matrix solely for this transport issue.

## Prerequisites

Complete and verify the native component/source distribution; pass exact native
boundaries, real product desktop Viewer/conversion/navigation/cancel/cleanup and
production `/AniView/` build; commit/push the feature-branch checkpoint. Freeze
one no-HMR production preview and its public synthetic fixture set, verify the
secure URL, then record candidate commit, artifact manifest and URLs here.
No source/build/service change during user testing. Local freeze/identity/HTTPS
checks are preparation evidence; device results remain empty.

## Planned Edge sequence

Open normal RAR5 → six media types/Viewer → Next/Previous. Open solid RAR5 and a
later entry. Open password RAR5 → wrong/correct → reusable credential → convert
an animated entry → Preview/Back to the same source/selection. Open normal/solid
7z and encrypted-header 7z. Cancel a medium selected extraction and retry without
choosing the archive again. Switch EN/ZH with the password input retained. Test
a controlled near-policy sample after smaller cases. Close all and return Home.

## Planned Quark sequence

Open RAR4/RAR5 → Viewer; password wrong/correct; cancel prompt, explicit retry;
normal/solid/password 7z; keyboard-size scrolling, input, errors and buttons;
cancel/reopen/Viewer; EN/ZH; small then medium and controlled near-policy sample;
Home/cleanup. Stop on OOM, crash, reload or severe freeze; do not raise load.

Both browsers also open `unicode-chinese.rar` and `unicode-japanese.rar`, confirm
the full names, play the GIF, convert one and Back to the same source. These new
valid separator fixtures exercise the filename patch without phone stress tests.

## Required historical regression

Both browsers must repeat the M10C2-equivalent RAR4 encrypted-header missing →
wrong → correct sequence. The public legacy fixture is
`test_read_format_rar4_encrypted_filenames.rar`, public password `password`.
It contains text only: successful archive opening with no media is expected.
Desktop real product Worker tests must additionally verify the selected `b.txt`
hash. New original-media RAR5/7z fixtures use public password `aniview-test`.
Never enter a personal archive password for these tests.

Original M10C2 first failures remain historical and are not rewritten. No root
cause for those original phone failures has been proven. Fresh M10C3 results
must say whether the equivalent sequence reproduces.

## Evidence to collect

Record Edge/Quark browser, candidate identity, flow outcomes, successful download
reopening, cancellation/retry, soft keyboard/language behavior, obvious UI
problems/reloads/crashes, small/medium/near-policy outcomes and observable WASM
high-water. Heartbeat gaps are timing evidence, not standalone proof of a freeze
or responsiveness. Native/GPU/OS total memory is unmeasured.

After Home, Resource diagnostics → Raw JSON must show active Workers, Bitmaps and
ArchiveSessions at zero. `lastExtendedArchiveCleanup` must have zero
`activeExtendedArchiveWorkers`, `activeWasmInstances`, `activeArchiveSessions`,
`activeExtraction`, `pendingAccess`, `currentExtractedBytes`, `activeObjectUrls`
and `cleanupErrors`; Workers created must equal terminated. Historical error and
peak counters need not be zero. Never collect credentials/credential length,
private filenames or media in diagnostics.

## Results

| Browser | Frozen candidate | Native/product flows | RAR4 regression | Cleanup | Decision |
| --- | --- | --- | --- | --- | --- |
| Android Edge | Not issued | Not tested | Not tested | Not tested | PENDING |
| Android Quark | Not issued | Not tested | Not tested | Not tested | PENDING |

**No Android PASS is recorded.** The milestone stays open until new user-supplied
product results satisfy the gate. Only then update/push the closeout documents.
