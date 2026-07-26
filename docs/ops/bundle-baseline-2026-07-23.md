# Bundle + cold-start baseline 2026-07-23

Measured on `main` (8d573cd, dirty) with a `NODE_ENV=production` build.

## How to reproduce

```bash
pnpm build
pnpm perf:cold-start --runs 5           # scripts/tools/measure-nitro-cold-start.mjs
npx nuxi analyze --no-serve             # writes node_modules/.cache/nuxt/.nuxt/analyze/{client,nitro}.html
```

`perf:cold-start` boots `wrangler dev --local` against `.output` and times first-byte
on `/api/ping` (a binding-free route added for exactly this). The absolute number
includes miniflare process spin-up, so treat it as a **relative** metric; the
`entrypointBytes` field is the stable proxy for what workerd evaluates
on a production cold start.

## Baseline → after

Items 1 through 3 below are fixed. Items 4 and 5 are still open.

| Metric | Before | After |
| --- | --- | --- |
| Cold start (median, 5 runs) | 2261 ms | **1578 ms** |
| Cold start (min / max) | 1895 / 3232 ms | 1549 / 2121 ms |
| Warm request (median) | 7.4 ms | 8.8 ms |
| `chunks/nitro/nitro.mjs` (eagerly evaluated) | 2.07 MB | 1.96 MB |
| Worker total | 28.8 MB raw / **8.10 MB gzip** | 12.5 MB raw / **3.70 MB gzip** |
| `.output/public` | 73 MB, 1997 files | 24 MB, 533 files |

The 8.10 MB gzip figure sat against Cloudflare's 10 MB compressed Worker limit,
under 2 MB of headroom. It's now 3.70 MB, so the deploy-limit risk is gone and
the remaining items are cold-start work rather than emergencies.

Cold start numbers include miniflare spin-up, so the ~30% improvement is a floor
on the real gain, not a precise figure.

## Heavy hitters (ranked)

### 1. Icon collections bundled whole, 8.85 MB server (FIXED)

`nuxt.config.ts:215` sets `serverBundle: 'local'` with `['lucide', 'vscode-icons', 'simple-icons']`,
which bundles every icon in all three collections:

- `chunks/_/icons2.mjs` (simple-icons): 4.63 MB
- `chunks/_/icons3.mjs` (vscode-icons): 3.64 MB
- `chunks/_/icons.mjs` (lucide): 0.54 MB

Actual usage across `app/` and `layers/*/app/`: **~270 distinct icons**, all
statically named (no template-interpolated icon names anywhere). 5 from
simple-icons, 36 from vscode-icons, ~230 from lucide.

Fixed by `serverBundle: false` + `clientBundle.scan`, with `globInclude` extended
to `app/**/*.ts` and `layers/**/*.ts` because the file-tree extension map and the
cluster definitions name icons in plain TS.

**8.85 MB → 112 KB (133 icons)**, which is the 111 named in source plus Nuxt UI's
own defaults injected via the `icon:clientBundleIcons` hook. Verified against a
local `wrangler dev` build: on `/`, `/skills`, `/guides` and a skill detail page,
every rendered `iconify i-*` class has a matching mask rule inlined in the SSR
HTML, and no request falls through to `api.iconify.design`.

### 2. Full Shiki bundle reaching client *and* server, 9.26 MB (FIXED)

`mdc.highlight.langs` (`nuxt.config.ts:189`) lists 13 languages and 2 themes,
but the build ships:

- `@shikijs/langs`: 253 languages, 7.84 MB raw / 1.29 MB gzip
- `@shikijs/themes`: 65 themes, 1.42 MB raw / 241 KB gzip
- `@shikijs/engine-oniguruma` + `onig.wasm`: 622 KB, despite `shikiEngine: 'javascript'`

mdc itself was not the culprit; its generated `#mdc-highlighter` correctly scopes
to the 13 configured langs and 3 themes. Three app-level call sites did it:

- `layers/registry/server/utils/skill-md-render.ts` imported `shiki/bundle/web` (~100 langs).
- `layers/registry/app/components/SkillDetail.vue` and
  `layers/registry/app/pages/gh/[owner]/[repo]/[name]/-/[...file].vue` both did
  `await import('shiki')`{lang="ts"}. The bare `shiki` entry re-exports `bundle-full`, so
  each dragged all 253 grammars and 65 themes into the *client* build
  (`emacs-lisp.js` alone was 762 KB of browser-shipped JS).

The grammar chunks are dynamic imports, so they never cost eval time, but they
cost gzip budget, build time, and feed problem 3.

Fixed by `shared/shiki.ts`, now the single Shiki implementation entrypoint for
the app. It builds a `createHighlighterCore` singleton on the JS regex engine
with one explicit dynamic import per language, so only those chunks get emitted.
The lightweight language resolver lives in `shared/shiki-language.ts`, which
lets callers decide whether highlighting is needed before importing the parser.
Direct `@shikijs/core` and `@shikijs/engine-javascript` imports also avoid
Nitro's `unwasm` export condition selecting Shiki's Oniguruma build.

The bundled set is 53 languages, chosen as roughly the intersection of what
`bundle/web` covered and what realistically appears in SKILL.md fences and skill
source files. `resolveShikiLang` returns null for anything else and callers fall
back to a plain `<pre>`{lang="html"} block, which is what already happened for unsupported fences.
`SkillDetail.vue` needed a new plain-text branch: its `v-else` was a loading
skeleton, so a null highlight result would have left the viewer stuck on it.

