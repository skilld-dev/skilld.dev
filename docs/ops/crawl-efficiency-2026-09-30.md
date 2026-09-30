# Crawl efficiency 2026-09-30

> Update 2026-09-30: [#328](https://github.com/skilld-dev/skilld.dev/pull/328) and [#329](https://github.com/skilld-dev/skilld.dev/pull/329) address the two HTML edge cache blockers below. #328 makes the shell user independent (blocker 1) and drops `User-Agent` from content negotiation (blocker 2). #329 turns on the edge cache for `/skills/trending` only, and adds `pnpm production:edge-cache` to prove it in production (the third reason). Check their state with `gh pr view <n> --repo skilld-dev/skilld.dev`. The text below records the analysis before those pull requests.

Googlebot makes about 290 requests a day. 58% are JavaScript and 73% are page resource loads. Skill page HTML is `private, no-store`. This note records what we changed and what we left alone.

## Edge cache for HTML: not shipped

A skill, repo or category page cannot go in a shared cache yet. Three reasons, in order of weight.

1. The rendered shell depends on sign-in state. `app.vue` calls `useAuth()`, and the Nuxt payload embeds `$snuxt-session`. Cloudflare serves a hit without running the Worker. A signed-in visitor would get the anonymous shell. `nuxt-auth-utils` refetches the session only when the request ran through a Nitro route cache (`payload.isCached`), so nothing repairs it on the client.
2. Content negotiation runs on these URLs. `Accept`, `Sec-Fetch-Dest` and `User-Agent` decide whether a request gets HTML or a 307 to the `.md` page (`vary: Accept, Sec-Fetch-Dest, User-Agent`). A URL-keyed hit would hand HTML to an agent that asked for Markdown. Whether Workers Cache honours that `Vary` is unverified.
3. Nothing local can measure it. `wrangler dev` has no edge cache, so a rule would ship untested.

The switch is one route rule (`edgeCache({ maxAge })` from `@harlan-zw/nuxt-cloudflare/cache`). `nuxt-skew-protection` guarantees chunks for 36,000 seconds, so the module would honour it up to that limit. The blockers are 1 and 2.

To unblock: make the shell user independent (the plan already written beside `skewProtection` in `nuxt.config.ts`), refetch the session on the client when the payload says anonymous, and prove `Vary` handling in production on one path first.

### Side finding

Some `/api` routes cache at the edge (`/api/clusters`, `/api/community`: `cf-cache-status: MISS`, then hit). `/api/skills` and `/api/skills/typeahead` answer `cf-cache-status: BYPASS` because they set a `nuxt-session` cookie, and a response that sets a cookie is never stored. Their `cloudflare-cdn-cache-control` rules do nothing today. Not changed here.

## Chunk graph

A `/gh` page preloaded 75 JS files (production shows 64 for a skill page). 38 of the 75 were under 3 KB, and 73 of the 154 files in the build were.

Chunk hashes are already stable. Two builds, one edit to a page: only the page chunk and the entry chunk (the route table names the page chunk) got new names. The other 152 files kept theirs. Old builds stay reachable through skew protection.

### Shipped: one shared vendor chunk

`vite.build.rolldownOptions.output.codeSplitting` gathers the small `node_modules` modules that two or more chunks share. Measured on `pnpm build` and `pnpm preview`, Chromium, cold cache, local D1:

| Page | Metric | Before | After |
| --- | --- | ---: | ---: |
| `/gh/<owner>/<repo>` | modulepreload files | 75 | 19 |
| | preload raw / gzip | 1167 / 390 KB | 1336 / 418 KB |
| | JS files loaded by the browser | 99 | 37 |
| `/skills/code-review` | modulepreload files | 59 | 11 |
| | preload raw / gzip | 982 / 331 KB | 1233 / 386 KB |
| | JS files loaded by the browser | 108 | 40 |
| `/` | modulepreload files | 58 | 10 |
| | preload raw / gzip | 1011 / 340 KB | 1261 / 395 KB |
| | JS files loaded by the browser | 107 | 39 |

The trade is 7 to 17% more preload bytes for 70 to 80% fewer requests. Bytes rise because pages now fetch shared vendor code they did not import before.

Churn after the change: a page edit rehashes the page and the entry chunk, as before. An edit to a shared app helper rehashed one file (the entry).

### Tried and rejected: also grouping app code

A second group for shared app modules cut a `/gh` page to 6 preloads. One edit to `app/utils/github-stars.ts` then produced 44 new chunk names. Every chunk that imports the shared app chunk names it by hash, so they all rehash. That costs more re-fetching per deploy than it saves.

### Left for later

- Split the 317 KB entry chunk. It rehashes on every deploy.
- Measure `PRODUCTION` after deploy: Googlebot's JavaScript share in Search Console crawl stats over the next 2 weeks.
