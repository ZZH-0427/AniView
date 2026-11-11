# AniView development documentation

Start with the current scope and completed milestone records below. Documents
retain their dated conclusions: an older `NOT STARTED`, `BLOCKED` or `PENDING`
checkpoint does not override a later closeout. Historical plans and failed runs
are retained as evidence, not rewritten into current status.

V0.3 is not released. M10E Stability & Release Candidate Audit is now
**RC-READY / PASSED / CLOSED**, with its native security gate resolved and new
user-confirmed Edge/Quark functional and Home cleanup acceptance. Final accepted
RC source is 733df1984919e318348a88c512d68743990bdca6. M10F is ready for a separately
authorized release task but remains NOT STARTED. This index grants no release,
version bump, main merge, tag or deployment approval.

## CURRENT

- [M10E stability/RC audit](milestones/milestone-m10e-v0.3-stability-rc-audit.md),
  [security/license gate](research/m10e-v0.3-security-license-audit.md),
  [final RC asset manifest](research/m10e-android-rc-asset-manifest.json), and
  [Android record](milestones/milestone-m10e-android-rc-validation.md): current
  audit closeout and separation of automated/desktop evidence from user-confirmed
  phone results. The older manifests and then-PENDING preparation snapshot remain
  linked in those records for history.
- [M10E-S2 native security resolution](milestones/milestone-m10e-s2-native-security-backport.md)
  and [independent Linux 20/20 evidence](research/m10e-s2-linux-harness-evidence.json):
  scoped security gate closure, separate from direct testing of the shipped WASM.
- [V0.3 scope freeze](releases/v0.3-scope-freeze.md): current capability boundary,
  deferred enhancements and source-checked limits.
- [M10D scope freeze and pre-RC cleanup](milestones/milestone-m10d-v0.3-scope-freeze-pre-rc-cleanup.md):
  changes, validation and handoff state for this cleanup.
- [Project plan](../PLAN.md) and [development rules](../AGENTS.md): architectural
  invariants and working rules; later explicitly approved milestone scope extends
  the original V0.1 roadmap.
- Architecture decisions still used by V0.3:
  [canonical-RGBA multi-format Creator](research/v0.3-animation-creator-architecture-audit.md),
  [password ZIP](research/v0.3-password-zip-feasibility-audit.md), and the
  [final RAR/7z product architecture](milestones/milestone-m10c3-rar-7z-productization.md).
  Read the final implementation records and frozen scope for current behavior.
- [Bounded SevenZip build/test recipe](../tools/extended-archive/README.md),
  [distributed component and replacement instructions](../public/vendor/sevenzip/README.md),
  [component manifest](../public/vendor/sevenzip/manifest.json), and
  [third-party notices](../THIRD_PARTY_NOTICES.md).

## COMPLETED

| V0.3 milestone | Final implementation / closeout | Android acceptance |
| --- | --- | --- |
| M10A — Unified multi-format animation Creator | [M10A2](milestones/milestone-m10a2-unified-animation-creator.md) | [Edge / Quark](milestones/milestone-m10a2-android-validation.md) |
| M10B — Password-protected ZIP | [M10B2](milestones/milestone-m10b2-password-zip.md) | [Edge / Quark](milestones/milestone-m10b2-android-validation.md) |
| M10C — Narrow RAR4 / RAR5 / 7z productization | [M10C3](milestones/milestone-m10c3-rar-7z-productization.md) | [Edge / Quark and cleanup metrics](milestones/milestone-m10c3-android-validation.md) |
| M10E — V0.3 stability and release candidate audit | [RC-READY / PASSED / CLOSED](milestones/milestone-m10e-v0.3-stability-rc-audit.md) | [Edge / Quark functional and cleanup PASS](milestones/milestone-m10e-android-rc-validation.md) |

Earlier technical gates remain available as the
[M10C1 feasibility audit](research/v0.3-rar-7z-feasibility-audit.md) and
[M10C2 bounded backend closeout](spikes/m10c2-bounded-rar-7z-backend.md).
Their technical scope does not replace M10C3 product acceptance.

## HISTORICAL — experiments, failures, fixes and recovery