Three tests in `skill-md-render.spec.ts` cover the highlight path, alias
resolution, and the plain-text fallback.

### 3. Public asset manifest inlined into the eager entrypoint (FIXED)

Nuxt Analyze showed the generated public asset data module contributing 237 KB
to the eager graph. `.output/server/wrangler.json` already declares an `ASSETS`
binding pointing at `../public`, so Wrangler serves these files before the
Worker runs.

`nuxt.config.ts` now aliases `#nitro-internal-virtual/public-assets-data` to an
empty module for the [Cloudflare](https://cloudflare.com) build. Local Wrangler checks confirmed
`/favicon.svg`, `/_nuxt/builds/latest.json`, and a hashed client chunk are served
from `.output/public` with exact byte matches. Missing routes still reach Nitro.

`chunks/virtual/precomputed.mjs` remains, but inspection showed that it is Nuxt's
client dependency and preload manifest, not the public asset table.

#### 2026-07-25 measurements

Measured from the same dirty working tree before and after the Shiki and public
asset changes:

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Wrangler startup CPU profile | 124.237 ms | 101.511 ms | **-18.3%** |
| Active sampled CPU | 53.898 ms | 44.204 ms | **-18.0%** |
| `__init` sampled CPU | 11.644 ms | 8.389 ms | **-28.0%** |
| `chunks/nitro/nitro.mjs` | 1,476,115 B | 1,395,688 B | **-5.4%** |
| Wrangler bundled entry | 9,768,357 B | 9,535,212 B | **-2.4%** |
| Wrangler upload | 13,332.03 KiB | 13,104.35 KiB | **-1.7%** |
| Wrangler upload gzip | 3,447.40 KiB | 3,393.32 KiB | **-1.6%** |

`onig.wasm` is gone from `.output/server`. The seven-run Miniflare benchmark moved
from 1368 ms to 1479 ms median, while warm ping moved from 6.9 ms to 7.6 ms.
That process-level benchmark is noisy enough to conflict with Wrangler's CPU
profile, so use it as a coarse regression signal rather than a release claim.

Production version 193 was sampled before these changes. `/api/ping` had 7 ms
median Worker CPU and 11.5 ms median wall time across 12 requests. `/` had 107 ms
median Worker CPU and 318.5 ms median wall time across 12 requests. The root
route is now dominated by application rendering and data access rather than
Worker initialization.

### 4. `takumi_wasm`: 3.74 MB raw / 1.56 MB gzip

`nuxt-og-image`'s renderer. This is a single Wasm blob and the largest gzip line
item in the Worker after the icons.

On 2026-07-25, a production experiment compared the embedded renderer with a
dedicated Worker reached through an RPC service binding. Three fresh versions
of each application variant and renderer were deployed to the skilld Cloudflare
account, sampled in SYD, then deleted.

| Production metric | Embedded | Dedicated renderer |
| --- | ---: | ---: |
| Application upload gzip | 1,807.60 KiB | 277.67 KiB |
| Application startup, median across four deploys | 30 ms | 29 ms |
| Dynamic ping CPU, median across five requests | 2 ms | 2 ms |
| First OG internal time after a fresh version, median | 4 ms | 154 ms |
| Warm OG wall time, median across five requests | 32 ms | 40 ms |
| Warm OG CPU, median across five requests | 31 ms | about 37 ms combined |

The renderer Worker itself had 11 ms median deployment startup. The application
startup and normal request CPU did not improve. The first OG request paid about
150 ms to activate and call the renderer service. Warm OG work was also slightly
slower once the application and renderer CPU were combined.

Conclusion: keep Takumi embedded for latency. The service split is useful only
for deployment size or isolation, neither of which is currently a constraint.
The failed first renderer upload also confirmed unnamed RPC entrypoints require
a `fetch` handler. No service split package code was retained.

### 5. Smaller server-side items

| Package | Raw |
| --- | --- |
| `emojilib` | 296 KB |
| `parse5` | 267 KB |
| `@sentry/core` | 251 KB |
| `yaml` | 239 KB |
| `zod` | 171 KB |
| `drizzle-orm` | 146 KB |

`emojilib` and `parse5` are the surprising entries; neither is an obvious
dependency of a page render.

## Client bundle

Before the fix, `@shikijs/langs` (1.29 MB gzip) and `@shikijs/themes` (241 KB gzip)
dominated. With those gone, the next entry worth a look is
`@sqlite.org/sqlite-wasm` (364 KB raw) from `@nuxt/content`, which only backs
`layers/marketing/app/pages/learn/[...slug].vue`, and content is configured
against D1, so the client-side [SQLite](https://sqlite.org) path may be unused. Application code is
well-behaved: `reka-ui` 306 KB and `@nuxt/ui` 303 KB are the largest remaining
entries.

`onig.wasm` previously survived in the Worker because Nitro's `unwasm` export
condition resolved `shiki/core` to Shiki's Wasm-aware build. Direct package
imports remove it.

## Remaining work

1. Check whether the client-side SQLite path is reachable at all.
2. Profile eager server dependencies such as `emojilib`, `parse5`, and `yaml`.

Re-run `pnpm perf:cold-start` after each; `--max-entrypoint-bytes` can lock in a
regression budget now that the entrypoint has settled around 1.40 MB.
