# AGENTS.md

# AniView Codex Development Instructions

This file defines the operational rules that Codex must follow when modifying the AniView repository.

`PLAN.md` defines **what AniView is and where the project is going**.

`AGENTS.md` defines **how Codex must work inside the repository**.

These two documents should be treated together.

---

# 1. Required Reading

Before making architectural or implementation changes, read:

```text
PLAN.md
AGENTS.md
```

Do not begin substantial implementation work without understanding the relevant sections of `PLAN.md`.

For a small localized task, it is not necessary to reread every line of the plan, but Codex must verify that the requested change does not conflict with the project's architectural invariants.

---

# 2. Instruction Priority

When working in this repository, use the following priority order:

```text
Explicit current user instruction
        ↓
AGENTS.md
        ↓
PLAN.md
        ↓
Existing implementation conventions
        ↓
Personal implementation preference
```

If a current user instruction appears to conflict with a major architectural invariant in `PLAN.md`, do not silently override the architecture.

Instead:

1. identify the conflict;
2. explain the consequence;
3. propose the smallest compatible solution;
4. wait for an explicit architectural decision when necessary.

Minor implementation details that do not affect the architecture may be decided autonomously.

---

# 3. Project Scope

AniView is a:

```text
pure client-side
local-processing
cross-platform
animated-media web application
```

V0.1 is primarily an animated image viewer.

The supported animation formats are:

```text
Animated WebP
APNG
GIF
```

Static image viewing may also support:

```text
WebP
PNG
JPEG/JPG
```

Do not expand V0.1 into unrelated features unless explicitly requested.

In particular, do not prematurely implement:

```text
video transcoding
full media conversion
RAR support
7z support
cloud storage
accounts
backend APIs
media synchronization
advanced editing
```

The future architecture must leave room for these features without implementing them early.

---

# 4. Core Architectural Invariants

The following rules must not be violated casually.

## 4.1 Client-side only

Normal media viewing must remain entirely client-side.

Do not introduce:

```text
media upload APIs
remote decoding
server-side conversion
backend storage
server databases
```

unless explicitly approved as a future architectural change.

---

## 4.2 No reliance on native animated `<img>` playback

Animated WebP, APNG, and GIF playback must not fundamentally depend on the browser correctly animating an `<img>` element.

Browser-native decoding may be used for static media or isolated optimizations, but AniView's animated-media architecture must remain under application control.

---

## 4.3 Unified input abstraction

All supported file sources must converge into a common abstraction such as:

```ts
VirtualFile
```

Potential sources include:

```text
mobile gallery
mobile file picker
desktop file picker
drag and drop
ZIP entry
```

Decoder code must not depend directly on input controls.

---

## 4.4 Unified animation abstraction

WebP, APNG, and GIF decoders must normalize their output into a common animation representation.

The player must not contain format-specific branches unless technically unavoidable.

Prefer:

```text
Decoder
    ↓
AnimationSequence
    ↓
Player
```

not:

```text
WebPPlayer
APNGPlayer
GIFPlayer
```

---

## 4.5 Memory-bounded playback

Do not build the player around permanently storing every fully decoded frame.

Avoid designs equivalent to:

```ts
const frames = await decodeAllFrames(file);
```

for arbitrary animations.

Prefer:

```text
streamed / incremental decode
        ↓
bounded frame cache
        ↓
release obsolete frames
```

Large animations must not cause predictable multi-gigabyte decoded-frame retention.

---

## 4.6 Keep heavy decode work off the UI thread

Image decoding, archive work, and other expensive processing should run in a Web Worker where practical.

The main thread should remain responsive for:

```text
navigation
buttons
zoom
pan
file switching
rendering coordination
```

Do not move heavy work onto the main thread merely because it makes a prototype easier.

---

# 5. Preferred Architecture

Preserve the conceptual processing pipeline:

```text
Input
  ↓
VirtualFile
  ↓
Format Detection
  ↓
Decoder
  ↓
Animation Model
  ↓
Frame Cache
  ↓
Player
  ↓
Renderer
  ↓
UI
```

Dependencies should normally flow downward through this pipeline.

Avoid circular dependencies between:

```text
UI
decoder
player
renderer
archive
input
```

The UI should orchestrate application state but should not become the implementation location for media decoding.

---

# 6. Source Organization

Follow the project structure described in `PLAN.md` unless implementation experience clearly justifies refactoring.

Expected areas include:

```text
src/
├── app/
├── pages/
├── components/
├── input/
├── archive/
├── formats/
├── media/
├── player/
├── renderer/
├── workers/
└── utils/
```

Rules:

