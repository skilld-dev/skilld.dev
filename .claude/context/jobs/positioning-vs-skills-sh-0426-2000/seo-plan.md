# SEO Plan: Editorial Collections as the Indexable Unit

_Date: 2026-04-26_
_Strategy: `plan-ceo.md`_
_Builds on: `curator-notes-plan.md`, `network-feed-plan.md`, `github-integration-plan.md`_

## Goal

Turn skilld's unique editorial substance — curator collections with named-author quotes — into a long-tail organic traffic engine. Every collection page (`/people/{handle}/{slug}`) becomes an indexable editorial article. New aggregation hub pages (`/stacks/{stack}`) capture stack-level queries that no individual collection ranks for.

The thesis: skills.sh ranks for "{skill} install count". Skilld ranks for "best Claude skills for {stack}", "{curator} collection", "Claude vue 3 skill SSR" — long-tail editorial queries that only unique content wins.

## What already exists (audit)

| Surface | Status | Notes |
|---|---|---|
| Collection page `useSeoMeta` | ✅ done | Title from name, description from `metaExcerpt(preamble, description)` |
| Collection page `defineOgImage` | ✅ done | Takumi-rendered card with curator avatar + skills |
| Collections in sitemap | ✅ done | `server/api/__sitemap__/people.ts` walks all curators × all rkeys |
| People sitemap | ✅ done | `/people/{handle}` |
| Skills sitemap | ✅ done | `__sitemap__/skills.ts` |
| Orgs sitemap | ✅ done | `__sitemap__/orgs.ts` |
| Skill page `useSchemaOrg` | ✅ rich | `SoftwareApplication`, `HowTo`, `FAQPage`, `AggregateRating` |
| Skill page OG image | ✅ done | |
| Curator notes display on skill page | ✅ done | `app/pages/skills/[...slug].vue:1093` |
| `/stacks/*` routes | ❌ missing | Greenfield aggregation layer |
| Collection page `useSchemaOrg` | ❌ missing | Biggest gap — editorial unit has no JSON-LD |
| Per-skill `Review` schema (using curator notes as `reviewBody`) | ❌ missing | Direct rich-result win |

## The strategic gap

The collection page is the **editorial unit** of skilld. It carries:
- A named author (curator profile)
- A long-form preamble
- A curated list of skills with reasons
- Stack tags
- A unique permanent URL

This is the exact shape of an `Article` with embedded `Review`s. Today it ships as plain HTML. Adding JSON-LD turns each curator's quote into a SERP-eligible review snippet — content skills.sh structurally cannot generate.

## What to build (3 buckets)

### Bucket 1: Collection page polish (the highest-leverage win)

#### 1.1 JSON-LD `Article` + `ItemList` + `Review`

Add `useSchemaOrg` to `app/pages/people/[handle]/[slug].vue`. Composite of three node types:

