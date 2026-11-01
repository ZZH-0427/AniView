# M9A1b — V0.2 UI/UX Polish Implementation

Status: **PASSED / CLOSED**, 2026-11-01.

The four P1 changes pass automated, desktop, responsive and HTTPS checks, followed
by fresh user-reported Android Edge/Quark lightweight UI acceptance. All four
release-required UI/UX findings are resolved. V0.2 is NOT RELEASED. No M9A2,
main merge, tag, version change or Pages deployment is included.

## Baseline, checkpoint and candidate

- Branch: `feat/v0.2-video-to-animation`.
- Previous product baseline: `f30ac26`.
- Audit checkpoint: `8cafa72c3f23f7a7695389d6c0edd255d073e013`,
  `docs: add v0.2 global ui ux audit`. Only the audit document, numeric evidence
  and eight P1 screenshots were committed. The remote SHA matched and the
  worktree was clean before implementation began.
- Product candidate: `97e7241f10e5982643bdbbb8412354386bb5f66d`,
  `fix: polish v0.2 release-blocking ui issues`, committed and pushed on this
  feature branch. Tests are included in that commit.
- The [original audit](../research/v0.2-ui-ux-audit.md) and its evidence remain
  historical and unchanged. This document records the fixes separately.

## P1 disposition

| Finding | Implementation / desktop result | Android gate |
| --- | --- | --- |
| UI-001 | **FIXED**: engineering workload removed from ordinary presentation and Creator's workload error; exact diagnostics retained. | Ordinary-page check PASS in Edge/Quark. |
| UI-002 | **FIXED**: source, trim, output and runtime messages are contextual; source/input and trim/output group associations added. | Trim/error correction PASS in Edge/Quark. |
| UI-003 | **FIXED**: visible one-source helper, unchanged 0/1/2+ generation policy. | Required at-least-one-browser count check PASS; browser not separately attributed. |
| UI-004 | **FIXED**: all four desktop/responsive paths restore focus and visible result actions. | Representative video-result return PASS in Edge/Quark. |

Implementation: **4 / 4 P1**. P2 intentionally not implemented: **6 / 6**.
Removing UI-001's row necessarily reduces page height; it does not constitute
UI-009 form-density work. Focus styling is specific to UI-004, not a redesign
of result action hierarchy.

## UI-001 — Product summary and diagnostic preservation

Video's normal estimate keeps Selected duration, FPS, Sampled frames and Output
dimensions. It no longer presents Frame-pixel workload or a 15.36 MP budget.
The existing actionable frame-count/workload rejection messages remain; exact
limits and calculations are unchanged.

Creator's workload message is now:

> This sequence is too large to encode safely. Reduce the number of images or use smaller images.

Only that copy helper changed in `creation-session.ts`; CreationSession's
ownership, admission and encoding behavior are unchanged. No other P2 error-copy
cleanup was performed.

Under `?debug=1`, existing plan/limit diagnostics remain. Numeric `estimate` and
`preflightIssue` also preserve the rejected estimate when no valid plan exists.
The tests confirm an over-budget estimate exceeds the unchanged 15,360,000
limit while Convert remains disabled. No new collection or network logging.

## UI-002 — Local errors and accessibility

- Source admission has not completed until metadata exists. Before that point,
  preparation status and file/container/codec/load failures appear inside Source
  video, beside the input; the input describes its error and is marked invalid.
- The existing `Preflight.issue` selects trim/duration errors for Trim. Both
  controls describe the error ID; the whole Trim fieldset is marked invalid and
  describes the same message. This represents the combined start/end constraint
  without adding another validator.
- Other preflight failures stay in Estimated result, immediately before the
  action, and are described by the Output fieldset. They are not source errors.
- Post-admission decoder/Worker/encoder failures remain in the job area.
- Inline validation is not an assertive live region on every keystroke.
  Asynchronous source/job failures have one alert at the appropriate location;
  source preparation has one status message, without a second distant copy.
- Valid correction removes error associations. The existing
  `0 <= start < end <= duration`, end-exclusive sampling, 30-second and dynamic
  budget checks are untouched.

