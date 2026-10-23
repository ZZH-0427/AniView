# Milestone 3: Input Experience

Status: **PASSED** (2026-10-23). Implementation, desktop/browser regressions,
GitHub Actions/Pages and new user-reported Android input acceptance are complete.
Historical Milestone 1/2 picker observations remain separate from these final
Milestone 3 results. PLAN.md, AGENTS.md and previous milestone documents are
unchanged. Milestone 4 has not been started. No ZIP, directory import,
static-image engine or later Viewer UX feature is implemented.

## Shared input and session

```text
standard file input / DataTransfer.files
  -> browserFile -> VirtualFile[] -> MediaSession
  -> current VirtualFile -> binary FormatDetector
  -> existing animation decoder -> Player -> CanvasRenderer -> Viewer
```

`src/components/ImageInput.tsx` uses one standard hidden file input activated
by a keyboard-accessible button. `src/input/file-input.ts` copies File references
and resets `input.value` before delivery so selecting the same file again works.
Empty/cancelled selections are no-ops. `src/input/drag-drop.ts` reads only
DataTransfer.files and reuses the same browserFile adapter; it does not read URL,
HTML or text payloads. `VirtualFile.source` distinguishes file and drag-drop
without changing detection or playback. Browser MIME is retained only as a hint.

`src/media/media-session.ts` is a small immutable page-lifetime list. It stores
VirtualFile references, current index and monotonic item IDs. It provides append,
previous/next, remove-current and clear. Input order and duplicate selections are
preserved; append leaves the current file playing. Navigation does not wrap at
list boundaries, independently of the animation's own loop count. Removing an
item affects only its session reference, never the device file. Removing the
current item selects its successor, or the new last item when removing the tail.
Removing the last item, Clear session and Close all return to Home.

Sessions hold at most **1,000 items**. Oversized picker/drop selections append the
first available items in order and display how many were added. UI state and
the notice update together from the latest session, including repeated drops.
No content hashing or filename-based deduplication is performed.

No file bytes are stored in React state. Selecting 100 files does not read,
detect or decode 100 files: only the current item opens. Existing decoder source,
dimension, frame-count and work guards remain authoritative, and existing
bounded frame budgets are unchanged. No object URLs, base64 media storage,
uploads, analytics or new dependencies are introduced in production.

## Mobile and desktop baseline

Both input locations use `accept="image/*"`, `multiple` and **no capture**
attribute. The mobile primary label is **选择图片**. Desktop uses **Open Images**
on Home and **Choose more images** in a session. Responsive CSS uses viewport and
pointer capabilities, not browser-name or UA checks. Drag instructions are
emphasized only for fine-pointer/hover environments; the file picker always
remains available. Buttons have visible focus styling and at least 44px height.

The broad accept value is a picker hint, never validation. Standard input is
the complete compatibility baseline. `showOpenFilePicker` is not used: it adds
no needed capability for this milestone's selection/reference model. Its
availability is measured by the desktop harness rather than inferred from a
browser brand. There is no dependency on File System Access APIs, browser
permissions for directory traversal, or an app-provided camera entry point.
If the browser/system offers Camera anyway, that is not a capture request from
AniView and is not a failure.

The shared document-level drop handler prevents browser navigation. It handles
one or several File objects, ignores non-file content, and does not traverse
folders. A depth counter avoids overlay flicker when dragging across children;
drop, dragend and window blur reset the indicator. The overlay does not intercept
pointer events. Drops append to an existing session just like file selection.

## File status and recovery

Binary signatures and container metadata remain authoritative regardless of
extension, missing extension or misleading MIME. Animated WebP, APNG and GIF
use the existing decoders. Single-frame GIF remains supported.

Recognized static PNG, JPEG and static WebP are rejected before decoder
construction with: "This file is a static image. Static-image viewing is not
available in this milestone." PNG retains the existing error code for backwards
compatibility; the displayed policy is shared. Unsupported image/container
formats show "Unsupported image format." Recognized damaged animation data
continues to produce a damaged/decode error as appropriate. A text file renamed
`.gif` remains unsupported, not a GIF just because of its extension.

