# AniView

Local Animated Media Viewer for mobile and desktop browsers.

**Project status: early development / foundation stage (Milestone 0).**
The responsive application shell and core TypeScript contracts exist. File opening,
format detection and media playback are **not implemented yet**.

Target animated formats: GIF, Animated WebP and APNG. Static WebP, PNG and JPEG
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

- `src/app/` and `src/pages/`: React shell and Home page.
- `src/input/virtual-file.ts`: source-independent byte reads, including ranges.
- `src/formats/`: detector and animation decoder contracts, without codec implementations.
- `src/media/`: animation/frame contracts and categorized errors.
- `src/player/` and `src/renderer/`: separate playback and drawing contracts.

Animation sequences expose fresh incremental frame streams for replay. Consumers
own yielded frames and must dispose of them on eviction. Frames are normalized
to fully composited canvas-sized images so codec blend/disposal details stay in
the decoder adapter. Renderer calls borrow a frame synchronously. The player
will own sequence cleanup and a bounded cache; neither is implemented here.

The WebP spike Worker lives with its format adapter under `src/formats/webp/`.
Archive and shared UI component directories will be introduced with their
first real modules rather than empty scaffolding. See `PLAN.md` for the architecture
and roadmap, and `AGENTS.md` for development rules.
