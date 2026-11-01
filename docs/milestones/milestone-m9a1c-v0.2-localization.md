# M9A1c — V0.2 English / Simplified Chinese localization

Status: **PASSED / CLOSED**, 2026-11-01.
Desktop implementation/validation and fresh Android Edge/Quark acceptance complete.
Branch: `feat/v0.2-video-to-animation`; baseline `adac203` (M9A1b closed).
Frozen implementation candidate: `9d377b5ec0a98e487ac26faa2751f750e9153b26`,
35 artifact files, clean source identity; subsequent acceptance documentation
does not change this frozen candidate. HTTPS entry and a localized conversion/
Preview roundtrip were independently checked in desktop Edge.
M9A2 has not started. V0.2 is not released; public Pages remains v0.1.0.

## Architecture and preference

- `src/i18n/messages.ts`: 290 semantic keys, each a required English/Chinese
  tuple. Two dictionaries are generated from the typed catalog. The helper
  interpolates string/number parameters as plain React text, never HTML.
- `src/i18n/locale.ts`: typed `en | zh-CN`, small external store;
  `useI18n` subscribes through React `useSyncExternalStore`. No new dependency.
- Resolution: valid saved `aniview.locale` → first `navigator.languages` entry
  (`navigator.language` if the list is empty) → English. A first language
  beginning with `zh`, including zh-TW/zh-HK, selects the available Simplified
  Chinese translation; it does not claim a Traditional Chinese translation.
- Only a language choice is written to localStorage. Invalid saved values fall
  through to detection. Storage reads/writes can fail: boot and in-memory
  switching still work. No files, filenames, job state, settings, media, URLs
  or passwords are persisted.
- Unknown/missing translations fail visibly in development; production uses
  a localized generic error. Dictionary tests enforce equal nonempty keys and
  placeholder parity. Stable error codes, not English sentence parsing, select
  localized UI messages; raw exceptions are not displayed.

## Product coverage and exclusions

Localized surfaces: Home; gallery/file/archive controls; Viewer status,
metadata labels, playback/navigation/viewport controls, More menu and fullscreen;
ZIP summary/errors; Create GIF source order, helpers, settings, progress and
results; animation-to-animation/MP4 conversion; video-to-animation source,
Trim/output fields, estimates, progress, errors, results and Preview navigation.
Empty/helper states, accessible names, titles and download descriptions follow
the selected language. Original filenames are preserved verbatim.

Examples: `Preparing source…` / `正在准备源文件…`,
`Encoding {current} / {total}` / `正在编码 {current} / {total}`,
`Checking output…` / `正在检查输出…`, `Cancelling…` / `正在取消…`.
Progress still reflects the original runtime phase; no synthetic stage is added.

Intentional exceptions: browser-native file chooser/video/download/OS dialogs;
debug diagnostics/JSON/internal identifiers under `?debug=1`; engineering
harnesses; format/codec/API names and standard units. Examples include GIF,
Animated WebP, APNG, MP4 (H.264), VP9, WebM, JPEG, PNG, ZIP, FPS, KiB, MiB,
px, ms, s, %, × and 1:1. The switcher's language autonyms remain English and
简体中文 in both modes. These are not untranslated ordinary UI.

## Navigation, ownership and accessibility

The global secondary select appears above all workspaces, with a fullscreen
Viewer copy inside the fullscreen root. It has a localized native label,
44px touch height, keyboard operation and a visible focus indicator; no flags.
`html.lang`, title and description update in place.

There is no locale key on a workspace/session, reload, router, re-import or
locale dependency in media/encoding effects. Creator stores locale-neutral
presentation descriptors alongside legacy English error/notice fields. Its
settings error now carries a stable field discriminator; validation conditions
are unchanged. Conversion error formatter functions receive the locale. These
changes do not change session ownership, cancellation or resource release.

Viewer frame/zoom, source order/settings, target, trim/FPS/size, result Blob/URL,
native Preview element and active job identity survive switching. Selected
files remain ephemeral across full reload, as before; language preference is
the only new persistence. M9A1b's `use-preview-return.ts`, stable error IDs,
field association and joined teardown/focus/scroll behavior are unchanged.

