# AniView Development Plan

> **Project:** AniView  
> **Type:** Pure client-side web application  
> **Primary purpose:** Cross-platform local viewer for animated image formats  
> **Initial target:** Android mobile browsers and desktop browsers  
> **Core formats:** GIF, Animated WebP, APNG  
> **Architecture direction:** Local decoding + Web Worker + Canvas + WebAssembly where appropriate  
> **Backend:** None  
> **Upload:** None

---

# 1. Project Vision

AniView is a pure web application designed to allow users to open and correctly play animated image files on devices or browsers where the system gallery or built-in image viewer may not properly support formats such as:

- Animated WebP
- APNG
- GIF

The application must not depend on the browser's native animated image playback capability as its primary playback mechanism.

Instead, AniView should provide its own decoding and playback pipeline so that supported formats behave consistently across compatible browsers.

The core product principle is:

> **The browser provides the runtime environment; AniView controls decoding, playback, rendering, and media behavior.**

AniView should remain fully client-side wherever technically practical.

User media must not be uploaded to a server for normal viewing or conversion.

---

# 2. Long-Term Product Direction

AniView should eventually become a lightweight browser-based animated media toolkit rather than only an image viewer.

The long-term product should support three major workflows:

```text
View
Convert
Export
```

The initial version focuses almost entirely on **View**.

Future versions may support:

```text
GIF
WebP
APNG
 ↕
Video
```

At minimum, future conversion should support:

```text
Animated Image → Video
Video → Animated Image
```

for GIF, Animated WebP, and APNG.

Direct conversion between GIF, WebP, and APNG is desirable but is not mandatory if it introduces disproportionate complexity.

Converted files must eventually be downloadable directly from the browser.

---

# 3. V0.1 Objective

AniView V0.1 should prove one complete, reliable workflow:

```text
Acquire Local File
        ↓
Identify Format
        ↓
Decode Locally
        ↓
Produce Animation Frames
        ↓
Schedule Playback
        ↓
Render to Canvas
        ↓
Allow Basic User Interaction
```

V0.1 should prioritize:

- correctness;
- browser compatibility;
- mobile usability;
- memory safety;
- modular architecture;
- future extensibility.

V0.1 should **not** prioritize large numbers of features.

---

# 4. V0.1 Required Features

## 4.1 Supported media

V0.1 must support:

- Animated WebP;
- APNG;
- GIF;
- static WebP;
- static PNG;
- JPEG/JPG.

For animated formats, AniView should use its own decoding/playback pipeline wherever possible.

Static images may use simpler browser-native decoding where appropriate.

---

## 4.2 Mobile input

Mobile UI should prioritize ordinary users who are more familiar with the gallery than the Android filesystem.

The primary mobile entry should therefore be:

```text
From Gallery
```

Secondary entries should be:

```text
From Files
Open Archive
```

The application must not assume that every user understands Android paths such as:

```text
/storage/emulated/0/
Download/
DCIM/
Pictures/
Android/data/
```

However, file-system access must remain available for users whose files are not present in the gallery.

Therefore:

> Gallery is the preferred mobile entry, not the exclusive mobile entry.

---

# 5. Desktop Input

Desktop usage should follow normal desktop file-management conventions.

Primary desktop interactions:

```text
Open File
Open Archive
Drag & Drop
```

Multiple-file selection should be supported.

Future enhancement may include:

```text
Open Folder
```

but directory APIs must not become a mandatory dependency for the application.

Desktop and mobile should share the same internal media-processing architecture.

Only the input UI should differ.

---

# 6. Archive Support

ZIP support is part of the intended V0.1 architecture.

A user should eventually be able to perform:

```text
images.zip
    ↓
AniView
    ↓
Read archive locally
    ↓
Discover supported images
    ↓
Browse images without manual extraction
```

Supported media inside a ZIP should be exposed to the rest of the application through the same abstraction used for ordinary files.

The decoding layer must not care whether a media file originated from:

```text
Gallery
Filesystem
Drag & Drop
ZIP Archive
```

Password-protected archives must be considered in the architecture.

Full encrypted ZIP support is not mandatory for the first implementation milestone, but archive APIs must distinguish at least:

```text
OPEN
ENCRYPTED
CORRUPTED
UNSUPPORTED
```

The codebase must not make the assumption that all ZIP files are unencrypted.

Future versions may add a password-entry UI and support suitable encryption formats.

RAR and 7z are explicitly outside the initial implementation scope unless later requirements justify them.

