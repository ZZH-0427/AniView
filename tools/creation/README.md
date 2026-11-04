# Static-image animation Creator acceptance tools

These tools exercise the V0.3 multi-format Creator on the feature branch. They do
not deploy anything, create a release or modify the V0.2 production website.
Use the existing installed Node.js 24/npm and installed Edge; no browser is
downloaded. `BROWSER_PATH` can select another already-installed browser.

## Desktop product validation

Build the ordinary application, then run the installed-browser acceptance:

```powershell
npm run build
node tools/creation/run-browser.mjs
```

The runner starts a loopback server and a fresh Edge profile, generates original
static sources, and drives the visible product controls. It checks file input,
append/duplicates/reorder/remove/drop, settings, Worker progress, Cancel→rerun,
existing-Viewer preview, repeated/new-result browser downloads with distinct
filenames and preserved earlier bytes, URL lifecycle, limits, recovery,
320/360/390/768/1280 layouts and ownership cleanup. It closes its own server/browser.

The three-target checks cover direct GIF/WebP/APNG output, full prepared-pixel
comparison across every source frame (including merged WebP timelines), actual
saved files reopened in unchanged decoder Workers, retaining the old result when
switching target, live EN/ZH, and cancel/rerun in preparation, encoding and output
checking. The GIF parity oracle uses the archived V0.2 RC production Worker in
`.tools/rc-audit/site-a1876c6/assets/encoder.worker-4zFLx0Cr.js`, verified against
the committed V0.2 build manifest. Set `ANIVIEW_V02_SITE` to an equivalent archive
root. Missing/mismatched references fail clearly; no historical binary is committed.

Product workloads include 200×320×240, 10×1024², two/three 2048² frames and a
controlled rejection of four 2048² frames before quantization. Generated JPEG,
PNG and WebP come from the installed native Canvas encoder. Original flat art,
gradient and procedural high-color scenes are also re-encoded through the UI;
source/output contact sheets permit manual quality comparison.

All original/generated source images, ZIP delivery packages, actual animation downloads,
screenshots, browser profiles and reports remain ignored under `.tools/creation/`.
The generator source is reproducible; no downloaded artwork or large binary
fixture is committed. Browser-native encoded files may differ across engines.
These are individual observations, not a controlled cross-device speed ranking.

The main report is `.tools/creation/report.json`. `totalMs` comes from the real
encoding job and includes preparation; fixture generation and test decode-back
are separate. Bitmap/RGBA counts and buffer capacity are ownership proxies, not
OS RSS or GPU measurements. The legacy GIF contact sheets cover the first frame;
`multiFormat.quality` checks all prepared pixels in every covered source frame
and records its exact scope. Neither is a temporal flicker metric. Worker native-bitmap and
transfer probes provide separate resource evidence.

## Local Android product validation

Current M10A2 acceptance is specified in
`docs/milestones/milestone-m10a2-android-validation.md`. It requires fresh Edge and
Quark results for all three formats, true semi-transparent PNG edges, cancellation,
repeat downloads and post-Home cleanup. Use a frozen build via an HTTPS tunnel or
approved USB localhost forwarding for a secure context, with no HMR. LAN HTTP
examples below are useful for connectivity checks, not the formal secure-context gate.

The desktop runner also prepares two original static-image bundles. To regenerate
them without the product UI run:

```powershell
node tools/creation/generate-fixtures.mjs
```

After `npm run build`, start the dedicated local preview in normal PowerShell:

```powershell
node tools/creation/preview.mjs --host 0.0.0.0 --port 4198
```

Connect the phone and computer to the same trusted Wi-Fi. Substitute the current
computer IPv4 address in these local URLs:

```text
http://COMPUTER_IP:4198/AniView/?debug=1
http://COMPUTER_IP:4198/AniView/validation/creation/
```

The second page supplies ZIP downloads containing **40×320×240 PNGs**, **10×1024²
PNGs** and a mixed JPEG/PNG/WebP set. Download and extract these with the phone's
Files/archive app, then choose the extracted static images in **Create animation**.
ZIP here is only a convenient fixture-delivery container: the Creator itself
does not accept ZIP sources or perform extraction.

In Android Edge and Quark:

1. Enter Create animation, choose the mixed static sources, add another image, move
   rows up/down and remove one. Check the duration and finite/forever loop controls.
2. Generate; confirm progress, metadata, Preview via AniView playback and return
   without losing the creation project. Use **Download GIF** and confirm a normal
   save/download flow. Download the same result twice and a new result once;
   confirm distinct names and that earlier saved GIFs remain available. If
   convenient, reopen the saved GIF in the ordinary Viewer. Gallery visibility
   depends on the browser/device; inspect browser downloads or Files separately
   from whether the image appears in the gallery.
3. Extract/select the 40 small images, run Generate→Cancel→Generate again. Then
   run the ten larger images only if the small workload succeeds. Stop escalation
   after a tab reload/crash; do not repeat a dangerous pressure case.
4. Expand **Creation diagnostics → Raw JSON** and copy the completed result for
   each workload. Report UI response, any reload/crash/memory-pressure symptoms,
   and actual download behavior separately for each browser.

Old spike results do not replace these new product-flow checks. The temporary
preview serves only the built app and these local fixtures; it accepts no uploads.
Generated fixture directories are not part of `public/` or production `dist/`.
Stop the server with Ctrl+C after acceptance. If the page is unreachable, check
the current LAN address/listener rather than changing production hosting.