A failing item retains the session. Previous, Next, Remove from list, selection
and Clear remain available. Filename, actual animation format, dimensions,
frame count and list position are displayed without exposing raw MIME/signatures.

## Playback lifetime when switching

`MediaSession` owns which file; `AnimationPlayer` still owns how that file plays.
`MediaApp` keys each Viewer by unique item ID. Teardown marks the old instance
inactive, aborts its decoder/Worker synchronously, stops the player and clears
its cache/rendering resources. A shared transition promise joins the old open
and cleanup before a new Viewer allocates another decoder. Cancelled opens that
finish late dispose their sequence instead of loading it. Queued navigation
through Next/Previous can therefore skip obsolete items without drawing them.

Adding files does not replace the current keyed Viewer, so playback is preserved.
The transition gate also survives Clear/Close and immediate same-file reselection.
Existing Player/FrameBuffer generation guards and frame disposal remain in use.
There are no input-specific or browser-specific codec/player paths. The isolated
`?spike=webp` route is unchanged.

## Validation

Use installed Node 24 (`D:\tool\nodejs`), npm and the existing lockfile:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm run preview
node tools/webp-wasm/browser-check.mjs "http://127.0.0.1:4173/AniView/?debug=1" .tools/fixtures/animated.webp input
```

The input browser scenario uses installed Edge and CDP, with no browser/framework
download. It exercises real picker FileLists and DOM drops with File objects;
these are application integration tests, not Android system-picker UI tests.
Browser reports/screenshots stay ignored under `.tools/browser-results`.
The same scenario and existing WebP/APNG/GIF/spike regressions must pass against
the actual Pages URL after the official Actions deployment.

Local validation on Windows with Node 24.22.1 / npm 11.19.1: lint, typecheck,
**167 tests in 22 files**, and the production build pass. The 39 new tests cover
browser-file conversion, picker cancellation/reselection, file drops, session
transitions/count limits and signature/static/unsupported handling. Existing
codec, cache, player, rendering and worker tests remain in place.

Installed Edge 155 integration checks pass single/multiple selection, selection
order, duplicate entries, append without decoding unvisited files, navigation,
remove/clear/close/reselect, static/unsupported/damaged-item recovery, all three
animation formats and misleading MIME/extensions. Rapid navigation while opening
and playing leaves the correct paused first frame/metadata, with no late-file
replacement. Instrumented Worker lifetime remains at most one live decoder and
returns to zero after clear. Numeric frame-transfer checks confirm RGBA ownership
transfer, with no observed page/asset errors. Home and Viewer fit 390/1280px
viewports, with 44px buttons and visible keyboard focus.

The actual desktop runtime exposes `typeof window.showOpenFilePicker ===
"function"`; the product intentionally still uses only the standard file input.
This observation does not imply Android support for that optional API. Existing
real WebP, APNG, GIF and WebP diagnostic-spike scenarios also pass against the
production build served at the `/AniView/` subpath.

### GitHub Pages verification

Implementation commit `d94353cbc68b4f1694f520ad2d63068d83e5a9b7` passed
[Actions run 39935955857](https://github.com/ZZH-0427/AniView/actions/runs/39935955857),
including validation, artifact upload and Pages deployment. The source was
published to main with verified Git object hashes and a non-force update using
the official Git Data API fallback for the environment's Git HTTPS limitation.

All **33 input browser checks** passed against
`https://ZZH-0427.github.io/AniView/?debug=1`. Actual production Worker accounting:
24 created, 24 terminated, maximum one live decoder, zero remaining after clear;
138 RGBA ownership transfers observed. The 1001-item picker and 1002-item drop
each retained 1000 references, displayed the explicit truncation message and
decoded only the current file. Nested dragenter/dragleave, outer leave, drop and
dragend correctly maintained/cleared the overlay. URL navigation was prevented;
the test compares normalized URLs to allow browser hostname lowercasing.