- [RAR/7z candidate comparison](research/v0.3-rar-7z-candidate-matrix.md),
  [memory-boundary results](research/v0.3-rar-7z-memory-boundary-results.md) and
  [WASM build/license planning](research/v0.3-sevenzip-wasm-build-license-plan.md).
- M10C2 Android evidence: [initial failures](spikes/m10c2-android-initial.json),
  [followup results](spikes/m10c2-android-followup.json) and
  [RAR4 followup interpretation](spikes/m10c2-rar4-android-followup.md).
  Preserve the original Edge timeout and Quark backend error; later success does
  not turn the initial run into a clean PASS.
- M10C2 [desktop evidence](spikes/m10c2-desktop-evidence.json) and
  [loader-error regression](spikes/m10c2-loader-regression-evidence.json).
- M10C3 [build recovery](milestones/milestone-m10c3-build-recovery.md),
  [RAR4 raw-filename NUL security fix](milestones/milestone-m10c3-rar4-filename-fix.md),
  and [GitHub / HTTPS delivery recovery](milestones/milestone-m10c3-sync-https-recovery.md).
  Their pending/pre-fix checkpoints are superseded for milestone status by the
  final M10C3 closeout; their security and recovery evidence remains relevant.
- Prior engineering spikes: [GIF creation](spikes/milestone-8a1-static-to-gif.md),
  [animation conversion](spikes/milestone-8b1-unified-animation-conversion.md),
  [animation-to-MP4](spikes/milestone-8c1-animation-to-mp4.md), and
  [video-to-animation](spikes/milestone-8d1-video-to-animation.md).
- [Creator lifecycle investigation](milestones/milestone-8a2-lifecycle-investigation.md)
  and [V0.2 UI audit with evidence](research/v0.2-ui-ux-audit.md).

## SUPERSEDED — implementation plans, not current execution status

Keep these original proposals for decision history. Their `NOT STARTED` and
similar statements describe the planning date; use the completed records above
for the resulting behavior and acceptance.

| Earlier proposal | Current implementation / scope |
| --- | --- |
| [M10A2 Creator plan](planning/m10a2-animation-creator-implementation-plan.md) | M10A2 closeout and V0.3 scope freeze |
| [M10B2 password ZIP plan](planning/m10b2-password-zip-implementation-plan.md) | M10B2 closeout and V0.3 scope freeze |
| [M10C3 productization plan](planning/m10c3-rar-7z-productization-plan.md) | M10C3 closeout and V0.3 scope freeze |
| [RAR/7z defer record](planning/v0.3-rar-7z-defer-record.md) | Later M10C2 gate and approved narrow M10C3 implementation |

## RELEASE ARCHIVE

- V0.1: [release record](releases/v0.1.0.md),
  [QA](releases/v0.1.0-qa.md), [limits](releases/v0.1.0-limits.md) and
  [dated licensing audit](releases/licensing-audit.md).
- V0.2: [release notes](releases/v0.2.0.md),
  [preparation](releases/v0.2.0-release-preparation.md),
  [build manifest](releases/v0.2.0-build-manifest.json),
  [preparation evidence](releases/v0.2.0-preparation-evidence.json), and
  [GitHub Release text](releases/v0.2.0-github-release-body.md).
- Additional final V0.2 records are preserved on `release/v0.2.0` at immutable
  commit `90265aa9884de53a93a22bfbf978a4f5672fcc76`:
  [final closeout](https://github.com/ZZH-0427/AniView/blob/90265aa9884de53a93a22bfbf978a4f5672fcc76/docs/releases/v0.2.0-final-closeout.md),
  [production evidence](https://github.com/ZZH-0427/AniView/blob/90265aa9884de53a93a22bfbf978a4f5672fcc76/docs/releases/v0.2.0-production-evidence.json), and
  [release record](https://github.com/ZZH-0427/AniView/blob/90265aa9884de53a93a22bfbf978a4f5672fcc76/docs/releases/v0.2.0-release-record.md).
  These links preserve that branch's independent release attestation without
  copying, merging or rewriting its records.

This index relocates no documents, fixtures, licenses or raw evidence. Runtime
notices and corresponding source are distribution materials, not cleanup targets.
