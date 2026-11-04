// Assemble reviewable audit records from the saved, exact run evidence.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
const load=async path=>JSON.parse(await readFile(path,'utf8'))
const b=await load('.tools/rc-audit/browser/report.json'),d=await load('.tools/rc-audit/dependencies.json'),mpl=await load('.tools/rc-audit/mpl-source.json'),checkpoint=await load('.tools/rc-audit/checkpoint.json')
assert.equal(b.status,'PASS');assert.equal(mpl.upstreamFilesChanged.length,0)
const readLogJson=async path=>{const bytes=await readFile(path);return JSON.parse(bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''))}
const legacy={core:await readLogJson('.tools/rc-audit/core.log'),releaseUI:await readLogJson('.tools/rc-audit/release-ui.log')}
await writeFile('docs/research/v0.2-dependency-security-audit.json',JSON.stringify({date:'2026-11-04',baseline:checkpoint.baseline,
 npmAudit:await load('.tools/rc-audit/npm-audit.json'),productionAudit:await load('.tools/rc-audit/npm-audit-production.json'),decisions:d.advisories,mustFix:d.mustFix},null,2)+'\n')
await writeFile('docs/research/v0.2-license-evidence.json',JSON.stringify({date:'2026-11-04',baseline:checkpoint.baseline,project:d.project,
 runtime:d.licenses,correspondingSource:mpl,retainedNotices:d.retainedNotices,rawNoticeDifferences:d.rawNoticeDifferences,
 missingRequiredNoticeTexts:d.missingRequiredPublicNoticeTexts,hygiene:d.hygiene},null,2)+'\n')
const evidence={schema:1,date:'2026-11-04',scope:b.scope,baseline:checkpoint.baseline,browser:b.browser,context:b.context,sequences:b.sequences,
 cleanup:b.cleanup,jobs:b.jobs.map(j=>({kind:j.kind,heartbeat:j.heartbeat,status:j.snapshot.status,jobId:j.snapshot.jobId,
  peakRgbaFrames:j.snapshot.peakRgbaFrames,peakCanonicalRgba:j.snapshot.peakCanonicalRgba,peakAppSamples:j.snapshot.peakAppSamples,
  softClosed:j.snapshot.softClosed,hardTerminated:j.snapshot.hardTerminated,cleanupErrors:j.snapshot.cleanupErrors})),
 previewReturns:b.previewReturns,downloads:b.downloads.map(x=>({format:x.format,copies:x.saved.length,bytes:x.saved.map(f=>f.bytes),uniqueFilenames:new Set(x.saved.map(f=>f.name)).size===x.saved.length})),
 responsive:b.responsive,checks:b.checks,staleIsolation:b.staleIsolation,final:b.final,probe:b.probe,
 network:{observations:b.network.length,unexpected:b.unexpectedNetwork,uploads:b.uploads},warnings:b.warnings,errors:b.errors,protocolNotices:b.protocolNotices,
 legacyRegressions:{core:{passed:legacy.core.passed,errors:legacy.core.errors??[]},releaseUI:{passed:legacy.releaseUI.checks,errors:legacy.releaseUI.errors??[]}},status:b.status}
