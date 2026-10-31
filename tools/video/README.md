# Animation → MP4 engineering spike

Node 24, npm, and the installed Edge browser are sufficient. This uses the full
V0.2 feature state, not the published v0.1.0 release.

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run build:video-spike
npm run test:video-spike
node tools/video/measure-bundle.mjs
npm run preview:video-spike -- --host 0.0.0.0 --port 4220
```

The ordinary build stays in `dist/`; the isolated engineering build is in
`.tools/video-site/`. Preview serves only that directory at `/AniView/`, accepts
GET/HEAD only, has no HMR, and accepts no uploads. Generated media, screenshots,
benchmarks and downloads remain ignored under `.tools/video/`. The desktop suite
downloads one attributed NASA photograph solely into that ignored directory.

Desktop loopback HTTP is a secure context. Android needs trusted HTTPS. Put a
temporary HTTPS tunnel in front of port 4220, or supply an already trusted local
certificate with `--key <path> --cert <path>`. Never disable certificate checks,
use browser security flags, or deploy the experiment to production Pages.

The official Cloudflare helper download timed out. An existing Windows OpenSSH
alternative established a tunnel but its HTTPS hostname was unreachable from
this network. No project dependency was added for either attempt. The free,
keyless alternative command is documented
by [localhost.run](https://localhost.run/docs/faq#i-dont-want-to-use-an-ssh-key):

```powershell
& C:\Windows\System32\OpenSSH\ssh.exe -T -o BatchMode=yes `
  -o StrictHostKeyChecking=accept-new `
  -o UserKnownHostsFile=D:/GoodIdea/AniView/.tools/video/known_hosts `
  -o IdentityAgent=none -o IdentityFile=none -o IdentitiesOnly=yes `
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 `
  -o ExitOnForwardFailure=yes -R 80:127.0.0.1:4220 nokey@localhost.run
```

Use the HTTPS hostname actually printed by the service. Free hostnames can
expire/change. Keep the preview and tunnel alive and freeze the build throughout
a phone-test window. Anyone knowing the URL can read these engineering assets;
no selected media is sent to the tunnel. Close these processes when testing ends.

The current alternative uses `localtunnel@2.0.2` solely as ignored CLI tooling,
installed with `--prefix .tools/video/tunnel-tool --no-save --package-lock=false
--ignore-scripts`. Its 22 tool packages are not project dependencies and are not
served or shipped in either build:

```powershell
node .tools/video/tunnel-tool/node_modules/localtunnel/bin/lt.js --port 4220 --local-host 127.0.0.1
```

Use the current printed HTTPS hostname; allow startup until it returns the actual
engineering HTML. The public test gateway can be slow or briefly return408. If it
shows its visitor access page, follow the gateway's normal tunnel-password flow;
do not bypass TLS validation. This is temporary infrastructure, not AniView hosting.

```powershell
node tools/video/check-preview.mjs https://<current-host>/AniView/experiments/video/?debug=1
```

`run-browser.mjs` tests the installed desktop Edge, not Android. It verifies real
encoding, MP4 decode-back, native playback, bounds, regional composition fixtures,
VFR, one-cycle semantics, cancellation and rerun. `held-encoder.worker.ts` holds
the real muxer's public `onFinalize` callback and is engineering-only. A hard
Worker stop interrupts that state; no upstream library is patched.

The photometric thresholds (mean ≤8 / p95 ≤30 channel units at 256 RGB samples per
frame) are experimental, not a perceptual-quality guarantee. Deliberate
pixel-frequency chroma/alpha stress is reported separately as a fidelity
limitation. All results require the interpretation in the [spike report](../../docs/spikes/milestone-8c1-animation-to-mp4.md).

## Focused finalization diagnostics

The original Android build is frozen. Build the diagnostic variant into its own
directory and run controlled desktop checks without replacing that artifact:

```powershell
npm run build:video-spike -- --base=/AniView/followup/ --outDir=.tools/video-followup-site
node tools/video/check-finalize-diagnostics.mjs
```

The check serves only generated files on an OS-assigned loopback port. It tests
all source formats at small/medium sizes, three real finalizing cancel→reruns,
and explicit synthetic startup/timeout faults. The1s accelerated timeout exists
only inside that lab browser; the application timeout remains120s. Runtime
observations are numeric only. The phone variant can be copied into the isolated
preview's `followup/` namespace while verifying every original artifact hash stays
unchanged; use the explicit `experiments/video/index.html?debug=1` path there.
Phone requests should target only the second cancellation test and copy the new
Failure JSON on failure. See the [Android record](../../docs/spikes/milestone-8c1-android-validation.md).