- media decoding belongs under `formats/`;
- file-source logic belongs under `input/`;
- archive handling belongs under `archive/`;
- generic animation types belong under `media/`;
- playback logic belongs under `player/`;
- drawing logic belongs under `renderer/`;
- expensive asynchronous decoding belongs in worker-oriented modules;
- React components should not contain low-level codec logic.

Do not create generic dumping-ground files such as:

```text
helpers.ts
misc.ts
everything.ts
common.ts
```

unless their responsibility is genuinely coherent.

---

# 7. TypeScript Rules

Use TypeScript deliberately.

Prefer:

```ts
explicit domain types
discriminated unions
typed error states
narrow interfaces
```

Avoid:

```ts
any
as any
unknown casts without validation
large untyped objects
```

If external libraries return poorly typed data, isolate unsafe conversions at the adapter boundary.

Do not allow codec-specific types to leak throughout the application.

For example, normalize them at:

```text
WebP adapter
APNG adapter
GIF adapter
```

before passing data to the player.

---

# 8. React Rules

React is primarily responsible for application UI and user-visible state.

Do not put frame scheduling or decoding algorithms inside React components.

Prefer:

```text
React component
    ↓
service / controller / player API
```

rather than:

```text
React component
    ↓
codec implementation
```

Use local React state while the application remains simple.

Do not introduce Redux, MobX, Zustand, or another global state framework unless the application has demonstrated a real need.

If shared state becomes necessary, justify the dependency before adding it.

---

# 9. Dependency Policy

Before adding a dependency:

1. determine what problem it solves;
2. verify that the problem is not already solved by the platform or existing dependencies;
3. evaluate package size;
4. evaluate browser compatibility;
5. evaluate licensing;
6. evaluate maintenance activity;
7. evaluate whether it works under GitHub Pages static hosting.

Prefer mature, focused dependencies.

Do not install a large framework to solve a small isolated problem.

Codec implementation policy:

```text
Use mature codecs/parsers where practical.
Do not reimplement established compression codecs unnecessarily.
```

In particular:

```text
WebP → prefer libwebp/WASM or another justified mature implementation
```

Do not implement VP8 or VP8L from scratch without explicit approval.

---

# 10. Package Management

Use the package manager already established by the repository.

For the initial project, prefer:

```text
npm
```

Once `package-lock.json` exists:

- keep it committed;
- do not replace npm with another package manager without approval;
- use `npm ci` in CI;
- keep dependency changes intentional.

Do not delete or regenerate the lockfile unnecessarily.

---

# 11. Format Detection

Do not trust filename extensions as the primary format detector.

Inspect file signatures and relevant container metadata.

The detector should be able to distinguish at least:

```text
WebP
PNG
APNG
GIF
JPEG
ZIP
unknown
```

APNG must be distinguished from ordinary PNG through its animation metadata.

Extension and MIME information may assist detection but must not override contradictory binary evidence without a documented reason.

---

# 12. Archive Rules

ZIP processing is local.

Archive code must treat archives as untrusted input.

Account for:

```text
encrypted ZIP
corrupted ZIP
unsupported encryption
too many entries
extreme decompression ratio
excessive uncompressed size
malformed paths
```

Do not extract ZIP contents into a persistent browser filesystem merely to view them.

Preferred conceptual path:

```text
ZIP
 ↓
archive reader
 ↓
VirtualFile entries
 ↓
normal decoder pipeline
```

Do not assume ZIP archives are unencrypted.

Even before password extraction is implemented, encrypted archives must be distinguishable from corrupted archives.

---

# 13. Web Worker Rules

Use workers for substantial decoding or archive workloads where technically practical.

Worker communication should use explicit message contracts.

Prefer typed request/response message shapes.

Consider transferable objects when they materially reduce copying.

Do not transfer ownership of an object if the main thread still needs to use it.

Worker errors must be:

```text
captured
normalized
reported
recoverable where possible
```

A failed decode must not permanently break the entire application session.

---

# 14. Canvas and Rendering

Canvas is the primary rendering surface for animated media.

Keep rendering separate from playback timing.

Conceptually:

```text
Player
 ↓
render frame request
 ↓
CanvasRenderer
```

The renderer should handle:

```text
drawing
viewport sizing
zoom transform
pan transform
device-pixel-ratio handling
```

but should not decide:

```text
which frame comes next
how long a frame lasts
how loops work
```

Those belong to the player.

---

# 15. Player Timing

Do not assume constant FPS.

Respect per-frame durations.

Avoid naïve logic such as:

```ts
setInterval(..., 1000 / 30);
```

unless used only in controlled tests.

