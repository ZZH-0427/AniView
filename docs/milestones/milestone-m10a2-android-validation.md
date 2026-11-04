# M10A2 — fresh Android Creator acceptance

Date: 2026-11-04. **PENDING ANDROID CREATOR VALIDATION**.

Desktop implementation/checks passed. Edge and Quark rows below intentionally
remain pending until the user tests this new product build. Prior 8A/8B/8C/8D/M9
results are useful history, not evidence for this new three-format Creator.

## Build and access

Use the clean `feat/v0.3-animation-creator` desktop checkpoint recorded by the
frozen preview's `/AniView/release-candidate.json`. Version stays 0.2.0 because no
new release/version bump is authorized. This feature preview is not GitHub Pages.

The immutable app files live under ignored `.tools/m10a2/site-<commit>/`; the
read-only `tools/creation/preview.mjs --root <directory>` serves them plus original
generated fixtures. Use a verified HTTPS tunnel or approved USB localhost reverse
forwarding, secureContext true, HMR false. The concrete temporary URL is supplied
with the handoff, not hard-coded into production or treated as permanent hosting.
Keep the computer awake/online. Do not update the frozen build during acceptance.

## Original local samples

Relative to the supplied `/AniView/` base:

- `validation/creation/`: sample-download catalog.
- `validation/creation/mixed-static.zip`: four static originals, JPEG/PNG/WebP
  plus a PNG with a soft semi-transparent edge.
- `validation/creation/mobile-40.zip`: forty 320×240 static PNGs.
- `validation/creation/mobile-10-large.zip`: ten 1024² static PNGs, optional
  escalation only if the smaller task succeeds.
- `validation/creation/fixtures/quality-semi-edge/frame-001.png`: standalone
  semi-transparent source, also included in the mixed archive.

ZIPs only distribute fixtures: extract with Android Files, then select the static
images in Create animation. Creator does not ingest ZIPs. Moving extracted files
to Pictures can help a gallery-only system picker. All encoding remains local;
the preview server has no upload endpoint. No private source filename/media data
needs to be copied into the report.

## Edge — required new flow

1. Enter Create animation. Confirm default GIF, select at least three mixed static
   images including the semi-edge PNG. Add an image, move rows up/down, remove one;
   confirm order and shared duration/loop controls.
2. Generate GIF → Preview; test Play/Pause, Next/Previous Frame, Close. Source
   list/settings/result survive the preview return; Preview focus and Download
   should be easy to find. Download and reopen the GIF in ordinary Viewer once.
3. Switch to Animated WebP: the old GIF result/download should retain GIF identity
   until generation succeeds. Generate → Preview/Close → Download twice. Check
   both files exist with distinct names and reopen; inspect the soft alpha edge.
4. Switch to APNG, generate → Preview/Close → Download and reopen. It is an
   animated `.png`; inspect edge softness, transparency, order and dimensions.
5. Switch English/简体中文 while idle; sources/settings/result should remain and
   target text update without overlap or unexpected mixed language.
6. Return Home, close all media and inspect the cleanup data below.

## Quark — required new flow

1. Select mixed sources including the semi-edge PNG, check initial GIF selection
   and a basic GIF generation/Preview/Download.
2. Generate Animated WebP and APNG, Preview/Close, download and reopen both;
   inspect gradient/color/soft alpha rather than expecting GIF-quality edges.
3. Download one result twice; confirm distinct names, both files retained and
   readable. Gallery indexing is browser/device-controlled; inspect Downloads or
   Files independently from whether the system gallery indexes the image.
4. Select the 40 small sources. Generate → Cancel → Generate successfully, using
   WebP or APNG. Report response, source/settings retention and any reload/crash.
   Do not repeat a failed pressure workload. Ten larger sources are optional.
5. Switch EN/ZH once, then leave Creator and close all media before cleanup.

## Cleanup to report

Use `?debug=1`. After success, Creation diagnostics → Summary JSON shows input vs
actual output frames/target and ownership. The current result URL count 1 is
expected while retaining a result; source/encoder/inspection/validation Workers,
owned RGBA, ACK and source native objects should already be 0.

After returning Home, Resource diagnostics → Raw JSON includes
`lastCreationCleanup`. Copy that compact object and active runtime counts:

```text
activeWorkers / activeBitmaps / activeArchiveSessions = 0
activeSourceWorkers / activeEncoderWorkers = 0
activeValidationDecoderWorkers / activeInspectionWorkers = 0
activeBitmaps / activeCanvases / activeImageData = 0
ownedRgba / awaitingAck / activeObjectUrls / cleanupErrors = 0
peakCanonicalRgbaFrames = 1 for a completed generation
sourceSoftClosed: report actual value (normally true; false is bounded fallback)
```

Report separately per browser: required flow outcomes, which target was used for
cancel/rerun, repeat-save/reopen results, visible quality/layout issues, response,
any reload/crash, and numeric cleanup. No full codec matrix or extreme 200-frame
phone stress rerun is required. If a link fails, report the complete error and
stop using old test URLs; a tunnel outage is not a passing application test.

## Results register

| Browser | Three targets / Preview | Save/reopen / unique names | Semi-alpha | Cancel/rerun | EN/ZH / layout | Cleanup | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Android Edge | pending | pending | pending | not mandatory extra | pending | pending | PENDING |
| Android Quark | pending | pending | pending | pending | pending | pending | PENDING |

Only close M10A2 after both fresh results are actually supplied and reviewed.