## UI-003 — Creator count feedback

| Sources | UI | Generate policy |
| --- | --- | --- |
| 0 | Existing empty state | Disabled |
| 1 | “Add at least one more static image to create an animated GIF.” beside the source list | Disabled; describes visible helper |
| 2+ | Minimum helper absent | Existing rules apply |

Tests cover 0/1/2/20 sources. Existing two-source minimum, maximum, duplicates,
ordering and all other requirements remain intact. The explanation is visible
outside the disabled button, so it is not dependent on focusing that button.

## UI-004 — Preview return without Session changes

`usePreviewReturn` is a small UI hook shared by the three existing Workspaces.
It records only that a Preview return is pending and keeps a React ref to the
currently mounted Preview trigger. It does not retain the detached old node or
save media/session data.

Each Workspace keeps its existing Preview Close/Back and joined Viewer teardown.
Only when that gate finishes and the result form remounts does the layout effect:

1. Resolve the new, connected, enabled Preview button.
2. Focus it with `preventScroll`.
3. Bring it into view using the current layout and instant, centered native
   scrolling. No saved, stale document offset or arbitrary timeout is used.

A scoped focus style keeps the same blue 3 px outline visible after pointer
Close as well as keyboard return. The next Tab reaches Download. Native MP4
Back to result uses the same mechanism; its media element teardown is unchanged.

The pending flag is consumed once. Ordinary edits/generation do not restore
scroll. Missing/detached/disabled targets are ignored. Leaving the Workspace
adds no timers, listeners, URLs or other resources. No router, persistence,
Player, Decoder, MediaSession or Session ownership redesign.

## Validation

Official environment: Node v24.22.1 / npm 11.19.1 from `D:\tool\nodejs`.

| Check | Result |
| --- | --- |
| `npm ci` | PASS; lockfile/dependencies unchanged; existing 12 moderate advisories not force-fixed |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | **76 files / 968 tests PASS** |
| `npm run build` | PASS, including `/AniView/` release-path checks |
| Clean candidate build | PASS; release metadata says `97e7241`, `sourceDirty: false` |

Previous tests: **948, all retained**. New tests: **20**. New unit-test file:
`src/video-conversion/ui-polish.test.tsx` (16 tests); four parameter cases added
to `CreateGif.test.tsx`. No failing test was deleted or check disabled.

The new [browser driver](../../tools/ui-polish/README.md) reuses installed Edge
and existing acceptance tooling. Its final run passes:

- **16 same-width returns**: four flows × 1280/768/390/360.
- **4 reflow returns**: one per flow, resize 390 → 360 while Preview is open.
- **4 keyboard round trips**: Enter for animation paths, Space for native MP4.
  Tab advances from restored Preview to Download; More Escape restores More.
- Exact result URL/metadata and encode-job count remain unchanged on return.
  Preview is decoded/ready before closing, not merely an empty page shell.
- Preview and Download are both onscreen; blue 3 px focus and no horizontal
  overflow are checked. Actual pointer events exercise the Close path.
- Four native downloads complete to the ignored test directory, with nonzero
  byte lengths: Creator GIF, converted GIF, MP4 and video-derived WebP.
- Eight supporting groups cover minimum count, source/trim/output placement,
  error correction, ordinary/debug presentation, workspace Worker/URL cleanup,
  static viewing and borrowed ZIP conversion → original source.
- Worker/URL probes are zero after the checked Workspace exits. This is not a
  fabricated whole-browser memory/bitmap/GPU bound. The retained ZIP source may
  still own its archive worker during viewing, as before.
- Final run: no page exceptions, failed HTTP responses or CDP transport notices.
  The driver preserves an exact, known CDP probe-target teardown notice
  separately if encountered; actual page errors and other protocol failures fail.

Initial driver-only issues were corrected: native Enter requires its character
event, and a 2×2 parser fixture is not the installed H.264 encoder's supported
configuration. The accepted 320×240 product fixture is used instead. Neither
required a product or codec change.