Frame scheduling must account for actual animation timing.

The implementation should tolerate delayed browser scheduling without causing uncontrolled timing drift where practical.

---

# 16. Frame Cache Rules

Frame caching must be bounded.

Cache policy may evolve based on testing.

Do not hard-code an arbitrary large frame count without memory reasoning.

Prefer policies based on factors such as:

```text
decoded frame size
current playback direction
device constraints
near-future frame requirements
```

Dispose of resources such as `ImageBitmap` objects when they are no longer needed.

Prevent avoidable memory leaks when:

```text
switching files
closing archives
restarting playback
leaving the viewer
```

---

# 17. Mobile UX Rules

Mobile is a first-class target.

The primary mobile import action should be conceptually:

```text
From Gallery
```

Secondary actions:

```text
From Files
Open Archive
```

Do not remove file access simply because gallery access is easier for ordinary users.

Touch targets should be comfortably usable on phones.

Avoid desktop-only interactions as mandatory controls.

Zoom and pan behavior must account for touch gestures.

Swipe-to-switch-file behavior must not conflict badly with panning a zoomed image.

---

# 18. Desktop UX Rules

Desktop should prioritize:

```text
file picker
multiple file selection
drag and drop
archive opening
mouse interaction
keyboard-friendly controls where useful
```

Do not make desktop users navigate a mobile-first gallery interface.

Mobile and desktop should share the underlying media-processing implementation.

Do not create two separate applications.

---

# 19. Responsive Design

Use responsive layout based on available viewport and input characteristics.

Do not use browser-name checks to decide whether the device is mobile.

Prefer CSS media queries and capability-aware interaction logic.

The interface may differ substantially between phone and desktop, but shared components and business logic should remain reusable.

---

# 20. GitHub Repository Rules

GitHub is the canonical source repository for AniView.

The expected primary branch is:

```text
main
```

Do not create unnecessary long-lived branches.

Do not rewrite Git history unless explicitly instructed.

Do not force-push unless explicitly instructed.

Do not commit unrelated local files.

Do not commit:

```text
node_modules/
temporary test outputs
local caches
editor-specific junk
generated debug media
```

The production build directory:

```text
dist/
```

is a generated artifact and should not normally be committed to `main`.

---

# 21. Git Actions

Codex may inspect Git state when useful.

Before substantial edits, check relevant repository state when available.

After modifications, summarize:

```text
files changed
tests run
build status
known limitations
```

Do not create commits unless the user explicitly asks for a commit.

Do not push to GitHub unless explicitly instructed.

Do not modify remote repository settings unless explicitly instructed.

---

# 22. GitHub Pages Deployment

AniView V0.1 must deploy successfully through:

```text
GitHub repository
      ↓
GitHub Actions
      ↓
Vite production build
      ↓
GitHub Pages
```

The deployment must not require an application server.

Production must work under a repository base path such as:

```text
/AniView/
```

Never assume production runs at `/`.

---

# 23. Asset Path Rules

This requirement is especially important for:

```text
WASM
Web Workers
icons
manifest files
static media
runtime-loaded resources
```

Avoid hard-coded root URLs such as:

```text
/decoder.wasm
/worker.js
/assets/file.bin
```

Use Vite-compatible resolution such as:

```ts
import.meta.env.BASE_URL
```

or:

```ts
new URL("./asset", import.meta.url)
```

where appropriate.

Any new runtime-loaded resource must be tested conceptually against:

```text
https://<username>.github.io/AniView/
```

not only:

```text
http://localhost:5173/
```

---

# 24. Routing

Do not introduce History API routing in V0.1 unless it provides clear value.

For the initial:

```text
Home → Viewer
```

flow, state-based navigation is acceptable and preferred.

If routing becomes necessary later, use a GitHub Pages-compatible strategy.

Do not introduce a deployment-breaking SPA router casually.

---

# 25. GitHub Actions

Deployment should be automated.

The workflow should conceptually perform:

```text
checkout
 ↓
setup Node
 ↓
npm ci
 ↓
tests / validation
 ↓
npm run build
 ↓
upload Pages artifact
 ↓
deploy Pages
```

Do not maintain a manual deployment process as the canonical release method.

Deployment configuration should remain simple and reproducible.

---

# 26. Testing Requirements

Tests should target architecture and behavior, not just implementation details.

Important test areas include:

```text
format detection
VirtualFile implementations
animation timing
frame disposal semantics
frame cache behavior
archive classification
error normalization
worker communication
```

When a bug is fixed, add a regression test where practical.

Do not remove a failing test merely to make CI pass unless the test itself is demonstrably incorrect.

---

# 27. Test Fixtures