```ts
useSchemaOrg(computed(() => {
  if (!data.value) return []
  const d = data.value.record
  const url = `https://skilld.dev/people/${handle.value}/${slug.value}`
  return [
    defineArticle({
      '@id': `${url}#article`,
      'headline': d.name,
      'description': metaExcerpt(d.preamble, d.description),
      'articleBody': d.preamble || d.description,
      'datePublished': d.createdAt,
      'dateModified': d.updatedAt,
      'author': {
        '@type': 'Person',
        'name': profile.value?.displayName || handle.value,
        'url': `https://skilld.dev/people/${handle.value}`,
        'identifier': `https://bsky.app/profile/${handle.value}`,
      },
      'about': d.stacks.map(s => ({ '@type': 'Thing', 'name': s })),
    }),
    {
      '@type': 'ItemList',
      '@id': `${url}#list`,
      'itemListElement': d.skills.map((s, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'item': {
          '@type': 'SoftwareApplication',
          'name': s.packageName,
          'url': skillPageUrl(s),
          ...(s.reason ? {
            review: {
              '@type': 'Review',
              'reviewBody': s.reason,
              'author': { '@type': 'Person', 'name': handle.value },
            },
          } : {}),
        },
      })),
    },
  ]
}))
```

**Why this matters**: Google's rich results for review-bearing items show `"<reason>" — by @handle` directly in SERP. Curator quotes become organic ad copy.

#### 1.2 H1/H2 hierarchy audit

Current page: `<h1>{collection name}</h1>` then `<h2 id="preamble-heading">` then skill cards. Verify:
- One `<h1>` per page (it's the collection name)
- `<h2>` for "About this collection" (preamble), "Skills in this collection", "Discussion" (Bluesky thread)
- Each skill in the list gets `<h3>` with the skill name

Helps both SEO and a11y.

#### 1.3 Anchor text density

Today: skill cards likely link to `/skills/{slug}` with the skill name as anchor. Audit and ensure:
- Skill name in card → link to `/skills/{slug}` (anchor: skill name)
- Skill `owner/repo` sub-line → link to `/orgs/{owner}` (anchor: owner name)
- Stack tags → link to **new** `/stacks/{stack}` pages (anchor: stack name)
- Curator name in header → link to `/people/{handle}` (anchor: display name + handle)

Internal anchor diversity (skill name, owner name, stack name) signals topical relevance. Don't over-optimize; just wire what exists.

#### 1.4 Related collections section

At the bottom of every collection page, render:
- Other collections by the same curator (3 max)
- Other collections sharing 2+ stack tags (3 max)

Boosts internal link graph, deepens crawl, increases time-on-site. Existing curator + collection data covers this with a single query.

#### 1.5 Canonical URL stability

Collection rkeys are TIDs (timestamp identifiers). Handle is a Bluesky handle. **Risk**: handle changes break URLs.

Audit: when a curator's handle changes (Bluesky lets you), do existing collection URLs 301 to the new handle? If not:
- Redirect middleware: `/people/{old-handle}/*` → `/people/{new-handle}/*` if DID matches
- Canonical tag in head pointing to current-handle URL

Defer the redirect if not yet hit by handle changes; **always** set canonical now.

### Bucket 2: Framework hub pages (greenfield aggregation)

New routes: `app/pages/stacks/[slug].vue` (e.g. `/stacks/nuxt`, `/stacks/vue`, `/stacks/react`, `/stacks/svelte`, `/stacks/typescript`).

#### 2.1 Page anatomy

```
[Hero]
  H1: "Claude skills for {stack}"
  Hand-written 2–3 paragraph editorial intro

[Featured skills section]
  Skills tagged with this stack (from publishers + curator collections)
  Sorted: most-recently-picked-by-curators

[Featured collections section]
  Collections with this stack tag
  Card: curator avatar + name + collection title + first reason quote

[Recent picks for {stack}]
  Activity feed filtered to this stack

[Curators of {stack}]
  Curators who have collections tagged with this stack
```

#### 2.2 Content sources

All from existing data:
- Stack tag exists on `dev.skilld.collection.stacks[]`
- Skills have implicit stack via owner/repo + frontmatter (use a static map for v1: `nuxt-skills/* → nuxt`)
- Curators surfaced via collection authors

#### 2.3 SEO surface

```ts
useSeoMeta({
  title: `Claude skills for {stack} — picked by named curators`,
  description: `{N} curators have picked {M} {stack} skills. Read their notes and install with one command.`,
})
defineOgImage('Stack.takumi', { stack, skillCount, curatorCount })
useSchemaOrg(computed(() => [
  defineArticle({ … }),
  { '@type': 'CollectionPage', mainEntity: { '@type': 'ItemList', … } },
]))
```

#### 2.4 Hand-curated intros (non-engineering)

Each hub page needs a 2–3 paragraph editorial intro written by hand. Don't generate. Don't AI-write. The whole point of skilld is named editorial taste — applies at the hub level too.

Suggested first 5 hubs:
- `/stacks/nuxt`
- `/stacks/vue`
- `/stacks/react`
- `/stacks/typescript`
- `/stacks/tailwindcss`

Pick stacks where (a) the existing collection corpus has coverage and (b) Google search volume is meaningful. Add more as content grows.

#### 2.5 Sitemap inclusion

```ts
// server/api/__sitemap__/stacks.ts
const STACKS = ['nuxt', 'vue', 'react', 'typescript', 'tailwindcss']
export default defineSitemapEventHandler(() =>
  STACKS.map(slug => ({ loc: `/stacks/${slug}`, changefreq: 'weekly' as const }))
)
```

### Bucket 3: Internal link graph

Skilld's link graph today is mostly **publisher-shaped** (skill ← skill detail page). Adding the editorial graph means every page has reciprocal links.

#### 3.1 Skill page → collections including it

Already exists (`Picked by` panel). Verify:
- Each entry links to `/people/{handle}/{slug}`
- Anchor text includes both handle and collection name
- Reasons render in HTML body (not just JS-injected) so Google indexes them

#### 3.2 Skill page → stack hubs

When a skill has stack tags (via collection membership or owner heuristic):
- New section: "Stack" with chips linking to `/stacks/{slug}`

#### 3.3 Person page → all their collections + skills picked

Already exists. Verify:
- Anchor text uses collection names
- Skills picked across collections aggregate at the person level (deduplicated)

#### 3.4 Cross-links from homepage

Add a "Browse by stack" section on homepage that links to `/stacks/*`. Most direct way to push PageRank to new hub pages from the highest-authority page.

## Per-bucket effort + impact

| Bucket | Effort | Impact | Order |
|---|---|---|---|
| 1.1 Collection JSON-LD | S (1 day) | HIGH | First |
| 1.4 Related collections | S (0.5 day) | MED | First |
| 3.4 Homepage stack links | S (0.5 day) | MED | First (after 2.x) |
| 1.3 Anchor text audit | S (0.5 day) | MED | Anytime |
| 2.x Framework hubs | M (1 week incl. hand-written intros) | HIGH | Second |
| 1.2 H1/H2 audit | S | LOW | Anytime |
| 1.5 Canonical / handle redirects | M | LOW (until first incident) | Defer until needed |
| 3.1–3.3 Link graph polish | S–M | MED | Bundle with hubs |

## Phases

### Phase 1: Collection schema + polish (~3 days)
- [x] `useSchemaOrg` on collection page (Article + ItemList + per-skill Review)
- [x] Related collections section (same curator, shared stacks)
- [x] Anchor text audit on collection cards (skill name → /skills/{slug}, owner → /orgs/{owner}; stack chips deferred until /stacks/* exist)
- [x] H1/H2 hierarchy verification (h3 added to skill names; h1 + h2s already correct)
- [x] Canonical tag on every collection page

### Phase 2: Framework hubs (~1 week)
- [ ] `app/pages/stacks/[slug].vue` route
- [ ] `server/api/stacks/[slug].get.ts` aggregator (skills + collections + curators by stack)
- [ ] OG image template `Stack.takumi`
- [ ] JSON-LD (Article + CollectionPage + ItemList)
- [ ] Sitemap entry
- [ ] Hand-written intros for first 5 stacks
- [ ] Homepage "Browse by stack" section

### Phase 3: Link graph completion (~2–3 days)
- [ ] Skill page → stack chips
- [ ] Person page aggregated picks (deduped across collections)
- [ ] Verify reasons render server-side (not JS-injected) on skill detail page

### Phase 4: Measurement (~1 day, ongoing)
- [ ] GSC: register `/stacks/*` URL pattern, monitor impressions
- [ ] Track per-collection impressions/clicks (compare to baseline `skilld` brand query)
- [ ] Identify which stacks attract traffic; expand the hub roster from there

## Risk register

| Risk | Mitigation |
|---|---|
| **Review schema spam flag from Google** if curator notes are low-quality | Filter: only include `Review` JSON-LD entries when reason is ≥ 20 chars and curator passes `isProfileFlagged`. Quality gate at the JSON-LD layer. |
| **Thin content on framework hubs at launch** (few skills tagged for new stacks) | Hand-written editorial intro carries the page even with sparse data. Don't launch a hub with <3 collections or <5 skills indexed. |
| **Duplicate / canonical issues** between `/people/{handle}/{slug}` and any aliased route | Set canonical explicitly; ensure no other route renders the same content. |
| **Stack tag quality** (curators write inconsistent tags: `Nuxt 3` vs `nuxt`) | Normalize at read time (lowercase, strip-version, slugify) for hub matching. Display original tag on collection page; map to slug for hub aggregation. |
| **Bluesky handle changes** breaking collection URLs | Phase 1.5: canonical points to current handle; redirect middleware planned but deferred until first incident. |
| **AI-generated SEO content temptation** | Explicit no: hub intros are hand-written. The brand thesis is named editorial taste — applies to every surface, including hubs. |
| **Reasons rendered client-side only** | Audit: ensure curator notes appear in the server-rendered HTML, not injected after hydration. JSON-LD `reviewBody` must match visible text. |

## Out of scope

- Comparison pages (`/compare/vue-vs-react`) — long-tail but slow burn, defer
- Per-skill changelog pages from `skill_revisions` (E5 Skill Passport) — separate plan
- Multilingual SEO — defer
- Dynamic OG image variants per query parameter — overkill
- Backlink outreach / paid SEO tactics — out of scope

## Bottom line

The work is mostly **schema-org markup + 5 hand-written hub pages + tightening internal links**. No new lexicons, no new infrastructure, no new dependencies. Collection pages already have OG cards and sitemap inclusion; adding JSON-LD turns them into rich-result-eligible editorial articles.

This compounds permanently. Every collection a curator writes becomes a long-tail landing page. The editorial moat skilld is building (curator notes, named authors, verifiable provenance) becomes machine-readable to Google, which is the only way long-tail traffic finds it.

The framework hubs are the bonus: 5 hand-written editorial pages capture all the "best Claude skills for {stack}" queries that no individual collection ranks for. Each hub takes a day to write well; pays back forever.