---

# 7. Core Architectural Principle

The application should be divided into clearly separated layers.

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

No layer should unnecessarily depend on the implementation details of another layer.

---

# 8. Input Layer

All file sources should ultimately produce a common file abstraction.

Recommended conceptual interface:

```ts
interface VirtualFile {
    name: string;
    size: number;
    mimeType?: string;

    source:
        | "gallery"
        | "file"
        | "archive"
        | "drag-drop";

    read(): Promise<ArrayBuffer>;
}
```

The exact implementation may evolve, but the architectural principle must remain:

> Downstream decoders operate on a common file abstraction rather than directly on browser input elements or archive APIs.

Examples:

```text
Android Gallery
       ↓
VirtualFile

Android Downloads
       ↓
VirtualFile

Windows File Picker
       ↓
VirtualFile

ZIP Entry
       ↓
VirtualFile
```

---

# 9. Format Detection

Format identification must not rely exclusively on filename extensions.

The application should inspect file signatures or container structures.

Examples:

```text
WebP
RIFF .... WEBP
```

```text
PNG / APNG
89 50 4E 47 0D 0A 1A 0A
```

```text
GIF
GIF87a
GIF89a
```

APNG detection should inspect the PNG structure for animation-specific chunks such as:

```text
acTL
```

AniView should still preserve the original filename and extension for presentation purposes, but decoding decisions should be based primarily on actual file content.

---

# 10. Decoder Architecture

All animation decoders should implement a common conceptual contract.

For example:

```ts
interface AnimationDecoder {
    canDecode(file: VirtualFile): Promise<boolean>;

    decode(
        file: VirtualFile,
        options?: DecodeOptions
    ): Promise<AnimationSequence>;
}
```

The exact API does not need to match this example literally.

The important requirement is that WebP, APNG, and GIF eventually expose a consistent animation representation to the player.

---

# 11. Animated WebP

Animated WebP should not be implemented by writing a complete WebP codec from scratch.

Preferred direction:

```text
libwebp
   ↓
WebAssembly
   ↓
AniView WebP Adapter
   ↓
Animation Model
```

The application should own:

- container integration;
- worker communication;
- frame scheduling;
- rendering;
- caching;
- UI behavior.

The mature codec should handle low-level WebP decoding.

Do not reimplement VP8 or VP8L decoding unless there is an exceptionally strong technical reason.

---

# 12. APNG

APNG support must correctly handle animation-specific semantics.

Relevant concepts include:

```text
acTL
fcTL
fdAT
frame delay
frame offset
blend operation
dispose operation
loop count
```

Frame composition must correctly respect APNG blending and disposal behavior.

Incorrect disposal handling may cause visual artifacts such as persistent previous-frame content or transparency errors.

The implementation may use a mature parser/decoder where appropriate.

The goal is correctness, not unnecessarily rewriting standardized compression algorithms.

---

# 13. GIF

GIF should pass through the same unified animation pipeline.

The decoder must correctly expose:

- frame dimensions;
- frame timing;
- loop behavior;
- transparency;
- disposal behavior.

GIF-specific implementation details must not leak into the generic player.

---

# 14. Animation Model

Decoders should normalize media into a shared internal representation.

Conceptually:

```ts
interface AnimationSequence {
    width: number;
    height: number;

    frameCount?: number;
    loopCount?: number;

    frames: AsyncIterable<DecodedFrame>;
}
```

Possible frame model:

```ts
interface DecodedFrame {
    duration: number;

    width: number;
    height: number;

    bitmap: ImageBitmap | otherRenderableFrame;
}
```

The exact representation may change during implementation.

However, the application should avoid designing the player around codec-specific frame objects.

---

# 15. Do Not Decode Everything Upfront

This is a critical architectural requirement.

AniView must not assume that every animation can be fully decoded and permanently stored in memory.

For example:

```text
2048 × 2048
RGBA
≈ 16 MB per full frame
```

A 200-frame animation could theoretically require several gigabytes of decoded memory.

Therefore, avoid architecture such as:

```ts
const frames = await decodeAllFrames(file);
```

followed by retaining every uncompressed frame.

Instead, use:

```text
Decoder
   ↓
Sliding Frame Cache
```

Conceptually:

```text
Frame 34
Frame 35
[Frame 36]
Frame 37
Frame 38
Frame 39
```

When playback advances:

```text
release old frame
decode/preload future frame
```