Small media fixtures may be stored in the repository when needed for automated testing.

Prefer minimal files designed to test a specific behavior.

Useful fixture categories include:

```text
static WebP
animated WebP
static PNG
APNG
GIF
corrupted image
wrong extension
normal ZIP
encrypted ZIP
corrupted ZIP
```

Avoid committing unnecessarily large binary fixtures.

For large-file performance tests, prefer generated or externally documented test procedures rather than bloating the repository.

---

# 28. Required Validation After Changes

For meaningful code changes, run the appropriate available checks.

At minimum, once configured, this should normally include:

```text
npm test
npm run build
```

If linting exists:

```text
npm run lint
```

If type checking is separate:

```text
npm run typecheck
```

Do not claim a task is complete if the build is known to fail.

If a test or build cannot be executed, state that explicitly.

---

# 29. GitHub Pages Validation

Changes involving any of the following require special deployment-path attention:

```text
Vite configuration
Worker creation
WASM loading
public assets
routing
PWA
manifest
service worker
runtime imports
```

Verify that they do not assume root hosting.

A feature that works only at localhost but fails at `/AniView/` is not complete.

---

# 30. Security Rules

Treat user-provided files as hostile input.

Do not use unsafe archive paths directly.

Do not dynamically execute content extracted from archives.

Do not inject filenames into HTML using unsafe APIs.

Do not interpret imported files as scripts.

Prevent or mitigate archive path traversal even though extraction is primarily in memory.

Apply reasonable safety limits to archive and decoder workloads.

---

# 31. Privacy Rules

Do not add analytics, telemetry, logging services, crash-reporting uploads, or third-party media services without explicit approval.

If logging exists during development, it must not transmit user media.

Never transmit:

```text
image bytes
archive bytes
archive passwords
decoded frames
user-selected filenames
```

to remote services unless a future feature explicitly requires and discloses it.

---

# 32. Password Handling

Future archive passwords must remain local.

Do not:

```text
persist passwords unnecessarily
send passwords to telemetry
send passwords to servers
log passwords
```

Wrong password, unsupported encryption, and corrupted archive should remain distinct states where technically possible.

---

# 33. Error Handling

Use stable application-level error categories.

Do not leak large raw exceptions into the visible UI.

User-facing messages should be understandable.

Developer-facing diagnostics may include technical details.

Expected categories may include:

```text
UNSUPPORTED_FORMAT
CORRUPTED_FILE
DECODE_FAILED
ARCHIVE_CORRUPTED
ARCHIVE_ENCRYPTED
ARCHIVE_UNSUPPORTED
OUT_OF_MEMORY
WORKER_FAILED
WASM_UNAVAILABLE
FILE_READ_FAILED
```

Extend the error model when necessary rather than throwing arbitrary string messages throughout the application.

---

# 34. Performance Philosophy

Optimize based on measured bottlenecks.

Priority:

```text
correctness
architecture
memory safety
compatibility
responsiveness
performance tuning
micro-optimization
```

Do not introduce complex optimization before establishing a correct baseline.

However, obvious memory-unsafe architectures are not acceptable even as a first implementation.

---

# 35. Browser Compatibility

Do not require users to install:

```text
Chrome
Edge
Firefox
```

AniView should target any sufficiently modern browser providing the capabilities required by the implementation.

Prefer capability detection over browser-name detection.

Avoid:

```ts
if (browser === "Chrome") { ... }
```

unless fixing a verified browser-specific defect with no better alternative.

---

# 36. Feature Detection

Check required capabilities where necessary.

Examples may include:

```text
WebAssembly
Web Worker
Canvas
ImageBitmap
relevant File APIs
```

If a required capability is unavailable, fail gracefully with a clear compatibility message.

Do not allow obscure runtime exceptions to become the compatibility experience.

---

# 37. PWA

PWA support is optional enhancement for V0.1.

Do not allow PWA implementation to delay or destabilize the core viewer.

AniView must remain fully usable as a normal webpage.

If PWA is added, asset and service-worker paths must remain GitHub Pages compatible.

---

# 38. Future Conversion Compatibility

Do not implement conversion during early V0.1 work unless explicitly requested.

However, avoid architecture that would force playback and conversion to use separate decoders.

Preferred future model:

```text
VirtualFile
    ↓
Decoder
    ↓
AnimationSequence
    ├──→ Player
    └──→ Converter
```

The normalized media model should remain reusable.

---

# 39. Future Video Work

Do not prematurely select or install:

```text
FFmpeg WASM
WebCodecs-only architecture
specific video encoders
specific muxers
```

until the video-conversion milestone is reached.