No codec, decoder, encoder, Player, renderer, sampling algorithm, source
adapter, Worker protocol, resource limit, package/lockfile, PLAN or AGENTS edit.
All nine Worker JS bundles and the WebP WASM are byte-identical to accepted
candidate `97e7241`; no media/GPU memory claim is inferred from UI tests.

## Desktop evidence

`node tools/localization/run-browser.mjs`, installed Edge, production build,
localhost secure context, no HMR:

- 10 behavioral checks: first-run detection, preference override/reload/invalid
  preference, blocked storage, native select keyboard, Viewer playback/menu/
  fullscreen/state, active Creator/video jobs, video settings and error IDs,
  ordinary-mode diagnostics exclusion and locale-only storage.
- 100 surface/locale/viewport captures: ten surfaces × English/Chinese ×
  1440/1280/768/390/360px. No horizontal overflow or unintended mixed owned text
  after the documented exclusions. Representative Home, Viewer, Creator result
  and invalid-Trim screenshots were visually inspected.
- 16 Preview returns: Creator, animation conversion, MP4 native Preview and
  video-to-animation × both locales × 390/360px. Switching inside Preview retains
  the media element/result URL. Close returns focus to Preview; Download stays
  in the viewport below the language bar; Tab reaches Download.
- Active Creator remained `preparing`, generation count1/cancellation0.
  Active video remained `converting`, same job ID/start count/cancellation0.
  No page exceptions. Media is selected from procedural fixtures, never uploaded.

Ignored evidence: `.tools/localization-browser/report.json`, screenshots,
`.tools/localization/measurement.json` and local validation logs. Test driver:
`tools/localization/run-browser.mjs`; fixture prerequisites in its README.
This is desktop evidence, not an Android browser result or screen-reader audit.

## Automated checks and bundle

Official installed Node24.22.1/npm11.19.1. `npm ci`, lint, typecheck, test and
production build all passed. Original968 tests remain;31 new tests bring the
total to **999 tests /79 files**, no removed/skipped tests or weakened rules.
Test setup chooses English for legacy assertions; detection tests explicitly
cover other languages/storage. Browser helper defaults English deterministically;
the localization driver overrides detection before boot for detection tests.

| Ordinary startup asset sum | Before97e7241 | After | Delta |
| --- | ---: | ---: | ---: |
| JavaScript raw bytes |293335|325373|+32038|
| JavaScript gzip bytes |89829|100489|+10660|
| Entry CSS raw bytes |10228|10958|+730|
| Entry CSS gzip bytes |2920|3078|+158|

JS includes the HTML entry and modulepreloads; gzip is per-file. Dictionaries
are loaded once in a shared i18n chunk; existing lazy workspaces stay lazy.
No added dependency. Build verifies `/AniView/` asset paths and excludes
validation media from the production artifact. No Pages deployment occurred.
Existing npm audit findings (12 moderate) remain unchanged; no force update.

## Android gate and remaining limitations

Fresh Android Edge and Quark lightweight localization acceptance passed on
the frozen candidate. User response: “测试完成，均无问题”. Language/layout,
selected source/settings, conversion/results, Preview return and Home were
confirmed; the one-browser minimum-image helper/invalid-Trim supplement was
covered by that response, without specifying which browser performed it.
See [Android validation](milestone-m9a1c-android-validation.md). Previous M9A1b
or codec tests were not used as a substitute for this round.

Only English and Simplified Chinese are supplied. Native controls follow OS/
browser language; technical names, debug and harness content intentionally
remain standardized/English. Actual screen-reader speech has not been tested.
No localization blocker remains known from the completed acceptance. V0.2
localization is complete and UI/UX release blockers for this stage are closed.
Ready for M9A2 — V0.2 Stability & Release Candidate Audit, but it has not started.
Do not automatically begin M9A2, merge, tag, deploy or release.
