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

Items 1 and 2 below are fixed. Items 3–5 are still open.

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

Fixed by `shared/shiki.ts`, now the single Shiki entrypoint for the app. It builds
a `createHighlighterCore` singleton on the JS regex engine (workerd can't
instantiate the Oniguruma Wasm at SSR time) with one explicit dynamic import per
language, so only those chunks get emitted. It imports `shiki/core`,
`shiki/types` and `shiki/engine/javascript`, thin re-exports that carry no
bundle map, plus `@shikijs/langs` and `@shikijs/themes` as direct deps.

The bundled set is 53 languages, chosen as roughly the intersection of what
`bundle/web` covered and what realistically appears in SKILL.md fences and skill
source files. `resolveShikiLang` returns null for anything else and callers fall
back to a plain `<pre>`{lang="html"} block, which is what already happened for unsupported fences.
`SkillDetail.vue` needed a new plain-text branch: its `v-else` was a loading
skeleton, so a null highlight result would have left the viewer stuck on it.

Three tests in `skill-md-render.spec.ts` cover the highlight path, alias
resolution, and the plain-text fallback.

### 3. Public-asset manifest inlined into the eager entrypoint: 427 KB → 228 KB, still open

`chunks/virtual/precomputed.mjs` is a table of every file in `.output/public`
(path, etag, mtime, size, mime), imported by `nitro.mjs` and parsed on **every**
cold start. `.output/server/wrangler.json` already declares an `ASSETS` binding
pointing at `../public`, so Workers Assets serves these files before the Worker
runs, so the Worker-side table is dead weight.

Fixing problem 2 took it from 427 KB to 228 KB by cutting the file count from
1997 to 533, but it's still ~12% of the eager entrypoint and the remaining bytes
are pure overhead. Removing it means stopping Nitro from emitting the manifest at
all when the preset serves assets via the binding.

### 4. `takumi_wasm`: 3.74 MB raw / 1.56 MB gzip

`nuxt-og-image`'s renderer. This is a single Wasm blob and the largest gzip line
item in the Worker after the icons. Worth deciding whether OG image generation
belongs in the main Worker or a separate one; it's ~19% of the gzip budget for a
feature that never runs on a page render.

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

`onig.wasm` (467 KB raw / 159 KB gzip) also survives in the Worker even though
nothing should be using the Oniguruma engine. Worth tracing.

## Remaining work

1. Move OG image rendering out of the main Worker: ~1.56 MB gzip, ~42% of what's left.
2. Drop the Worker-side public-asset table: 228 KB off every cold start.
3. Trace the surviving `onig.wasm`: 159 KB gzip for an engine nothing calls.
4. Check whether the client-side SQLite path is reachable at all.

Re-run `pnpm perf:cold-start` after each; `--max-entrypoint-bytes` can lock in a
regression budget now that the entrypoint has settled around 1.96 MB.