At that stage, evaluate:

```text
browser support
mobile performance
memory use
bundle size
GitHub Pages constraints
cross-origin isolation requirements
licensing
```

The current viewer should not be distorted around assumptions about a future video stack.

---

# 40. Documentation

When introducing a non-obvious architectural decision, document it.

Use code comments for:

```text
why this unusual implementation exists
browser-specific behavior
codec-specific edge cases
memory ownership rules
worker transfer semantics
```

Do not write comments that merely restate the code.

Important project-wide decisions belong in documentation rather than hidden in one implementation file.

---

# 41. README Responsibilities

`README.md` is intended for repository visitors and future users.

It may eventually contain:

```text
what AniView does
supported formats
live GitHub Pages link
privacy statement
development setup
build commands
browser requirements
project status
```

Do not turn README into the architecture specification.

Architecture belongs primarily in:

```text
PLAN.md
```

Development rules belong primarily in:

```text
AGENTS.md
```

---

# 42. PLAN.md Modification Rule

Do not modify `PLAN.md` as a side effect of ordinary implementation work.

If implementation reveals that the plan is technically incorrect or impractical:

1. document the issue;
2. explain the evidence;
3. propose a plan change;
4. make the plan change only when explicitly approved or when the user specifically requested architectural documentation updates.

Do not silently rewrite project direction to match the current code.

The code should normally follow the plan, not the reverse.

---

# 43. AGENTS.md Modification Rule

Do not modify this file merely to bypass an inconvenient instruction.

Changes to `AGENTS.md` should correspond to intentional changes in the development process or architecture governance.

---

# 44. Refactoring

Refactoring is encouraged when it improves:

```text
clarity
testability
separation of concerns
resource ownership
architecture consistency
```

Do not perform broad unrelated refactors during a narrow feature task.

Keep task scope controlled.

Before replacing a working subsystem, establish what problem the replacement solves.

---

# 45. Temporary Prototypes

A prototype may temporarily violate ideal architecture only when:

- explicitly identified as a prototype;
- isolated from production architecture;
- used to answer a concrete technical question;
- not silently promoted into the final implementation.

If a prototype proves successful, integrate it properly before calling the feature complete.

---

# 46. Avoid Premature Complexity

Do not add abstractions merely because they may become useful someday.

Create abstractions when they protect a known boundary such as:

```text
file source
codec
archive
player
renderer
worker
```

Avoid speculative patterns and excessive indirection.

AniView should remain understandable.

---

# 47. Implementation Workflow

For each substantial task:

## Step 1 — Understand

Identify:

```text
requested behavior
affected architecture
relevant PLAN.md sections
existing implementation
```

## Step 2 — Inspect

Inspect relevant source files before editing.

Do not overwrite working implementations based on assumptions.

## Step 3 — Design

Choose the smallest implementation consistent with AniView architecture.

## Step 4 — Implement

Keep changes localized and typed.

## Step 5 — Validate

Run relevant:

```text
tests
lint
type checks
production build
```

## Step 6 — Review

Check:

```text
memory behavior
main-thread blocking
GitHub Pages paths
mobile impact
error handling
privacy
```

## Step 7 — Report

State clearly:

```text
what changed
why
validation performed
remaining limitations
recommended next step
```

---

# 48. Do Not Hide Failures

If implementation is incomplete, say so.

If a dependency does not support a required behavior, say so.

If a browser limitation blocks the desired implementation, document it.

Do not replace a requested feature with a superficially similar implementation and describe it as complete.

---

# 49. Milestone Discipline

Use the milestone order in `PLAN.md` as the default project sequence.

In particular:

```text
Foundation
    ↓
Single-format vertical slice
    ↓
Core animated formats
    ↓
Input experience
    ↓
ZIP
    ↓
Viewer UX
    ↓
Stability
    ↓
Release
```

Do not implement later roadmap features merely because they are interesting.

A later task may override this order explicitly.

---

# 50. Definition of Done

A feature is not complete merely because it renders once in local development.

Where relevant, completion means:

```text
implemented
typed
tested
build passes
does not violate architecture
does not break GitHub Pages deployment
reasonable mobile behavior
errors handled
resources cleaned up
documentation updated when necessary
```

If one of these is knowingly missing, report it as a limitation.

---

# 51. Final Decision Principle

When choosing between:

```text
a quick implementation that creates structural debt
```

and:

```text
a slightly slower implementation that preserves AniView's architecture
```

prefer the architecture-preserving solution.

But also avoid unnecessary overengineering.

The intended balance is:

> **Build the smallest correct implementation that preserves the boundaries required for AniView's future development.**