No 8C/8D codec, B-frame/VFR, PAR, 150-frame boundary or stress matrix was repeated.
This is a UI regression gate. Keyboard/ARIA checks are not a claim of complete
screen-reader or WCAG certification.

### Bundle and unchanged processing code

Against the accepted 8D2 artifact:

| Asset group | Raw change | gzip change |
| --- | ---: | ---: |
| Startup JS aggregate | 293330 → 293335 B (+5) | 89830 → 89829 B (−1) |
| Main CSS | 10198 → 10228 B (+30) | 2900 → 2920 B (+20) |
| Creator lazy workspace | +339 B | +107 B |
| Animation/MP4 lazy workspace | +143 B | +45 B |
| Video lazy workspace | +956 B | +259 B |
| New shared lazy return chunk | 1065 B | 646 B |

Worker filenames and bytes remain unchanged, including Source, animation
encoders, MP4 encoder and inspection worker. Protected-source diff checks show
no decoder/encoder/sampling/limit/dependency/PLAN/AGENTS/workflow changes. The
historical audit files are not rewritten.

Local reports/screenshots/profiles/downloads remain ignored in `.tools/ui-polish/`;
command logs are in `.tools/ui-ux-audit/m9a1b-*.log`.

## Frozen Android UI candidate — accepted user evidence

Page:
`https://classroom-activation-manually-brian.trycloudflare.com/AniView/`

Original 2187-byte video sample:
`https://classroom-activation-manually-brian.trycloudflare.com/AniView/validation/video-animation/small.mp4`

The independent frozen production artifact has 34 hashed files at commit
`97e7241`; no HMR and no Pages deployment. Local port 4244 is wrapped by the
temporary HTTPS tunnel. The computer must remain awake/online; the phone need
not share its Wi-Fi. The frozen files remained unchanged during acceptance.

New desktop HTTPS verification confirms the exact clean candidate, secure
context, no HMR, H.264 source → WebP, Preview → Close with retained URL and focused
trigger, and visible Download (bottom≈726 px in an 844 px viewport). The public
sample returns 200 and matches the original fixture SHA-256. This **does not**
stand in for Android validation.

| Required new phone evidence | Edge | Quark |
| --- | --- | --- |
| Trim error near fields; valid correction clears it | PASS | PASS |
| Preview → Close keeps result/Download visible, with sensible focus/context | PASS | PASS |
| Repeat return and one Download | PASS | PASS |
| No ordinary frame-pixel workload | PASS | PASS |

Creator one-static-image helper and two-image enablement: **PASS for the required
at-least-one-browser check**. The user did not separately name the browser for
this subtest; do not infer that both browsers performed it.

The user's direct reply to the complete checklist was:

> 各项测试均无异常

This closes the requested lightweight phone gate. The
[Android acceptance record](milestone-m9a1b-android-validation.json) preserves
the exact reply and scope. It is user-reported evidence, not independently
instrumented phone data. No new device model, browser version, numeric focus
trace or per-case measurements were supplied or invented. This is not a fresh
codec matrix or a phone retest of every conversion direction/native MP4 path.

## P2 and known scope boundaries

UI-005 Home copy; UI-006 result metadata/action hierarchy; UI-007 labels;
UI-008 general error vocabulary; UI-009 form-density redesign; UI-010 touch
filename disclosure: **optional, deferred from this milestone, not implemented**.
They are not required for V0.2 release according to the audit.

No advanced timeline, crop, custom FPS/resolution, batch mode or large design
system rewrite. Existing in-memory reload behavior is unchanged.

## Completion gate

Desktop gate: **PASS**. Android gate: **PASS**. M9A1b: **PASSED / CLOSED**.

Closure changes documentation only. The accepted product candidate remains
`97e7241`; its 34 frozen file hashes are checked again at closure. No application
change after phone acceptance invalidates the previous 968-test/build/browser
gate, so those suites are not needlessly repeated for this documentation update.

**UI/UX release blockers: CLOSED.**

Ready for: **M9A2 — V0.2 Stability & Release Candidate Audit**. STOP; M9A2 has
not started. Main, v0.1.0 and public production remain unchanged. V0.2 remains
**NOT RELEASED**.
