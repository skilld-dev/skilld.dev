## GitHub Integration: Implementation Plan

_Date: 2026-04-26 (revised after codebase audit + decisions)_
_Depends on: `plan-ceo.md` (E2 Receipts panel + E4 Activity feeds)_

## Goal

Build the data layer that powers two strategic features:
- **E2 Receipts panel**, verifiable per-skill provenance (counter to skills.sh "Security Audits: Pass" badges)
- **E4 Activity feeds**, "Recently published" + "Recently updated" surfaces on homepage, replacing install-count leaderboard

Both read the same GitHub-sync data layer.

## What already exists in this repo (don't rebuild)

| Capability | Where | Status |
|---|---|---|
| Curated publisher list (~50 orgs/users with `kind: 'org' \| 'user'`) | `server/data/official-repos.ts` | Done. Plays the role of `publishers`+`repos` tables. |
| Per-repo SKILL.md tree-walk + frontmatter parse | `scripts/sync-skills-gh.ts` | Done. Offline. SQL stdout via `gh` CLI. **Becomes the dev/backfill tool.** |
| Batch sync across all repos | `scripts/sync-skills-gh-all.sh` | Done. Same model. |
| Flat `skills` table with stars/forks/pushed_at/branch/description | `migrations/0001_skills.sql`, `migrations/0005_skills_repo_meta.sql` | Done. Keep flat. |
| D1 binding | `server/utils/db.ts` (`getDB(event)`) | Done. |
| Nitro scheduled task pattern | `server/tasks/refresh-curators.ts`, `nuxt.config.ts:105` (`*/10 * * * *`) | Done. New sync task slots in next to it. |
| Skill detail page reads | `server/api/skills/[...slug].get.ts` | Done. Already computes maturity, tier, branch, resolutionStatus. |

## Decisions (locked)

1. **Sync runtime: online cron in Worker.** New Nitro task next to `refresh-curators.ts`. Offline scripts kept as backfill tools.
2. **GitHub auth: fine-grained PAT in env (`GITHUB_TOKEN`).** ~50 repos × every 10 min × ~2 conditional requests ≈ 600 req/hr; PAT cap is 5000/hr. Reversible: swap to App later if scale demands. No App registration one-way door.
3. **Schema: layer additively.** Keep flat `skills(owner, name, ...)`. Add only `skill_revisions` and `activity`. No `publishers`/`repos` tables, the in-memory `officialRepos` array suffices and trust tier = `kind`.
4. **Receipts v1: minimal.** Only data already computable (commit URL, last-modified, author, references count). No public `/spec` yet, no frontmatter contract beyond what `sync-skills-gh.ts` already parses (`name`, `description`).

## Reusable patterns from npmx.dev (UI only)

| Pattern | Source | Reuse for |
|---|---|---|
| `ProvenanceDetails` interface | `npmx.dev/shared/types/npm-registry.ts:231` | `SkillProvenance` interface (GitHub-only fields) |
| `PackageProvenanceSection.vue` (shield-check icon, dl/dt/dd grid) | `npmx.dev/app/components/PackageProvenanceSection.vue` | Fork as `SkillReceiptsPanel.vue` |
| `ProvenanceBadge.vue` | `npmx.dev/app/components/ProvenanceBadge.vue` | `SkillReceiptsBadge.vue` for skill cards |
| `repoUrlToCommitUrl` / `repoUrlToBlobUrl` | `npmx.dev/server/utils/provenance.ts:74` | Lift verbatim. |
| `defineCachedEventHandler` wrapper (`maxAge`, `swr`, `getKey`) | `npmx.dev/server/api/registry/provenance/[...pkg].get.ts` | Wrap new endpoints. |

Server-side `parseAttestationToProvenanceDetails` pattern not needed: data comes from our own DB, not an external attestation service.

## New schema (additive)

```sql
-- migrations/0006_skill_revisions.sql
CREATE TABLE IF NOT EXISTS skill_revisions (
  owner            TEXT NOT NULL,
  name             TEXT NOT NULL,
  sha              TEXT NOT NULL,
  modified_at      INTEGER NOT NULL,           -- unix seconds
  author_login     TEXT,
  message          TEXT,
  PRIMARY KEY (owner, name, sha),
  FOREIGN KEY (owner, name) REFERENCES skills(owner, name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_skill_revisions_lookup
  ON skill_revisions (owner, name, modified_at DESC);

-- migrations/0007_activity.sql
CREATE TABLE IF NOT EXISTS activity (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  type             TEXT NOT NULL,              -- 'skill_published' | 'skill_updated'
  owner            TEXT NOT NULL,
  name             TEXT NOT NULL,
  occurred_at      INTEGER NOT NULL,           -- unix seconds
  sha              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_recent ON activity (occurred_at DESC, type);
CREATE INDEX IF NOT EXISTS idx_activity_skill  ON activity (owner, name);

-- migrations/0008_skills_revision_columns.sql  (extend, don't rewrite)
ALTER TABLE skills ADD COLUMN current_sha       TEXT;
ALTER TABLE skills ADD COLUMN modified_at       INTEGER;   -- last SKILL.md change
ALTER TABLE skills ADD COLUMN first_seen_at     INTEGER;   -- first time we indexed it
ALTER TABLE skills ADD COLUMN references_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN last_synced_at    INTEGER;
ALTER TABLE skills ADD COLUMN sync_status       TEXT;      -- 'ok' | 'failed'
ALTER TABLE skills ADD COLUMN last_tree_sha     TEXT;      -- per-repo, denormalized for short-circuit
```

