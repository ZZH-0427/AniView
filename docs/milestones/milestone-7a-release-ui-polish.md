# Milestone 7A — Release UI Polish

Status: **PENDING ANDROID UI VALIDATION** (2026-10-24).

Milestones 0–6 remain closed. This milestone changes presentation only. New
Android Edge and Quark UI checks and animated/static phone screenshots are still
required; earlier Android stability acceptance does not close this UI gate.
No version change, tag or GitHub Release is part of this milestone.

## Presentation boundaries

`src/components/Icon.tsx` defines 16 inline SVG icons: play, pause, step back,
step forward, replay, previous file, next file, zoom in, zoom out, fit, actual
size, fullscreen, exit fullscreen, close, more and remove. All use a 24×24
viewBox, currentColor rounded strokes and no fill. SVGs are aria-hidden;
`IconButton.tsx` supplies a native button, accessible name and title. No
dependency was added and the lockfile is unchanged.

`src/pages/Viewer/ViewerControls.tsx` contains ViewerHeader, PlaybackControls,
FileNavigation and ViewportControls. `ViewerMoreMenu.tsx` contains the local More
menu. Viewer passes its existing handlers and disabled conditions into these
components. The same components serve phone and desktop layouts.

The original player, decoder, FrameCache, viewport controller/gestures,
MediaSession, archive session, VirtualFile, format detector, resource policy,
media/fullscreen hooks, lifecycle and shortcut implementations have no changes.
PLAN.md and AGENTS.md are unchanged. Worker and WASM build hashes are unchanged.
The MediaApp wrapper is only a layout container.

## Layout and controls

The phone header has a single-line ellipsized filename with its full value in
the title, followed by Fullscreen (when available), More and Close. Smaller
format/dimensions/frame metadata occupies a secondary line. This also handles
long names and nested ZIP names without displacing header actions.

The Canvas takes the remaining primary space. Below it, a small state/frame row
precedes three logical groups: frame playback, file navigation and viewport.
Replay shares the playback row. Frame step uses bar/triangle icons; file changes
use distinct chevrons surrounding Image N / Total. All icon hit targets are at
least 44×44 CSS px, with a 48×48 Play/Pause primary action. Disabled, hover,
pressed and focus-visible states remain distinguishable.

Zoom out, percentage, zoom in, Fit and 1:1 share a compact row. The 1:1 tooltip
explains Actual size (100%): one image pixel per CSS pixel. Tiny-media Fit is
not clamped: the 2×2, 1000-frame WebP legitimately displays a large percentage.
Static images have no playback, step or frame-count controls and no reserved
playback row. On wide screens the control groups share a row and the header
also shows a small AniView name.

Normal controls fit in the first viewport at 320/390×844 and 768/1280×1000.
At 390×844, the animated media surface is about 503 px tall and the entire
bottom area about 184 px. At 320×844 these are about 514 px and 184 px.
Expanded diagnostics deliberately allow a longer scrolling page. Normal flex
layout uses min-height: 0 so an already sized Canvas cannot force controls
below the first screen. The expanded-panel min-content rule excludes fullscreen;
fullscreen instead bounds and scrolls its bottom area on short screens.

Fullscreen remains driven by the existing actual fullscreenchange state and
2.5-second inactivity policy. Header icons change between enter/exit. Existing
touch, mouse, keyboard, focus and gesture coordination is preserved.

More contains only Remove from list, with a matching icon and explanatory text.
It retains direct removal without a confirmation or device-file deletion.
Enter/Space open it, the menu item receives focus, Escape closes and returns
focus, Tab/Shift+Tab leave it predictably, and outside pointer/focus closes it.
Its Escape does not escape the viewer or fullscreen. No modal or new gesture
was added.

## Diagnostics

Normal URLs render no DiagnosticsPanel, raw JSON outputs or internal counter
names. `?debug=1` alone enables Image, Resource and applicable Archive panels,
all native details disclosures initially closed. Expanding shows friendly
Playback, Frame cache, Viewport, Media, Resources, Archive and Errors groups.
Only numeric values/raw output use monospace styling.

Each panel has a second closed Raw JSON disclosure preserving the original
complete snapshots and test IDs. All Milestone 6 counters remain accessible;
there is no new collection, logging, media upload or resource-policy behavior.
Short-screen checks open multiple panels, confirm no overlap and confirm every
enabled viewer button can scroll into view and receive pointer hits.

## Validation

Formal installed Windows Node v24.22.1 / npm 11.19.1 was used. `npm ci`, lint,
typecheck, test and production build passed. Vitest has **40 files / 494 tests**:
the existing 469 plus 19 icon/control and six diagnostics rendering tests. No
valid tests were removed or skipped.

The new `npm run test:release-ui` browser scenario passed **20 groups** in real
installed Edge 155. It covers normal DOM absence, debug default/expanded/raw
states, labels/titles/SVG semantics, actual Play/Pause icons, frame versus file
handlers, disabled endpoints, static controls, menu keyboard/outside/removal,
fullscreen icon/focus behavior, error recovery and all four responsive widths.
The same 20 groups also passed in installed Windows Chrome 153.0.8010.53.

