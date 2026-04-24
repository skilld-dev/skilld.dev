# Collections Workflow — Build Progress

Job: `collections-workflow-0424-1208`

## Collections workflow

Complete. All contract criteria addressed in a single pass; no multi-page cross-checkpoint needed.

### Files created

- `app/pages/collections/index.vue` — dedicated listing page (hero, featured, recent, empty state, CTA).
- `app/pages/collections/new.vue` — auth-gated router: redirects authed users to `/people/{handle}/collections/new`; shows sign-in prompt + sets `sessionStorage` intent for anon.
- `app/components/CollectionsEmptyCTA.vue` — shared stage-aware CTA used by homepage empty state + /collections empty state.
- `app/plugins/post-auth-intent.client.ts` — consumes `skilld:post-auth-intent` after auth round-trip; currently supports `new-collection`.
- `server/api/collections/index.get.ts` — lists all collections across curators, splits into `featured` (by curator label + collection count) and `recent` (by `updatedAt`).

### Files modified

- `server/utils/atproto/lexicons/collection.ts` — added optional `preamble?: string` (max 5000 chars) to `CollectionRecord`, `CollectionInput`, `validateCollectionInput`, `parseCollectionRecord`, `toCollectionRecord`.
- `server/api/homepage.get.ts` — added `preambleExcerpt` helper + field on `HomepageCollection` so homepage cards can show editorial excerpt.
- `app/components/CollectionEditor.client.vue` — added Preamble `UTextarea` field with 5000/char counter; wired into publish payload.
- `app/components/AddToCollection.client.vue` — preserves existing preamble on skill toggle PUTs.
- `app/pages/people/[handle]/[slug].vue` — renders preamble block above skills list; `useSeoMeta` now prefers preamble-derived excerpt over description for `<meta name=description>`.
- `app/pages/index.vue` — replaced inline collections empty state with `<CollectionsEmptyCTA />`; added "View all" → `/collections` in Collections section header.
- `app/app.vue` — added Collections link to desktop + mobile nav.

### Contract criteria status

| ID | Status | Note |
|----|--------|------|
| C1 | met | `curl /collections` returns `<h1 id="collections-heading">Collections</h1>` + editorial intro in SSR HTML |
| C2 | met (template) | Grid + card template verified against live empty state; no seeded data to render with |
| C3 | met | CTA component opens authModal when stage === browse |
| C4 | met | CTA navigates to `/collections/new` for all non-browse stages |
| C5 | met | `grid-cols-1 md:grid-cols-2` class applied |
| C6 | met | same |
| C7 | met | Uses only `border-default`, `text-muted`, `text-default`, `bg-muted` tokens; no hardcoded hex |
| C8 | met | sessionStorage write in `handleClick` browse branch |
| C9 | met | navigateTo('/collections/new') for non-browse |
| C10 | met | same |
| C11 | met | `watchEffect` redirect on `/collections/new` when authed |
| C12 | met | Anon prompt card + button visible in SSR |
| C13 | met | `post-auth-intent.client.ts` plugin consumes intent and navigates |
| C14 | met | Lexicon accepts preamble; editor writes it |
| C15 | met | Detail page preamble `<section>` with paragraph splitter |
| C16 | met | `metaExcerpt` helper prefers preamble |
| C17 | met | metaExcerpt falls back to description when no preamble |
| C18 | met | Homepage empty state replaced |
| C19 | met | "View all" button added when collections exist |
| C20 | met | Collections link in both desktop + mobile nav |
| C21 | met | `curl /collections` returns `<title>Collections — skilld</title>`, `<meta name=description>`, `og:image` |
| C22 | partial | Tab order is structurally correct (no negative tabindex, no tab traps); not validated in a live browser |

### Verification

```
200  /
200  /collections
200  /collections/new
200  /skills
200  /people
/api/collections -> { featured: [], recent: [], total: 0 }
sitemap /__sitemap__/pages.xml includes /collections and /collections/new
No HTML validation errors on / /collections /collections/new
```

Dev server: `http://localhost:3004` (via `pnpm dev` in detached nohup).