await writeFile('docs/research/v0.2-rc-desktop-evidence.json',JSON.stringify(evidence,null,2)+'\n')
const rows=d.advisories.map(v=>`| ${v.name} | ${v.installed} | ${v.direct?'Direct dev':'Transitive dev'} | ${v.via.map(x=>typeof x==='string'?x:x.name).join(', ')} | NOT APPLICABLE TO PRODUCTION |`).join('\n')
const security=`# V0.2 dependency security audit — M9A2

Date:2026-11-04. Product baseline: **${checkpoint.baseline}**.
This is an advisory/exposure review, not a dependency upgrade. Package and
lockfile remain unchanged; no npm force-fix, overrides or dependency downgrades.

## Exact captured results

- Clean npm ci passed; its summary reported13 moderate entries.
- The separately captured complete npm audit JSON reports **12 moderate affected
  package entries**, critical0/high0/low0, from **one unique GHSA**, not12 CVEs.
- npm audit --omit=dev reports **0 vulnerabilities**. Registry/advisory snapshots
  can differ between requests; decisions below refer to the retained JSON.
- Evidence: ignored .tools/rc-audit/npm-audit.json, npm-audit-production.json,
  runtime-tree.json and dependencies.json. A complete captured audit and review
  decisions are retained in v0.2-dependency-security-audit.json. They record each node/path,
  installed/affected version, via/effect edge, proposed fix and decision.

## Root issue, preconditions and decision

Installed minimatch10.2.6 is affected by
[GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
The publisher describes attacker-controlled glob preprocessing with
optimizationLevel>=2 causing CPU/memory amplification. npm's affected range is
<11.0.1; the publisher's patched root version is11.0.1.

In AniView the paths are ESLint→@eslint/config-array→minimatch and
typescript-eslint→@typescript-eslint/typescript-estree→minimatch, plus ESLint's
own matching dependency. They process development repository/configuration
globs, not user-selected browser media. No lint/parser package is imported by
the product source or emitted as an application dependency. Production is a
static client with no server glob endpoint or media upload API.

Root remediation crosses minimatch10→11. npm's suggested parent remedies include
semver-major changes/downgrades (e.g. typescript-eslint8.14.0 and @eslint/js9.39.5),
not a verified safe patch for the current TypeScript6/ESLint10 toolchain.
No blind update is justified in this frozen audit. Review compatible development
tool updates separately; keep CI inputs/configuration under repository control.

Every row is moderate, dev/build-time, not shipped, not production-reachable,
and classified **NOT APPLICABLE TO PRODUCTION** for this release. This records
the installed vulnerability rather than claiming the tooling package is fixed.

| Package | Installed | Directness / role | Advisory propagated via | Decision |
| --- | --- | --- | --- | --- |
${rows}

## Release decision

MUST FIX BEFORE V0.2: **NONE identified in the reviewed exposure**.
ACCEPT FOR V0.2 / DEFER WITH JUSTIFICATION: no separate runtime advisory.
NOT APPLICABLE TO PRODUCTION: the12 development-tool entries above.
No runtime upgrade, codec patch, force-fix or release-scope expansion was made.
The review covers the captured registry advisories and actual dependency roles;
it is not a promise that all browser/native code is free of unknown defects.
`
await writeFile('docs/research/v0.2-dependency-security-audit.md',security)
const licenseRows=d.licenses.map(v=>`| ${v.name} | ${v.version} | ${v.license} | Yes | No | Retained; public collection verified | No |`).join('\n')
const licensing=`# V0.2 third-party license audit — M9A2

Date:2026-11-04. Lockfile/product baseline: **${checkpoint.baseline}**.
AniView stays **UNLICENSED**, private:true, version0.1.0; no project LICENSE or
license grant is introduced. Third-party components keep their own terms.

## Runtime npm inventory

| Component | Exact version | License | Runtime | Upstream modified | Notice coverage | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
${licenseRows}

MIT components retain copyright, permission and disclaimer. zip.js retains its
BSD copyright/conditions/disclaimer; its embedded zlib/Chromium/ARM and
zlib-streams-ts acknowledgements are also retained. apng-js's embedded Node
EventEmitter is covered separately. Source changes in AniView adapters (for
example GIF interlace row reordering) are not edits to installed upstream files.
The two @types/dom-* packages pulled by Mediabunny are compile-time declarations,
not additional browser executable libraries.

## Mediabunny / MPL-2.0

Version1.65.0 is pinned. The exact
[published corresponding-source archive](${mpl.url})
was retrieved and matched lockfile integrity. All **${mpl.sourceFilesCompared} upstream
TypeScript source files plus LICENSE** matched the installed package byte for
byte; upstream modifications: **NONE**. The local audit archive is retained
under ignored .tools/rc-audit/, not installed as a new dependency.

The complete MPL and source-availability notice accompany the distributable in
public/third-party-notices.txt; the notice gives that exact source-package URL.
MPL obligations apply to the covered source files. Bundling/minifying them does
not eliminate source availability; this unmodified version's source remains
available under MPL. Separate AniView-owned files remain a larger work under
their own terms, so no whole-project MPL relicensing is introduced. See
[Mozilla's MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
The published source link was checked during this audit; retain availability
when distributing the covered executable code.

Current use includes native MP4 mux/readback and the VideoSource Worker's public
Input/CustomSource/VideoSampleSink/EncodedPacketSink APIs. Browser-native AVC
codecs are supplied by the browser/OS, not a bundled H.264 encoder library.
Existing notices distinguish MPL code licensing from native AVC/patent rights;
this audit does not make an additional patent grant.

Decision: **ACCEPT FOR V0.2**, retained license/source notices verified.

## WASM and generated support

libwebp1.6.0, commit4fa21912338357f89e4fd51cf2368325b59e9bd9, remains the pinned
WebP decode/encode/mux library. Its BSD-3-Clause COPYING and PATENTS grant are
in the source mirrors and production notice collection. The exact WASM is
394132 bytes, SHA256 f08dc7922c9df005b72a1e169182c1886e03dcae9ab213d03e58a23cab6ff925;
it is unchanged from the accepted feature baseline. The original AniView bridge
and optional pinned rebuild tools are separately authored glue.

Generated support remains Emscripten6.0.13 (MIT OR NCSA), musl1.2.6 (MIT and
retained component notices), LLVM compiler-rt SDK22.1.8 (Apache-2.0 WITH
LLVM-exception/legacy notices), and dlmalloc2.8.6 (upstream public-domain
declaration plus SDK changes). Build-generated Vite8.3.5/Rolldown1.2.15 helpers
retain their MIT and bundled Rollup/esbuild notices. No new build or codec
dependency was introduced.

## Notice/provenance verification

Eight runtime license mirrors match installed upstream texts (comment prefixes
are removed only for omggif's source-header comparison); all are present in the
public collection.24 retained text files were checked. Two raw nonidentities:

- libwebp/AUTHORS is retained in the repository, while the binary collection
  carries the BSD-required copyright/conditions/disclaimer and patent grant;
  the contributor list is not an additional BSD binary redistribution condition.
- The published Mediabunny NOTICE has a more complete8D1/8D2 API-use line than
  the retained mirror. All copyright, version, MPL and source-availability lines
  match; the public artifact is not missing an obligation or source link.

Missing required license/notice texts: **0**. No new unlicensed/GPL reference
code was identified in the product source/provenance review; research references
are not imports or vendored production modules. Original package source/license
evidence and authorship boundaries remain in the earlier licensing/reference
records; this is a provenance review, not a proof about every possible origin.

See THIRD_PARTY_NOTICES.md, third_party/licenses/, public/third-party-notices.txt,
the release licensing audit, gif-encoder licensing audit and video-input
reference delta audit. No license blocker was identified for the current
third-party code packaging. Source/provenance and the limits of native/GPU
observability remain documented; no project relicensing is implied.
`
await writeFile('docs/research/v0.2-third-party-license-audit.md',licensing)
console.log(JSON.stringify({desktop:b.status,cleanupSnapshots:b.cleanup.length,securityRows:d.advisories.length,runtimeLicenses:d.licenses.length,sourceFiles:mpl.sourceFilesCompared}))