The complete existing Viewer UX suite also passed **64 groups** on this final
build in Edge 155, including exact pixels/EXIF, all animated/static formats,
frame reconstruction and cache bounds, keyboard, gestures, fullscreen and
session navigation. It ended at 18/18 Workers and 29/29 static bitmaps, all
inactive; 5,855 RGBA transfers detached correctly. Across 1,497 APNG emissions,
the temporary bitmap peak was one and live count after emission was zero.

Its lightweight rapid-switch check performs 100 icon-driven transitions through
192 mixed-media references, finishes on item 101, discards stale work, closes
and reopens. Normal-page counters ended at 7/7 Workers and 8/8 static bitmaps,
all inactive. After navigating to the separate debug page, that page ended at
3/3 Workers and 1/1 static bitmap, also all inactive. Counters reset on page
navigation and are not one cumulative observation. ZIP extraction stayed
current-only and closing released the archive and decoder Workers.

`npm run test:browser` passed the **seven Milestone 6 core groups**, including
six media kinds, lazy ZIP, rapid navigation, close/reopen, real hidden-page
behavior, delayed-first-frame recovery and resource cleanup. This final run
ended at 10/10 Workers and 11/11 static bitmaps, all inactive. Extended soak was
not repeated because no core media or lifecycle implementation changed.

Existing automated selectors now prefer accessible labels over button text.
All original behavioral assertions remain, including pixel/EXIF, stepping,
viewport gestures, fullscreen and bounded reconstruction checks. The new short
release UI scenario is also required in CI after the existing core browser run.
Pull requests still validate only; official Pages artifact/deploy actions run
only for main publication.

Full-page screenshots were captured and visually reviewed for phone animated
and static media at 390 px, desktop animated and static media at 1280 px, debug
collapsed and expanded states, plus 320/768 px and 390×667 expanded diagnostics.
The 2×2/1000-frame WebP is used in the animation screenshots. Normal media
dominates, controls are compact, names do not overlap icons, and no horizontal
overflow or target smaller than 44 px was observed. Browser screenshots and
reports stay ignored under `.tools/browser-results/`; they are desktop browser
emulation, not Android screenshots.

## Bundle impact

Both measurements use raw bytes and Node gzipSync with the same settings.

| Main asset | Before | After | Gzip before | Gzip after |
| --- | ---: | ---: | ---: | ---: |
| JavaScript | 279,606 B | 288,764 B | 84,757 B | 87,482 B |
| CSS | 5,579 B | 10,163 B | 1,885 B | 2,885 B |

JavaScript grows 9,158 B (2,725 B gzip); CSS grows 4,584 B (1,000 B gzip).
There are no added packages, fonts, icon downloads or network services. ZIP
remains lazy. Codec Worker/WASM payloads are unchanged. Asset references retain
the `/AniView/` base.

## Publication and remaining acceptance

Implementation commit: `56907660b61862ff31761ae82b635b5db5a97357`
(`feat: polish viewer UI for v0.1`). Published to main through the established
Git Data API fallback, checking blob/tree/commit hashes and updating the ref with
force disabled. No repository setting changed.

[Actions run 40060783337](https://github.com/ZZH-0427/AniView/actions/runs/40060783337)
completed successfully. npm ci, lint, typecheck, unit tests, build, both actual
Chrome browser regression steps, official Pages artifact upload and deployment
all succeeded. This is the observed run result, not inferred configuration.

At [the production URL](https://ZZH-0427.github.io/AniView/), installed Edge 155
passed the 20 release UI groups in ordinary/debug mode and seven core stability
groups. The ordinary page rendered no diagnostics DOM; debug panels and Raw JSON
started collapsed. Animated/static screenshots at 320/390/768/1280 and short
expanded panels were checked against the deployed build. Production core ended
with 10/10 Workers and 11/11 static bitmaps, all inactive. Production UI normal
and debug page resource counts also balanced independently after closure.
The full **64-group Viewer UX** run passed on that same production asset as
well: 18/18 Workers and 29/29 static bitmaps ended inactive, 5,992 RGBA transfers
detached, and 1,435 APNG emissions peaked at one temporary bitmap with zero live
after emission.

The HTML was HTTP 200 and referenced the tested main asset
`/AniView/assets/index-C3A1PzEA.js`. All 26 checked main/lazy JS, CSS, Worker,
WASM, favicon and acceptance resources returned HTTP 200 and matched the local
build SHA-256. No page exception, unexpected console error or asset 404 was
observed during these browser scenarios. The source and runtime paths retain
the `/AniView/` production base.

The remaining gate is a new Android Edge and Quark run on the deployed UI:
animated/static layout, tap targets, correct frame/file navigation, zoom/Fit/1:1,
More/removal, Close, fullscreen when available, and debug collapsed/scrolling
behavior. Record one animated and one static real-phone screenshot. Until those
results arrive: **PENDING ANDROID UI VALIDATION; Milestone 7B is not started**.
