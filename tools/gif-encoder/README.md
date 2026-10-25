# Static images → GIF technical spike

This entry is isolated from AniView's ordinary application. It must not be
merged into production navigation or deployed over the v0.1.0 Pages release.

Use the installed Node.js 24 and `npm ci`. No browser or additional image tool is
downloaded. The harness uses an installed Edge on Windows, or the executable in
`BROWSER_PATH`.

## Desktop validation

```sh
node tools/gif-encoder/run-browser.mjs
```

The runner starts a temporary local Vite development server and the installed
browser, performs encoder and existing-decoder round trips, and opens a generated
GIF in the unmodified Viewer to exercise Play, frame stepping and looping. Both
processes close when the runner finishes. Generated GIFs, comparison PNGs,
browser profiles and the machine-readable report are ignored under
`.tools/gif-encoder/`.

Each comparison PNG has the original source on the left and the first GIF frame
on the right. Samples are generated from original Canvas primitives and a
deterministic pixel function: flat illustration with line art and skin-like
gradients; smooth gradients; and a high-color textured landscape. The landscape
is a photographic-style proxy, not a camera photograph. There is no downloaded
or copyrighted character artwork. The generation code is the fixture source;
large encoded inputs and output media are not committed.

RGB error measures compare opaque RGB channels after browser-native source
decoding. P95 is the percentile across individual channel absolute errors.
Source generation, round-trip checking and artifact generation occur outside
the timed encoding job. `decodeMs` includes the scan and encoding passes' native
decodes. The main-thread 16 ms heartbeat runs during the encoding operation.
Memory counters describe explicit ownership; they do not measure browser RSS,
GPU storage or a guarantee of immediate garbage collection.

## Android validation without production deployment

Start the local development server on the computer:

```sh
npm run dev -- --host 0.0.0.0
```

Connect the phone to the same trusted local network and replace `COMPUTER_IP`
with the computer's local IPv4 address:

```text
http://COMPUTER_IP:5173/AniView/experiments/gif-encoder/?debug=1
```

Allow the installed development server through the local firewall only if
needed. This is local test hosting, not a new AniView production deployment.
If the browser refuses a required Worker/OffscreenCanvas capability over the
local connection, record the error; do not disable browser security. A locally
trusted HTTPS server may be used instead.

In Android Edge and Quark, run **40 × 320×240** first, followed by
**10 × 1024²**. Copy each result JSON and report tab responsiveness, crashes,
reloads and any memory-pressure symptoms. Cancel is available during a job.
Stop increasing workload after a tab is killed or reloaded; do not repeat a
dangerous pressure case. Existing v0.1 Android acceptance does not substitute
for this new encoder test.

## Optional standalone engineering artifact

```sh
node node_modules/vite/bin/vite.js build --config tools/gif-encoder/vite.config.mjs
node tools/gif-encoder/run-browser.mjs --built
```

Output goes to ignored `.tools/gif-encoder-site/`, independently of `dist/`.
Host it locally beneath `/AniView/`; the entry remains
`/AniView/experiments/gif-encoder/`. Its dedicated module Worker and dependency
are separate bundles. The artifact includes third-party license notices. This
command neither publishes a site nor modifies GitHub Pages.
The second command exercises both Android-sized workloads in the separate built
artifact using installed desktop Edge. It verifies Vite module Worker/asset
loading beneath `/AniView/`; it does not count as a real Android test.