`last_tree_sha` lives on `skills` rows for now (denormalized across all skills in a repo). If join cost becomes a problem, promote to a small `repo_state` table later.

## Sync architecture (online, in Worker)

```
┌──────────────────────────────────────────────────────────────┐
│ Nitro task: sync-github-skills, cron */10 * * * *            │
│                                                              │
│  for each (owner, repo) in officialRepos:                    │
│    1. GET /repos/{owner}/{repo}            (ETag)            │
│    2. if pushed_at unchanged → skip                          │
│    3. GET /git/trees/{branch}?recursive=1  (ETag)            │
│    4. if tree.sha == last_tree_sha → skip                    │
│    5. diff SKILL.md paths vs current skills(owner, name)     │
│    6. for each new/changed path:                             │
│       a. GET /commits?path={path}&since=last_synced  (or     │
│          cap at 30 commits on first sync)                    │
│       b. fetch raw SKILL.md, parse frontmatter               │
│       c. count files in references/ via tree                 │
│       d. UPSERT skills row (current_sha, modified_at, …)     │
│       e. INSERT skill_revisions rows (idempotent on PK)      │
│       f. INSERT activity row(s)                              │
│    7. update last_tree_sha, last_synced_at on all rows in    │
│       this (owner, repo)                                     │
└──────────────────────────────────────────────────────────────┘
```