Production WebP, APNG, GIF and WebP spike regressions also passed, including
continuous playback, Pause/Resume, Replay, loops, Close/reopen and failure
recovery. All decoder Worker and WebP WASM resources loaded successfully under
`/AniView/`; no page errors or asset 404s were observed. These results are desktop
Edge 155 browser evidence, separate from the final Android matrix below.
The production verification record and URL comparison correction in `bc9e219`
also passed [Actions run 39936505473](https://github.com/ZZH-0427/AniView/actions/runs/39936505473),
including build and Pages deployment.

## Historical Android observations (before Milestone 3)

These are user-observed behaviors under the previous input configuration, not
web-platform guarantees and not acceptance of the final `image/*` input:

| Browser | Historical picker behavior |
| --- | --- |
| QQ | Full gallery; albums and all gallery pictures accessible |
| Quark | Full gallery; albums and all gallery pictures accessible |
| Chrome | Filesystem-oriented picker; Pictures/DCIM/Download available |
| Edge | Filesystem picker, Recent/Browse and Pictures/Documents/Download/DCIM |
| Xiaomi | Partial/format-filtered gallery, mainly WebP/PNG/GIF |

Picker appearance is determined jointly by browser, Android and accept handling.
AniView cannot guarantee the same gallery/albums UI across browsers. Success
means a supported animation can be selected through the available path and is
then correctly opened through the shared File/VirtualFile/Viewer pipeline.

## Final Android matrix: accept="image/*"

On 2026-10-23 the user supplied new real Android results after testing the final
`accept="image/*"` input. All five pickers opened and all five browsers could
select and play the requested animation formats. These are user reports,
not independently observed Android/browser sessions or historical codec results.

| Browser | Picker style | Albums | Directory browse | Supported files selectable | Multiple | AniView open |
| --- | --- | --- | --- | --- | --- | --- |
| QQ | Gallery only; all pictures accessible | All albums; switchable | No | Requested formats visible/selectable | Yes | Plays normally |
| Quark | Gallery only; all pictures accessible | All albums; switchable | No | Requested formats visible/selectable | Yes | Plays normally |
| Chrome | Gallery only; all pictures accessible | Four offered albums; switchable | No | Requested formats visible/selectable | Yes | Plays normally |
| Edge | Gallery only; all pictures accessible | Four offered albums; switchable | No | Requested formats visible/selectable | Yes | Plays normally |
| Xiaomi | Gallery only; all pictures accessible | Four offered albums; switchable | No | Requested formats visible/selectable | Yes | Plays normally |

The user explicitly confirmed Previous/Next, adding images, Remove from list
and Clear worked in every browser. Each browser offered a camera entry, even
though AniView sets no `capture` attribute. This is recorded as browser/system
UI, not an app request or failure. The exact additional visible image formats,
browser/Android versions and original file contents were not supplied. Picker
cancellation and Close/reselection remain covered by desktop integration tests;
no separate explicit Android result for those two actions is invented.

### Chrome/Edge picker change

The earlier input used a specific extension/MIME list and single selection;
the final input uses broad `image/*` with multiple selection. Chrome and Edge
previously exposed directory browsing but the new user report describes a
gallery-only picker with four offered albums. This is a real observed change
in the browser/system selection route, not evidence of a decoding regression.
The chosen formats are visible and playable, so the milestone's input success
criterion is satisfied. Album categories are not a filesystem directory tree.

The accept value hints the type of content, while the browser and Android choose
the native selection interface. Broad image selection is consistent with routing
to a visual-media picker, but the exact device-level cause cannot be established
without browser/system versions or native intent diagnostics. AniView neither
implements nor disables navigation inside the native picker. No UA workaround,
capture request, extra picker API or input behavior change was added in response.

Known limitations: browser/system picker UI and multi-selection vary; static
viewing, recursive folders and ZIP input are not implemented. The tested mobile
image picker does not provide filesystem directory browsing; that is a documented
platform limitation of this entry path. **Ready for Milestone 4 - ZIP Archive
Input** when separately requested; no Milestone 4 work is included here.