The exact cache policy should be determined experimentally.

Memory stability on mobile devices is more important than aggressive preloading.

---

# 16. Web Workers

Media decoding should be designed to operate outside the main UI thread where practical.

Recommended architecture:

```text
Main Thread
│
├── React UI
├── User Gestures
├── Canvas Rendering
│
└──── postMessage ────┐
                      ↓
                Decoder Worker
                      │
             WebP / APNG / GIF
                      │
                  Frame Data
                      │
└──── postMessage ◄───┘
```

Large-file decoding must not freeze:

- navigation;
- buttons;
- zoom;
- panning;
- file switching.

Transferable objects should be considered when they reduce unnecessary copies.

---

# 17. Renderer

Canvas should be the primary animation rendering surface.

Conceptually:

```html
<canvas id="viewer"></canvas>
```

Benefits:

- consistent behavior across formats;
- controlled frame timing;
- pause support;
- future frame stepping;
- future playback speed control;
- future exporting;
- zoom and pan;
- consistent rendering pipeline.

The renderer should not contain codec-specific logic.

---

# 18. Player Engine

The player should operate on the normalized animation model.

Initial internal API may expose:

```ts
play()
pause()
reset()
nextFrame()
previousFrame()
```

Not every internal feature needs to appear in the first UI.

The player is responsible for:

- animation timing;
- looping;
- current frame;
- interaction with frame cache;
- renderer updates.

Frame scheduling should account for actual frame durations rather than assuming a fixed FPS.

---

# 19. V0.1 User Controls

The first public player UI should remain intentionally simple.

Required:

```text
Play / Pause
Reset / Replay
Zoom
Pan
Previous File
Next File
```

Useful metadata:

```text
Filename
Format
Dimensions
File Size
Current File Index
```

Features that may exist internally but do not need UI exposure in V0.1:

```text
Frame-by-frame stepping
Precise timeline seeking
Playback-speed control
Frame export
FPS inspection
Advanced metadata
```

These can be introduced later without redesigning the player architecture.

---

# 20. Multiple Files

Users should be able to open multiple compatible files.

The application should create a temporary local viewing session:

```text
01.webp
02.webp
03.apng
04.gif
```

Users should be able to move between files without re-opening the system picker.

On mobile, swipe navigation may be added where it does not conflict with image pan gestures.

On desktop, a file list or sidebar may be used where screen size permits.

---

# 21. Responsive UI

AniView is one web application, not separate mobile and desktop applications.

The interface should adapt to device class.

## Mobile

Prioritize:

```text
Gallery
Files
Archive
Touch
Large controls
Immersive viewer
```

## Desktop

Prioritize:

```text
File picker
Drag & drop
Archive
Mouse interaction
Larger information layout
Optional file sidebar
```

Shared underlying components should be reused wherever practical.

Avoid maintaining two unrelated application implementations.

---

# 22. Proposed Pages

V0.1 should remain small.

Two primary application states/pages are sufficient.

## Home

Mobile concept:

```text
AniView

[ From Gallery ]

From Files
Open Archive

GIF · WebP · APNG

All files are processed locally.
```

Desktop concept:

```text
AniView

[ Open File ]

Open Archive

or drag files here

GIF · WebP · APNG
```

## Viewer

Concept:

```text
←    animation.webp      Info

┌─────────────────────────┐
│                         │
│                         │
│         Canvas          │
│                         │
│                         │
└─────────────────────────┘

       Play / Pause

         2 / 12

Previous             Next
```

Desktop may add a file sidebar.

---

# 23. Suggested Technology Stack

Preferred baseline:

```text
Vite
TypeScript
React
Web Worker
Canvas 2D
WebAssembly
```

React is justified because the long-term application will contain multiple stateful subsystems:

- media selection;
- archive browsing;
- media list;
- viewer;
- decoder state;
- error state;
- loading state;
- future converter;
- future export tasks.

Do not introduce a heavy state-management framework unless actual application complexity requires it.

Start with local React state and small focused stores/services.

---

# 24. Suggested Source Structure

A possible starting structure:

```text
src/
│
├── app/
│
├── pages/
│   ├── Home/
│   └── Viewer/
│
├── components/
│   ├── GalleryPicker/
│   ├── FilePicker/
│   ├── DropZone/
│   ├── ArchivePicker/
│   ├── FileList/
│   ├── PlayerControls/
│   └── FileInfo/
│
├── input/
│   ├── virtual-file.ts
│   ├── gallery-input.ts
│   ├── file-input.ts
│   └── drag-drop-input.ts
│
├── archive/
│   ├── archive-reader.ts
│   └── zip-reader.ts
│
├── formats/
│   ├── detector.ts
│   ├── webp/
│   ├── apng/
│   └── gif/
│
├── media/
│   ├── animation.ts
│   ├── frame.ts
│   └── metadata.ts
│
├── player/
│   ├── player.ts
│   ├── scheduler.ts
│   └── frame-cache.ts
│
├── renderer/
│   └── canvas-renderer.ts
│
├── workers/
│   └── decoder.worker.ts
│
└── utils/
```

This is a guideline rather than an immutable structure.

Refactoring is allowed when implementation experience suggests a cleaner design.

---

# 25. Error Handling

Errors must be explicit and categorized.

Possible states include:

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

Do not expose raw internal exceptions directly to ordinary users.

The application should provide understandable messages while preserving technical error information for debugging.

---

# 26. Privacy Requirements

AniView is intended to operate locally.

Normal viewing must follow:

```text
Local File
    ↓
Browser Memory
    ↓
Decoder
    ↓
Canvas
```

and not:

```text
Local File
    ↓
Remote Server
```

No media upload should be introduced without an explicit future product decision.

Telemetry, if ever added, must not include user media content.

The UI should clearly communicate:

> Files are processed locally in your browser.

---

# 27. Security Considerations

Treat all imported files as untrusted input.

This applies especially to:

- malformed image files;
- malicious ZIP archives;
- decompression bombs;
- oversized media;
- corrupted frame metadata.

Archive handling should enforce reasonable limits such as:

- maximum number of entries;
- maximum decompressed size;
- protection against path traversal;
- protection against extreme compression ratios.

Decoder failure should not crash the entire application.

---

# 28. Performance Requirements

AniView should prioritize mobile resource constraints.

Important metrics include:

```text
time to first visible frame
UI responsiveness during decode
peak memory consumption
frame scheduling stability
archive extraction memory usage
large-file behavior
```

Do not optimize only for desktop development machines.

Performance testing must include representative Android devices or constrained browser environments.

---

# 29. Browser Philosophy

AniView should not depend on users installing Chrome, Edge, or Firefox.

The target is:

> Any sufficiently modern browser capable of the required JavaScript, Canvas, Worker, and WebAssembly functionality.

Do not hardcode behavior using browser-name detection unless absolutely necessary.

Prefer capability detection.

Where a required capability does not exist, show a clear compatibility message.

---

# 30. Repository and Deployment

AniView uses GitHub as the canonical source repository and GitHub Pages
as the production hosting platform for the initial product lifecycle.

The expected workflow is:

GitHub Repository
        ↓
main branch
        ↓
GitHub Actions
        ↓
npm ci
        ↓
test / validation
        ↓
npm run build
        ↓
dist/
        ↓
GitHub Pages

The `dist/` directory is a build artifact and should not normally be
committed to the source branch.

Deployment should be automated through GitHub Actions.

The application must remain compatible with static hosting and must not
require a backend server for normal operation.

## GitHub Pages Path Requirements

The default GitHub Pages deployment is expected to use a repository
subpath such as:

https://<username>.github.io/AniView/

Therefore, Vite and all runtime asset loading must respect the configured
base path.

Do not assume that the application is hosted at `/`.

This applies particularly to:

- JavaScript bundles;
- CSS;
- WebAssembly modules;
- Web Workers;
- icons;
- manifests;
- other static assets.

Avoid hard-coded absolute asset paths such as:

/decoder.wasm
/decoder.worker.js

Resource resolution must remain compatible with the Vite base path.

## Routing

V0.1 should avoid introducing History API based routing unless it is
actually required.

For the initial Home → Viewer workflow, application state is preferred
over URL-based routing.

If routing becomes necessary later, the implementation must account for
GitHub Pages static-hosting limitations, for example through a hash-based
routing strategy or another explicitly designed fallback mechanism.

## Future Hosting Constraints

GitHub Pages is the required hosting platform for V0.1.

Future media-conversion features may introduce browser technologies with
additional HTTP header requirements, particularly high-performance
multithreaded WASM implementations.

If such a requirement appears, hosting compatibility should be
re-evaluated at that stage.

This must not block or complicate the V0.1 viewer architecture.

Even if production hosting changes in a future version, the GitHub
repository should remain the canonical source of the project.

