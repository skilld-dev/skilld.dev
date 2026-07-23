# Bundle + cold-start baseline — 2026-07-23

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

## Baseline

| Metric | Value |
| --- | --- |
| Cold start (median, 5 runs) | 2261 ms |
| Cold start (min / max) | 1895 / 3232 ms |
| Warm request (median) | 7.4 ms |
| `chunks/nitro/nitro.mjs` (eagerly evaluated) | 2.24 MB |
| Worker total | 28.8 MB raw / **8.10 MB gzip** |
| `.output/public` | 73 MB, 1997 files |

**8.10 MB gzip against Cloudflare's 10 MB compressed Worker limit.** Roughly 1.9 MB
of headroom. Everything below is both a cold-start cost and a deploy-limit risk.

## Heavy hitters (ranked)

### 1. Icon collections bundled whole — 8.85 MB server

`nuxt.config.ts:215` sets `serverBundle: 'local'` with `['lucide', 'vscode-icons', 'simple-icons']`,
which bundles every icon in all three collections:

- `chunks/_/icons2.mjs` (simple-icons) — 4.63 MB
- `chunks/_/icons3.mjs` (vscode-icons) — 3.64 MB
- `chunks/_/icons.mjs` (lucide) — 0.54 MB

Actual usage across `app/` and `layers/*/app/`: **~270 distinct icons**, all
statically named (no template-interpolated icon names anywhere). 5 from
simple-icons, 36 from vscode-icons, ~230 from lucide.

Fix: `serverBundle: false` + `clientBundle: { scan: true, includeCustomCollections: true }`.
Scanned icons are inlined into the app bundle and remain available to SSR.
Because every name is static, the scanner should resolve all of them; any miss
falls back to the Iconify API rather than breaking.

### 2. Full Shiki bundle reaching client *and* server — 9.26 MB

`mdc.highlight.langs` (`nuxt.config.ts:189`) lists 13 languages and 2 themes,
but the build ships:

- `@shikijs/langs` — 253 languages, 7.84 MB raw / 1.29 MB gzip
- `@shikijs/themes` — 65 themes, 1.42 MB raw / 241 KB gzip
- `@shikijs/engine-oniguruma` + `onig.wasm` — 622 KB, despite `shikiEngine: 'javascript'`

Two entrypoints pull this in:

- `layers/registry/server/utils/skill-md-render.ts:4` imports `shiki/bundle/web`
  (~100 langs) — server only, and it does correctly lazy-load per fence.
- Something universal pulls `shiki/dist/bundle-full.mjs` (all 253). It lands in the
  client build as `_nuxt/dist9.js` and drags 125 language chunks >40 KB into
  `.output/public` (`emacs-lisp.js` alone is 762 KB). The mdxg plugin
  (`modules/mdxg/src/module.ts:74`) registers the mdc highlighter universally,
  which is the likely path.

The language chunks are dynamic imports, so they don't cost eval time — but they
cost gzip budget, build time, and feed problem 3.

Fix: pin both highlighters to an explicit language set (`createdBundledHighlighter`
with the 13 configured langs, or `shiki/bundle/web` on both sides) so
`bundle-full` never enters the graph.

### 3. Public-asset manifest inlined into the eager entrypoint — 427 KB

`chunks/virtual/precomputed.mjs` is a 427 KB table of all 1997 files in
`.output/public` (path, etag, mtime, size, mime), imported by `nitro.mjs` and
parsed on **every** cold start. `.output/server/wrangler.json` already declares
an `ASSETS` binding pointing at `../public`, so Workers Assets serves these files
before the Worker runs — the Worker-side table is dead weight.

That's ~19% of the 2.24 MB eager entrypoint. Fixing problem 2 shrinks it by
roughly two thirds on its own; disabling Nitro's static serving would remove it
entirely.

### 4. `takumi_wasm` — 3.74 MB raw / 1.56 MB gzip

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

`emojilib` and `parse5` are the surprising entries — neither is an obvious
dependency of a page render.

## Client bundle

`@shikijs/langs` (1.29 MB gzip) and `@shikijs/themes` (241 KB gzip) dominate, then
`@sqlite.org/sqlite-wasm` (364 KB raw) from `@nuxt/content` — which only backs
`layers/marketing/app/pages/learn/[...slug].vue` and is configured for D1, so the
client-side [SQLite](https://sqlite.org) path may be unused. Application code is well-behaved:
`reka-ui` 306 KB and `@nuxt/ui` 303 KB are the largest non-shiki entries.

## Suggested order

1. Icons (`serverBundle: false` + `clientBundle.scan`) — biggest win, lowest risk, ~8.3 MB.
2. Shiki language pinning — ~9 MB across both bundles, and shrinks item 3 as a side effect.
3. Move OG image rendering out of the main Worker — ~1.56 MB gzip.
4. Drop the Worker-side public-asset table.

Re-run `pnpm perf:cold-start` after each; `--max-entrypoint-bytes` can lock in a
regression budget once the entrypoint settles.
