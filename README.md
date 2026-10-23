# AniView

Local Animated Media Viewer for mobile and desktop browsers.

**Project status: early development / Milestone 1 PASSED; Milestone 2A PASSED;
Milestone 2B PASSED; Milestone 3 pending Android input validation.**
The formal viewer supports Animated WebP, APNG and GIF with Play/Pause, Replay,
looping and Close. All three formats use the same bounded cache, player and renderer.
Single-frame GIF is supported. Static PNG/JPEG/WebP are recognized and display
an explicit message that static-image viewing is not available yet.
See the [WebP vertical slice](docs/milestones/milestone-1-webp-vertical-slice.md)
and [APNG integration notes](docs/milestones/milestone-2a-apng.md).
See [GIF integration notes](docs/milestones/milestone-2b-gif.md) for timing,
disposal compatibility, the approved interlace adaptation and acceptance status.

Choose **选择图片** on mobile or **Open Images** on desktop. The standard picker
uses `image/*`; its gallery/directory interface depends on the browser and system.
Select multiple files or drag files into the desktop page, then use Previous/Next,
Remove from list, Choose more images and Clear session. Files are opened on demand
from a temporary list (up to 1,000 items); removing an item never deletes the
device file. Cancelling selection preserves the list; Close clears it.
See [Input Experience](docs/milestones/milestone-3-input-experience.md) for the
final Android picker validation matrix, which remains pending.

Target animated formats: GIF, Animated WebP and APNG. Static PNG and JPEG
are also planned. Files are processed locally in your browser. Normal viewing
will not require media uploads, accounts or a backend. No analytics is included.

An isolated Milestone 1A Animated WebP engineering spike is available through
`?spike=webp`; this is not production playback support. Its build, ownership and
validation details are in [the technical notes](docs/milestones/milestone-1a-webp-wasm.md).

## Development

Install Node.js 24 LTS (see `.nvmrc`) with npm, then:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173/AniView/`.

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm run preview
```

`test` runs Vitest once for CI; `test:watch` enables watch mode. The baseline tests
use React's static rendering API in Node, so no simulated DOM dependency is needed.
Production output is generated in `dist/` and is ignored by Git.

## GitHub Pages

Vite uses `/AniView/` as its base in development and production. Future runtime
assets must use Vite imports, `new URL(..., import.meta.url)` or
`import.meta.env.BASE_URL` rather than hard-coded root URLs.

Repository: [ZZH-0427/AniView](https://github.com/ZZH-0427/AniView).

Select **GitHub Actions** in **Settings → Pages → Build and deployment → Source**.
The Pages workflow runs
`npm ci`, lint, typecheck, tests and the build on pushes to `main`. It uploads
`dist/` with the official Pages artifact action and deploys with `deploy-pages`.
Pull requests run validation only. Manual runs deploy only from `main`.

The expected production URL is [AniView](https://ZZH-0427.github.io/AniView/).
Check the **Validate and deploy Pages** workflow in the repository's **Actions**
tab for the actual validation and deployment result.
Do not commit `dist/` or maintain a `gh-pages` source branch.

## Module boundaries

- `src/app/` and `src/pages/`: React shell, Home and Viewer.
- `src/input/virtual-file.ts`: source-independent byte reads, including ranges.
- `src/input/`: shared browser-file adapters for standard selection and file drops.
- `src/formats/`: binary format detection and Worker-backed WebP/APNG/GIF adapters.
- `src/media/`: animation/frame contracts and categorized errors.
- `src/media/media-session.ts`: page-lifetime ordered references and file navigation.
- `src/player/` and `src/renderer/`: bounded prefetch/cache, presentation clock and Canvas drawing.

Animation sequences expose fresh incremental frame streams for replay. Consumers
own yielded frames and must dispose of them on eviction. Frames are normalized
to fully composited canvas-sized images so codec blend/disposal details stay in
the decoder adapter. Renderer calls borrow a frame synchronously. The player
owns sequence cleanup and a byte-bounded cache (16 MiB / six frames normally).
Larger frames receive exactly two frames of cache capacity, up to a 32 MiB
automatic ceiling. Explicitly configured budgets remain strict.

The shared WebP Worker lives with its format adapter under `src/formats/webp/`.
Archive and shared UI component directories will be introduced with their
first real modules rather than empty scaffolding. See `PLAN.md` for the architecture
and roadmap, and `AGENTS.md` for development rules.