No application server should be required for normal operation.

The final provider can be selected later.

---

# 31. PWA

PWA support is desirable but should not complicate the core media pipeline.

Potential benefits:

- install-like home-screen access;
- cached application shell;
- limited offline use;
- more application-like presentation.

PWA should be treated as progressive enhancement.

AniView must still function as a normal website.

---

# 32. Future Conversion Architecture

V0.1 should not implement the full converter, but its architecture must avoid blocking one.

Future desired flow:

```text
VirtualFile
    ↓
Decoder
    ↓
AnimationSequence
    ↓
┌───────────────┐
│               │
Player       Converter
                │
          Encoder / Muxer
                │
                ↓
            Blob / File
                │
                ↓
             Download
```

The future converter should reuse the same decoding layer as the viewer.

Do not create separate decoding implementations for playback and conversion unless unavoidable.

---

# 33. Future Video Support

Later releases may add video input and output.

Minimum long-term target:

```text
GIF  ↔
WebP ↔  Video
APNG ↔
```

Examples:

```text
Animated WebP → MP4/WebM
APNG → MP4/WebM
GIF → MP4/WebM
```

and:

```text
Video → Animated WebP
Video → APNG
Video → GIF
```

Actual supported video containers/codecs should be selected after technical evaluation.

Do not prematurely commit the architecture to FFmpeg, WebCodecs, or a particular WASM implementation before evaluating browser coverage, package size, performance, and licensing.

---

# 34. Future Download Support

Generated media must eventually be exportable from the browser.

Conceptually:

```text
Converted Media
      ↓
Blob
      ↓
Object URL
      ↓
Download
```

Filename generation should preserve the original basename where appropriate.

For example:

```text
animation.webp
      ↓
animation.mp4
```

Download/export logic should be implemented separately from encoding logic.

---

# 35. Future Password-Protected Archives

Archive APIs should allow future behavior such as:

```text
Open ZIP
   ↓
Encrypted Entry Detected
   ↓
Request Password
   ↓
Decrypt Locally
   ↓
VirtualFile[]
```

Passwords must remain local and must never be sent to a server.

Wrong-password and unsupported-encryption states should be distinguishable.

This is a future requirement and should not delay the initial playback pipeline.

---

# 36. Development Milestones

## Milestone 0 — Foundation

Establish:

```text
Vite
React
TypeScript
Project structure
Linting
Testing baseline
Responsive shell
Git repository initialization
GitHub Pages compatible Vite base configuration
GitHub Actions deployment workflow
```

Define core interfaces:

```text
VirtualFile
FormatDetector
Decoder
AnimationSequence
DecodedFrame
Player
Renderer
```

Do not begin with extensive UI polish.

---

## Milestone 1 — Single-Format Vertical Slice

Choose one animated format, preferably Animated WebP.

Complete the entire vertical pipeline:

```text
File
 ↓
VirtualFile
 ↓
FormatDetector
 ↓
Worker
 ↓
Decoder
 ↓
Decoded Frames
 ↓
Frame Cache
 ↓
Player
 ↓
Canvas
```

The purpose of this milestone is architectural validation.

Do not add every input type before this pipeline works.

---

## Milestone 2 — Core Format Support

Add:

```text
APNG
GIF
```

All three formats must converge into the same media/player interfaces.

Validate:

- timing;
- looping;
- transparency;
- disposal;
- blend behavior.

---

## Milestone 3 — Input Experience

Implement:

### Mobile

```text
Gallery
Files
Archive
```

### Desktop

```text
File Picker
Multiple Selection
Drag & Drop
Archive
```

All sources produce `VirtualFile` objects.

---

## Milestone 4 — ZIP

Implement:

```text
ZIP → Archive Reader → VirtualFile[]
```

Support browsing supported image files inside the archive.

Detect encrypted archives even if password-based extraction is deferred.

Implement archive safety limits.

---

## Milestone 5 — Viewer UX

Implement:

- play/pause;
- replay;
- zoom;
- pan;
- previous/next file;
- metadata;
- responsive layout;
- loading indicators;
- readable error messages.

---

## Milestone 6 — Stability

Test:

- large images;
- many frames;
- many files;
- corrupted files;
- wrong extensions;
- ZIP with many entries;
- encrypted ZIP;
- malformed ZIP;
- low-memory conditions;
- worker termination;
- decoder errors.

Measure memory usage and UI responsiveness.

---