**Three caching layers stack** (steady-state cost ≈ 2 conditional requests per repo per cycle):
1. HTTP ETag (304 doesn't count toward rate limit)
2. `pushed_at` short-circuit (skip whole repo)
3. `tree.sha` short-circuit (skip tree walk)

**ETag storage**: KV (`KV_CACHE` binding already configured). Key: `etag:{owner}/{repo}:{path}`.

**Octokit alternative**: use raw `fetch` with `If-None-Match` headers, parse JSON inline. Octokit pulls heavy deps; not needed for these endpoints. Wrap in `server/utils/github-client.ts`.

## Endpoints

All `defineCachedEventHandler`:

| Route | Purpose | Cache |
|---|---|---|
| `GET /api/skills/[...slug]` | Existing. Extend to read `current_sha`, `modified_at` from new columns. | unchanged |
| `GET /api/skills/[...slug]/receipts` | Receipts panel data | 15 min, swr |
| `GET /api/feed/recent-publishes` | Homepage feed | 1 min, swr |
| `GET /api/feed/recent-updates` | Homepage feed | 1 min, swr |

**Deferred**:
- `GET /api/skills/[...slug]/history` (E5 Skill Passport — data is in `skill_revisions` already, ship UI later)
- `GET /api/people/[handle]` (publisher detail page — Phase 3+)

## Implementation phases

### Phase 1: Foundation
- [ ] Mint `GITHUB_TOKEN` (fine-grained PAT, `public_repo` read), add to Worker secrets
- [ ] Migrations `0006_skill_revisions.sql`, `0007_activity.sql`, `0008_skills_revision_columns.sql`
- [ ] `server/utils/github-client.ts`, fetch wrapper with ETag-via-KV + rate-limit logging
- [ ] `server/utils/skill-frontmatter.ts`, share parser between online task and `scripts/sync-skills-gh.ts`

### Phase 2: Online sync task
- [ ] `server/tasks/sync-github-skills.ts`, mirror `refresh-curators.ts` shape
- [ ] Repo-level loop: pushed_at + tree.sha short-circuit
- [ ] Per-skill upsert + revision insert + activity emission
- [ ] Wire in `nuxt.config.ts` scheduledTasks (start at hourly, drop to 10-min after observing rate-limit headroom)
- [ ] Backfill: one-shot script `scripts/backfill-revisions.ts` that walks 30 days of commit history per skill on first run

### Phase 3: Receipts panel (E2)
- [ ] `shared/types/skill-provenance.ts` (lift shape from npmx.dev)
- [ ] `server/api/skills/[...slug]/receipts.get.ts`
- [ ] `app/components/SkillReceiptsPanel.vue` (fork `PackageProvenanceSection.vue`)
- [ ] `app/components/SkillReceiptsBadge.vue` (fork `ProvenanceBadge.vue`)
- [ ] Mount panel on `app/pages/skills/[...slug].vue`

### Phase 4: Activity feeds (E4)
- [ ] `server/api/feed/recent-publishes.get.ts`, `server/api/feed/recent-updates.get.ts`
- [ ] Replace "Popular skills" section in `app/pages/index.vue` with two activity rails
- [ ] Mount badge on cards in homepage + `app/pages/skills/index.vue`

### Phase 5: Polish
- [ ] Surface `last_synced_at` + `sync_status` in publisher UI (amber after >24h stale)
- [ ] Rate-limit observability: log `X-RateLimit-Remaining` per cron run
- [ ] Failure isolation: one repo's failure doesn't poison the rest of the cycle

## Risk register

| Risk | Mitigation |
|---|---|
| **Rate limit exhaustion** | ETag everywhere via `KV_CACHE`; tree-SHA short-circuit; observable quota; per-repo `sync_status: 'failed'` on error |
| **Worker CPU/time limits** | Cloudflare scheduled tasks have time caps. Process repos in batches with early bail; track cursor in KV. Not a problem at 50 repos but matters at 500. |
| **PAT revocation / leak** | Single-secret blast radius. Rotate via Worker secret, no code change. Document the rotation runbook. |
| **Skill rename / move** | Diff: paths in tree vs `skills(owner, name)`. On disappearance, look up commit history for old path; if `R` (rename) status found, update row instead of deleting. Otherwise: soft-delete (keep `broken_since`, existing column). |
| **Frontmatter malformed** | Parse leniently (existing behavior in `scripts/sync-skills-gh.ts`). Log warning. Index with directory name as fallback. |
| **Repo deletion / goes private** | Sync detects 404, sets `sync_status = 'failed'`. After 7-day grace (existing `BROKEN_GRACE_SECONDS` pattern in `skills-registry.ts`), fall off listings. |
| **Activity feed empty on launch** | Backfill script (Phase 2) seeds 30 days of `activity` rows from commit history before flipping homepage. |
| **Convention assumption** (SKILL.md not at directory root) | Existing script handles this (`segments[segments.length - 2]` as dir name). Carry behavior to online task. |
| **`last_tree_sha` denormalized across rows** | Acceptable: any row per `(owner, repo)` returns the same value. If repo has zero skills (initial state), short-circuit doesn't fire and full sync runs once, populating it. |

## Out of scope (explicitly)

- Public `/spec` page (defer; will become a one-way door when published)
- npm registry cross-reference
- Snyk / Socket / Trust Hub integrations
- GitHub webhooks (polling sufficient at current scale; revisit at >100 repos)
- Private repo support
- GitHub App registration (PAT now; revisit at scale)
- E5 Skill Passport public history page (data model supports it; UI deferred)
- Self-service publisher application flow

## Resolved open questions (from prior version)

1. ~~Storage backend?~~ Cloudflare D1, single binding (`DB` in `nuxt.config.ts:80`).
2. ~~Existing `scripts/sync-skills-gh.ts`?~~ Audited. Tree-walk + frontmatter parse + SQL stdout via `gh` CLI. Becomes dev/backfill tool; logic ports to online task.
3. ~~Cron host?~~ Nitro `scheduledTasks` already wired (`nuxt.config.ts:105`), `refresh-curators` runs every 10 min. Same pattern for sync.
4. ~~First publisher list?~~ ~50 already curated in `server/data/official-repos.ts`. No outreach needed for data layer; E4 (founding-curator program in `plan-ceo.md`) is a separate brand effort.

## Files

**New**:
- `server/utils/github-client.ts`
- `server/utils/skill-frontmatter.ts` (extracted; shared with offline script)
- `server/utils/sync-repo.ts` (testable core; called by both task and backfill script)
- `server/tasks/sync-github-skills.ts`
- `server/api/skills/[...slug]/receipts.get.ts`
- `server/api/feed/recent-publishes.get.ts`
- `server/api/feed/recent-updates.get.ts`
- `app/components/SkillReceiptsPanel.vue`
- `app/components/SkillReceiptsBadge.vue`
- `shared/types/skill-provenance.ts`
- `scripts/backfill-revisions.ts`
- Migrations: `0006_skill_revisions.sql`, `0007_activity.sql`, `0008_skills_revision_columns.sql`

**Modified**:
- `nuxt.config.ts`, add `sync-github-skills` to `scheduledTasks`
- `app/pages/index.vue`, replace "Popular skills" leaderboard with feeds
- `app/pages/skills/[...slug].vue`, mount Receipts panel
- `server/api/skills/[...slug].get.ts`, surface `current_sha`, `modified_at`, `references_count`
- `scripts/sync-skills-gh.ts`, refactor to import shared `skill-frontmatter.ts` + `sync-repo.ts` core; keep CLI shell

## Bottom line

The shape is small: a new Nitro task, two new tables, three new ALTERs, two endpoints, two Vue components ported from npmx.dev. Most of the data layer already exists. The two remaining one-way doors (`/spec` and GitHub App) are explicitly deferred. Ship Phase 1+2 in days; Phase 3+4 (the actual user-visible wedge) in another week.