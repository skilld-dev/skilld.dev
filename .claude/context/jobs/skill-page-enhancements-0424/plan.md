# Skill page enhancements — heavy-processing plan

## Shipped (v1, this branch)

- JSON-LD: `SoftwareApplication` + `HowTo` on every skill page
- Capability/trust panel: scopes (read/write/exec/net), MCP servers, model, collapsible full tool list + other frontmatter
- Maturity indicators: first-seen date, active/steady/dormant cadence badge (computed server-side, 30/180 day thresholds)
- Mini-changelog: last 5 commits touching SKILL.md via GitHub API (`api.github.com/repos/:o/:r/commits?path=...`), cached 12h
- Other skills by owner: `findRelatedSkills.sameOwner`, 6 items
- Similar skills (v1): same-repo siblings via `findRelatedSkills.sameRepo`, 6 items

## Deferred — needs planning

These all need either a batch pipeline, external API access, or cross-skill analysis that doesn't fit the per-request model. Each one is a separate build.

---

### 1. Auto-generated FAQ (SEO-critical)

**Goal:** 4–6 Q&As per skill page, rendered with `FAQPage` JSON-LD. Captures long-tail queries ("does X need an API key", "what models does X support").

**Pipeline:**
1. Batch job reads `raw` SKILL.md + frontmatter for each skill
2. Haiku 4.5 call per skill with a fixed prompt: `{role, principles: "derive 4-6 natural FAQs from this skill's README"}`. Cache by SKILL.md sha
3. Store in D1: new table `skill_faqs (owner, repo, name, sha, faqs JSON, generated_at)`
4. Invalidation: regenerate when SKILL.md sha changes (detected on repo-tree refresh)
5. Page fetches FAQs alongside existing `/api/skills/:slug` response

**Open questions:**
- Where does batch run? GitHub Action on cron, or Cloudflare cron-triggered Worker using Claude SDK directly?
- Budget: ~80k skills × 1 Haiku call ≈ $50 at current prices. Acceptable for first pass; incremental cost is near-zero
- Quality gate: reject generations with <3 Qs or obvious hallucinations (validate mentions frontmatter keys)

**Output surfaces:**
- Accordion on page between capability and content sections
- `FAQPage` JSON-LD injected alongside existing schema

---

### 2. Collection co-occurrence ("commonly paired with")

**Goal:** "Curators who added this skill also added X, Y, Z". The strongest similarity signal we have.

**Pipeline:**
1. Build co-occurrence matrix at curator-index refresh time (already every 5 min via endorsement-map)
2. For each skill pair (A, B) where both appear in ≥1 collection, count distinct collections containing both. Normalize by total appearances (Jaccard or PMI)
3. Store top-10 neighbors per skill in KV: `skill:pairs:{name}` → `[{name, score}, ...]`
4. Surface as "Commonly paired with" section below same-repo siblings

**Complexity:** O(n²) naive, but sparse — most skills co-occur with few others. With ~80k skills and few hundred collections, the matrix is trivially small. Rebuild fully each time.

**Invalidation:** piggyback on endorsement-map TTL (5 min)

**Edge cases:**
- Single-curator echo chambers: require ≥2 distinct curators
- Popular-skill dominance: normalize by popularity (PMI > raw count)

---

### 3. Embedding-based similarity (fallback when co-occurrence empty)

**Goal:** For skills with no collection signal, find semantically similar ones by embedding the description + first 500 chars of SKILL.md.

**Pipeline:**
1. Batch embed via Voyage/OpenAI text-embedding-3-small (~$0.02 per 1M tokens, ~$2 total)
2. Store as R2 blob or D1 BLOB column; index with a small in-memory kNN at query time, or use vectorize (Cloudflare) for serverless ANN
3. On page render: cheap cosine against precomputed neighbor list

**Decision to make:** store top-10 neighbors precomputed (no vector DB needed) vs. query-time ANN. Pre-computed is simpler and fits our read pattern. Go with that.

---

### 4. Taxonomy / tags

**Goal:** `/skills/tag/react`, `/skills/tag/testing` hubs. Drives internal link graph and category-level SEO.

**Pipeline:**
- Classifier (Haiku) assigns 1–3 tags from a fixed taxonomy (~30 tags). Cached by SKILL.md sha
- Render tag chips on skill page, linking to `/skills/tag/:tag`
- Needs tag landing page template (separate feature)

**Order:** do after FAQ pipeline — same infra (batch Haiku + sha-keyed cache), so second deployment is cheap.

---

## Build order

1. **FAQ pipeline first.** Highest SEO leverage, establishes the batch-Haiku + sha-cache pattern we'll reuse.
2. **Collection co-occurrence.** No external API, pure data work. Small scope.
3. **Taxonomy tags.** Reuses #1 infra. Unlocks tag hub pages (separate scope).
4. **Embedding similarity.** Only if co-occurrence coverage is <60% of active skills.

## Shared infra to build once

- `server/jobs/` directory convention for cron-triggered batch tasks
- `skill_generated` table: `(owner, repo, name, sha, kind, payload JSON, generated_at)` — one table for FAQ, tags, embeddings; `kind` discriminates
- Sha detection on repo-tree refresh: if SKILL.md sha changed since last `generated_at`, mark dirty and re-enqueue
- Claude SDK wrapper with prompt caching for the system prompt (5-min TTL covers a batch of many skills)