## Milestone 7 — Release Preparation

Complete:

- UI polish;
- accessibility review;
- mobile browser testing;
- desktop browser testing;
- static production build;
- optional PWA shell;
- successful automated deployment to GitHub Pages
production verification under the /AniView/ base path;
- documentation.

This becomes:

```text
AniView V0.1
```

---

# 37. Explicit V0.1 Non-Goals

Unless required to make the architecture functional, do not expand V0.1 into:

- video transcoding;
- animated-image conversion;
- frame editing;
- advanced timeline editing;
- cloud storage;
- user accounts;
- server-side processing;
- synchronization;
- social features;
- media library management;
- RAR support;
- 7z support;
- complex image editing.

These belong to future versions.

Avoid scope creep.

---

# 38. Coding Principles for Codex

When implementing AniView, follow these priorities in order:

```text
Correctness
    ↓
Architecture
    ↓
Memory Safety
    ↓
Compatibility
    ↓
User Experience
    ↓
Performance Optimization
    ↓
Additional Features
```

Do not sacrifice architecture merely to demonstrate a feature quickly.

Prefer:

```text
small modules
explicit interfaces
clear ownership
testable components
predictable state
```

over tightly coupled implementations.

---

# 39. Important Invariants

The following decisions should not be changed casually.

### Invariant 1

AniView is a **pure client-side web application**.

### Invariant 2

Normal user media is **not uploaded to a backend**.

### Invariant 3

Animated WebP/APNG/GIF playback must not fundamentally depend on browser-native `<img>` animation support.

### Invariant 4

Different file sources must converge into a unified abstraction such as `VirtualFile`.

### Invariant 5

Different animated formats must converge into a unified animation/player abstraction.

### Invariant 6

Large animations must not be designed around retaining every uncompressed frame indefinitely.

### Invariant 7

Heavy decoding work should not block the main UI thread.

### Invariant 8

Mobile input prioritizes the gallery but retains file and archive access.

### Invariant 9

Desktop input prioritizes file selection and drag-and-drop.

### Invariant 10

V0.1 architecture must leave a clean path toward future media conversion and local download/export.

### Invariant 11

GitHub is the canonical source repository, and AniView V0.1 must remain
deployable through GitHub Actions to GitHub Pages without requiring a
backend service.

---

# 40. Decision Rule When Implementation Conflicts Arise

When Codex encounters a choice between:

```text
A. faster temporary implementation
B. implementation consistent with this architecture
```

prefer **B**, unless the temporary implementation is explicitly isolated as a prototype and does not create architectural debt.

When requirements are ambiguous, prefer solutions that preserve:

- local processing;
- decoder independence;
- player independence;
- low mobile memory usage;
- cross-browser compatibility;
- future conversion support.

Do not silently redesign major architectural decisions.

Major deviations should first be documented and justified.

---

# 41. Expected V0.1 End State

A successful V0.1 should allow the following user experience.

### Android

```text
Open AniView
      ↓
From Gallery / Files / ZIP
      ↓
Select Animated WebP / APNG / GIF
      ↓
AniView decodes locally
      ↓
Animation plays correctly
      ↓
Pause / Zoom / Pan / Switch File
```

### Desktop

```text
Open AniView
      ↓
Select files / drag files / open ZIP
      ↓
AniView decodes locally
      ↓
Animation plays correctly
      ↓
Browse multiple files
```

No server upload should be required.

---

# 42. Post-V0.1 Roadmap

A reasonable later roadmap is:

```text
V0.1
Reliable Animated Image Viewer
        ↓
V0.2
Password Archives + Advanced Player
        ↓
V0.3
Frame Inspection / Export
        ↓
V0.4
Animated Image → Video
        ↓
V0.5
Video → Animated Image
        ↓
V1.0
Unified Animated Media Toolkit
```

The exact version numbering may change.

The architectural direction should remain consistent.

---

# 43. Final Project Definition

AniView should be understood as:

> **A privacy-preserving, browser-based animated media viewer and future conversion toolkit that performs media decoding locally and provides consistent GIF, Animated WebP, and APNG behavior across mobile and desktop environments.**

The first development priority is not feature quantity.

The first priority is to create a reliable foundation:

```text
Input
→ VirtualFile
→ Decoder
→ Animation
→ Cache
→ Player
→ Canvas
```

Once this foundation is stable, archives, advanced playback, conversion, video processing, and downloadable exports can be added without rebuilding the application from scratch.