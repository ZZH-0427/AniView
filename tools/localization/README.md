# English / Simplified Chinese UI acceptance

With installed Node24/Edge and a production `npm run build`, run
`node tools/localization/run-browser.mjs`. It reuses the original procedural
creation, MP4 and video-source fixture outputs already used by the accepted
product tools; no browser/dependency download or codec matrix is performed.

The driver checks initial detection, preference reload/override/invalid storage,
blocked storage, keyboard switching, both locales at1440/1280/768/390/360,
unintended mixed text (excluding filenames, native UI, debug and standardized
technical names), Viewer/Creator/conversion/video state, active job identity,
and all four Preview return paths. Use the original fixture-generation
instructions if `.tools/creation/fixtures.json` or product/video fixtures are absent.

Reports, numeric snapshots and screenshots stay ignored under
`.tools/localization-browser/`. They are desktop evidence, not Android acceptance.
